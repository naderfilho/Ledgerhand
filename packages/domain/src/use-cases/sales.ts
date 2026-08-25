import { z } from 'zod'
import { addDays, businessDateSchema, type BusinessDate } from '../kit/business-date.js'
import { domainEvent } from '../events/domain-event.js'
import type { ExecutionContext } from '../context/execution-context.js'
import { domainError, notFound, type DomainError } from '../kit/errors.js'
import {
  asId,
  type CustomerId,
  type FiscalDocumentId,
  type ProductId,
  type ReceivableId,
  type SalesOrderId,
  type SalesOrderItemId,
} from '../kit/ids.js'
import {
  formatMoney,
  nonNegativeMoneySchema,
  splitMoney,
  ZERO_MONEY,
  type Money,
} from '../kit/money.js'
import { formatQuantity, negateQuantity, positiveQuantitySchema } from '../kit/quantity.js'
import { collect, err, ok, type Result } from '../kit/result.js'
import { formatUnitValue, positiveUnitPriceSchema, type UnitCost } from '../kit/unit-value.js'
import { today } from '../context/execution-context.js'
import type { Customer } from '../model/party.js'
import type { Receivable } from '../model/finance.js'
import { DEFAULT_FISCAL_SERIES, formatFiscalNumber, type FiscalDocument } from '../model/fiscal.js'
import {
  cancelSalesOrder as cancelSalesOrderState,
  confirmSalesOrder as confirmSalesOrderState,
  invoiceSalesOrder as invoiceSalesOrderState,
  lineTotal,
  requireEditable,
  salesOrderTotal,
  SALES_ORDER_STATUSES,
  type SalesOrder,
  type SalesOrderItem,
} from '../model/sales-order.js'
import { applyEntry, applyExit, applyReservation, releaseReservation } from '../model/stock.js'
import { defineUseCase } from './definition.js'
import { recordMovement } from './stock.js'

const itemInputSchema = z.object({
  productId: z.uuid(),
  quantity: positiveQuantitySchema,
  /** Defaults to the catalogue price, so an agent does not have to invent one. */
  unitPrice: positiveUnitPriceSchema.optional(),
  discount: nonNegativeMoneySchema.optional(),
  description: z.string().trim().max(200).optional(),
})

interface BuiltItems {
  readonly items: readonly SalesOrderItem[]
  readonly total: Money
}

async function buildItems(
  context: ExecutionContext,
  inputs: readonly z.output<typeof itemInputSchema>[],
): Promise<Result<BuiltItems, DomainError>> {
  const productIds = inputs.map((item) => asId<ProductId>(item.productId))
  const products = await context.uow.products.findManyByIds(productIds)

  const built = collect(
    inputs.map((input): Result<SalesOrderItem, DomainError> => {
      const productId = asId<ProductId>(input.productId)
      const product = products.get(productId)
      if (product === undefined) return err(notFound('Product', input.productId))
      if (!product.active) {
        return err(
          domainError(
            'PRODUCT_ARCHIVED',
            `Product ${product.sku} is archived and can no longer be sold.`,
            { productId: product.id, sku: product.sku },
          ),
        )
      }

      const unitPrice = input.unitPrice ?? product.salePrice
      const discount = input.discount ?? ZERO_MONEY
      const total = lineTotal(input.quantity, unitPrice, discount)
      if (total < 0n) {
        return err(
          domainError(
            'VALIDATION_FAILED',
            `The discount on ${product.sku} is larger than the line total.`,
            { sku: product.sku, discount: formatMoney(discount) },
          ),
        )
      }

      return ok({
        id: asId<SalesOrderItemId>(context.uow.ids.next()),
        productId: product.id,
        sku: product.sku,
        description: input.description ?? product.name,
        quantity: input.quantity,
        unitPrice,
        discount,
        total,
        unitCostAtInvoice: null,
      })
    }),
  )

  if (!built.ok) return built
  return ok({ items: built.value, total: salesOrderTotal(built.value) })
}

async function loadOrder(
  context: ExecutionContext,
  orderId: string,
): Promise<Result<SalesOrder, DomainError>> {
  const order = await context.uow.salesOrders.findById(asId<SalesOrderId>(orderId))
  return order === null ? err(notFound('Sales order', orderId)) : ok(order)
}

async function loadCustomer(
  context: ExecutionContext,
  customerId: CustomerId,
): Promise<Result<Customer, DomainError>> {
  const customer = await context.uow.customers.findById(customerId)
  return customer === null ? err(notFound('Customer', customerId)) : ok(customer)
}

export const createSalesOrder = defineUseCase({
  name: 'create_sales_order',
  title: 'Create sales order',
  summary:
    'Creates a sales order in draft status with its items. Unit prices default to the catalogue price when omitted. Creating a draft neither reserves nor moves stock -- confirm_sales_order does that -- so it always succeeds even when stock is short.',
  capability: 'sales:write',
  risk: 'write',
  inputSchema: z.object({
    customerId: z.uuid(),
    issuedOn: businessDateSchema.optional(),
    instalments: z.number().int().min(1).max(12).default(1),
    notes: z.string().trim().max(1000).nullish(),
    items: z.array(itemInputSchema).min(1, 'A sales order needs at least one item.'),
  }),
  execute: async (input, context) => {
    const customerId = asId<CustomerId>(input.customerId)
    const customer = await loadCustomer(context, customerId)
    if (!customer.ok) return customer

    const built = await buildItems(context, input.items)
    if (!built.ok) return built

    const sequence = await context.uow.sequences.next('sales_order')
    const order: SalesOrder = {
      id: asId<SalesOrderId>(context.uow.ids.next()),
      tenantId: context.tenantId,
      number: `SO-${String(sequence).padStart(6, '0')}`,
      customerId,
      status: 'draft',
      issuedOn: input.issuedOn ?? today(context),
      items: built.value.items,
      total: built.value.total,
      instalments: input.instalments,
      notes: input.notes ?? null,
      confirmedAt: null,
      invoicedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      fiscalDocumentId: null,
      createdAt: context.now,
      updatedAt: context.now,
    }

    await context.uow.salesOrders.save(order)
    context.uow.events.record(
      domainEvent('sales_order.created', 'sales_order', order.id, {
        orderId: order.id,
        number: order.number,
        customerId,
        total: formatMoney(order.total),
      }),
    )

    return ok(order)
  },
})

export const updateSalesOrderItems = defineUseCase({
  name: 'update_sales_order_items',
  title: 'Update sales order items',
  summary:
    'Replaces the item list of a draft sales order. Confirmed and invoiced orders are frozen: cancel and re-issue instead.',
  capability: 'sales:write',
  risk: 'write',
  inputSchema: z.object({
    orderId: z.uuid(),
    items: z.array(itemInputSchema).min(1, 'A sales order needs at least one item.'),
  }),
  execute: async (input, context) => {
    const loaded = await loadOrder(context, input.orderId)
    if (!loaded.ok) return loaded
    const editable = requireEditable(loaded.value)
    if (!editable.ok) return editable

    const built = await buildItems(context, input.items)
    if (!built.ok) return built

    const updated: SalesOrder = {
      ...loaded.value,
      items: built.value.items,
      total: built.value.total,
      updatedAt: context.now,
    }

    await context.uow.salesOrders.save(updated)
    context.uow.events.record(
      domainEvent('sales_order.items_updated', 'sales_order', updated.id, {
        orderId: updated.id,
        number: updated.number,
        total: formatMoney(updated.total),
        itemCount: updated.items.length,
      }),
    )

    return ok(updated)
  },
})

export const confirmSalesOrder = defineUseCase({
  name: 'confirm_sales_order',
  title: 'Confirm sales order',
  summary:
    'Confirms a draft order and reserves the stock for it. Fails with INSUFFICIENT_STOCK, naming the product and the shortfall, if any line cannot be covered by what is available. Nothing is reserved when any line fails: the order stays a draft.',
  capability: 'sales:write',
  risk: 'write',
  inputSchema: z.object({ orderId: z.uuid() }),
  execute: async (input, context) => {
    const loaded = await loadOrder(context, input.orderId)
    if (!loaded.ok) return loaded

    const transitioned = confirmSalesOrderState(loaded.value, context.now)
    if (!transitioned.ok) return transitioned
    const order = transitioned.value

    // Reserve every line before writing anything: a partially reserved order
    // is worse than a rejected one.
    const reservations = []
    for (const item of order.items) {
      const balance = await context.uow.stock.getBalanceForUpdate(item.productId)
      const reserved = applyReservation(balance, item.quantity, item.sku, context.now)
      if (!reserved.ok) return reserved
      reservations.push({ item, balance: reserved.value })
    }

    for (const reservation of reservations) {
      await context.uow.stock.saveBalance(reservation.balance)
      context.uow.events.record(
        domainEvent('stock.reserved', 'stock', reservation.item.productId, {
          productId: reservation.item.productId,
          sku: reservation.item.sku,
          quantity: formatQuantity(reservation.item.quantity),
          reservedAfter: formatQuantity(reservation.balance.reserved),
        }),
      )
    }

    await context.uow.salesOrders.save(order)
    context.uow.events.record(
      domainEvent('sales_order.confirmed', 'sales_order', order.id, {
        orderId: order.id,
        number: order.number,
        total: formatMoney(order.total),
      }),
    )

    return ok(order)
  },
})

function receivableDueDate(
  invoicedOn: BusinessDate,
  paymentTermDays: number,
  instalment: number,
): BusinessDate {
  return addDays(invoicedOn, paymentTermDays + 30 * (instalment - 1))
}

export const invoiceSalesOrder = defineUseCase({
  name: 'invoice_sales_order',
  title: 'Invoice sales order',
  summary:
    'Invoices a confirmed order: issues the fiscal document with the next sequential number, ships the stock, and generates the receivables according to the customer payment term. Classified destructive because it consumes a fiscal number that can never be reused and can only be undone through a full reversal.',
  capability: 'sales:invoice',
  risk: 'destructive',
  inputSchema: z.object({
    orderId: z.uuid(),
    series: z.string().trim().max(3).default(DEFAULT_FISCAL_SERIES),
  }),
  execute: async (input, context) => {
    const loaded = await loadOrder(context, input.orderId)
    if (!loaded.ok) return loaded
    const confirmed = loaded.value

    const customer = await loadCustomer(context, confirmed.customerId)
    if (!customer.ok) return customer

    const sequence = await context.uow.sequences.next(`fiscal:${input.series}`)
    const documentId = asId<FiscalDocumentId>(context.uow.ids.next())

    const transitioned = invoiceSalesOrderState(confirmed, documentId, context.now)
    if (!transitioned.ok) return transitioned

    // Ship every line, capturing the cost the goods left with.
    const shippedItems: SalesOrderItem[] = []
    for (const item of confirmed.items) {
      const balance = await context.uow.stock.getBalanceForUpdate(item.productId)
      const released = releaseReservation(balance, item.quantity, context.now)
      if (!released.ok) return released
      const shipped = applyExit(released.value, item.quantity, item.sku, context.now)
      if (!shipped.ok) return shipped

      const product = await context.uow.products.findById(item.productId)
      if (product === null) return err(notFound('Product', item.productId))

      await recordMovement(context, {
        product,
        balanceBefore: balance,
        balanceAfter: shipped.value.balance,
        kind: 'exit',
        reason: 'sales_invoice',
        signedQuantity: negateQuantity(item.quantity),
        unitCost: balance.averageCost,
        totalCost: shipped.value.totalCost,
        reference: { kind: 'sales_order', id: confirmed.id },
        note: null,
      })

      context.uow.events.record(
        domainEvent('stock.exit_registered', 'stock', item.productId, {
          productId: item.productId,
          sku: item.sku,
          quantity: formatQuantity(item.quantity),
          unitCost: formatUnitValue(balance.averageCost),
          totalCost: formatMoney(shipped.value.totalCost),
          onHandAfter: formatQuantity(shipped.value.balance.onHand),
          reason: 'sales_invoice',
        }),
      )

      shippedItems.push({ ...item, unitCostAtInvoice: balance.averageCost })
    }

    const invoicedOn = today(context)
    const document: FiscalDocument = {
      id: documentId,
      tenantId: context.tenantId,
      series: input.series,
      number: formatFiscalNumber(sequence),
      salesOrderId: confirmed.id,
      customerId: confirmed.customerId,
      total: confirmed.total,
      status: 'issued',
      issuedAt: context.now,
      cancelledAt: null,
      cancellationReason: null,
      pdfPath: null,
    }
    await context.uow.fiscal.save(document)

    // Split the total so the instalments always add back up to it exactly.
    const amounts = splitMoney(confirmed.total, confirmed.instalments)
    const receivables: Receivable[] = amounts.map((amount, index) => ({
      id: asId<ReceivableId>(context.uow.ids.next()),
      kind: 'receivable',
      tenantId: context.tenantId,
      customerId: confirmed.customerId,
      salesOrderId: confirmed.id,
      amount,
      settledAmount: ZERO_MONEY,
      issuedOn: invoicedOn,
      dueDate: receivableDueDate(invoicedOn, customer.value.paymentTermDays, index + 1),
      status: 'open',
      description: `Sales order ${confirmed.number} - ${document.series}${document.number}`,
      instalment: index + 1,
      instalments: confirmed.instalments,
      createdAt: context.now,
      updatedAt: context.now,
    }))

    for (const receivable of receivables) {
      await context.uow.finance.saveReceivable(receivable)
      context.uow.events.record(
        domainEvent('receivable.created', 'receivable', receivable.id, {
          receivableId: receivable.id,
          orderId: confirmed.id,
          customerId: confirmed.customerId,
          amount: formatMoney(receivable.amount),
          dueDate: receivable.dueDate,
          instalment: receivable.instalment,
          instalments: receivable.instalments,
        }),
      )
    }

    const invoiced: SalesOrder = { ...transitioned.value, items: shippedItems }
    await context.uow.salesOrders.save(invoiced)

    context.uow.events.record(
      domainEvent('fiscal_document.issued', 'fiscal_document', document.id, {
        documentId: document.id,
        series: document.series,
        number: document.number,
        orderId: confirmed.id,
        total: formatMoney(document.total),
      }),
    )
    context.uow.events.record(
      domainEvent('sales_order.invoiced', 'sales_order', invoiced.id, {
        orderId: invoiced.id,
        number: invoiced.number,
        total: formatMoney(invoiced.total),
        fiscalDocumentId: document.id,
        fiscalDocumentNumber: `${document.series}${document.number}`,
        receivableIds: receivables.map((receivable) => receivable.id),
      }),
    )

    return ok({ order: invoiced, document, receivables })
  },
  preview: async (input, context) => {
    const loaded = await loadOrder(context, input.orderId)
    if (!loaded.ok) return loaded
    const order = loaded.value
    const customer = await context.uow.customers.findById(order.customerId)
    const lines = order.items
      .map((item) => `${formatQuantity(item.quantity)} x ${item.sku}`)
      .join(', ')
    return ok(
      `Invoice sales order ${order.number} for ${customer?.name ?? 'unknown customer'}: ${lines}. This issues fiscal document series ${input.series} with the next sequential number, ships the stock, and creates ${String(order.instalments)} receivable(s) totalling ${formatMoney(order.total)}. The fiscal number cannot be reused.`,
    )
  },
})

export const cancelSalesOrder = defineUseCase({
  name: 'cancel_sales_order',
  title: 'Cancel sales order',
  summary:
    'Cancels a sales order. A draft is simply closed; a confirmed order releases its stock reservation; an invoiced order is fully reversed -- stock returns at the cost it left with, the receivables are cancelled and the fiscal document is voided, which requires a reason. Cancelling is refused when a receivable has already been settled: reverse the settlement first.',
  capability: 'sales:cancel',
  risk: 'destructive',
  inputSchema: z.object({
    orderId: z.uuid(),
    reason: z.string().trim().max(500).default(''),
  }),
  execute: async (input, context) => {
    const loaded = await loadOrder(context, input.orderId)
    if (!loaded.ok) return loaded
    const current = loaded.value

    const transitioned = cancelSalesOrderState(current, input.reason, context.now)
    if (!transitioned.ok) return transitioned
    const { order, requiresReversal } = transitioned.value

    if (current.status === 'confirmed') {
      for (const item of current.items) {
        const balance = await context.uow.stock.getBalanceForUpdate(item.productId)
        const released = releaseReservation(balance, item.quantity, context.now)
        if (!released.ok) return released
        await context.uow.stock.saveBalance(released.value)
        context.uow.events.record(
          domainEvent('stock.reservation_released', 'stock', item.productId, {
            productId: item.productId,
            sku: item.sku,
            quantity: formatQuantity(item.quantity),
            reservedAfter: formatQuantity(released.value.reserved),
          }),
        )
      }
    }

    if (requiresReversal) {
      const receivables = await context.uow.finance.listReceivablesByOrder(current.id)
      const settled = receivables.filter((receivable) => receivable.settledAmount > 0n)
      if (settled.length > 0) {
        return err(
          domainError(
            'INVALID_STATE_TRANSITION',
            `Sales order ${current.number} cannot be cancelled: ${String(settled.length)} of its receivables have already received payments totalling ${formatMoney(settled.reduce<Money>((sum, item) => (sum + item.settledAmount) as Money, ZERO_MONEY))}. Reverse those settlements first.`,
            {
              orderId: current.id,
              number: current.number,
              settledReceivables: settled.map((receivable) => receivable.id),
            },
          ),
        )
      }

      for (const receivable of receivables) {
        await context.uow.finance.saveReceivable({
          ...receivable,
          status: 'cancelled',
          updatedAt: context.now,
        })
      }

      for (const item of current.items) {
        const unitCost: UnitCost = item.unitCostAtInvoice ?? (0n as UnitCost)
        const balance = await context.uow.stock.getBalanceForUpdate(item.productId)
        const returned = applyEntry(balance, item.quantity, unitCost, context.now)
        if (!returned.ok) return returned

        const product = await context.uow.products.findById(item.productId)
        if (product === null) return err(notFound('Product', item.productId))

        await recordMovement(context, {
          product,
          balanceBefore: balance,
          balanceAfter: returned.value.balance,
          kind: 'entry',
          reason: 'sales_cancellation',
          signedQuantity: item.quantity,
          unitCost,
          totalCost: returned.value.totalCost,
          reference: { kind: 'sales_order', id: current.id },
          note: `Reversal of ${current.number}`,
        })
      }

      if (current.fiscalDocumentId !== null) {
        const document = await context.uow.fiscal.findById(current.fiscalDocumentId)
        if (document !== null) {
          await context.uow.fiscal.save({
            ...document,
            status: 'cancelled',
            cancelledAt: context.now,
            cancellationReason: input.reason,
          })
        }
      }
    }

    await context.uow.salesOrders.save(order)
    context.uow.events.record(
      domainEvent('sales_order.cancelled', 'sales_order', order.id, {
        orderId: order.id,
        number: order.number,
        previousStatus: current.status,
        reason: input.reason,
        reversed: requiresReversal,
      }),
    )

    return ok(order)
  },
  preview: async (input, context) => {
    const loaded = await loadOrder(context, input.orderId)
    if (!loaded.ok) return loaded
    const order = loaded.value
    if (order.status === 'invoiced') {
      return ok(
        `Cancel invoiced sales order ${order.number} (${formatMoney(order.total)}). This voids its fiscal document, returns ${String(order.items.length)} item line(s) to stock and cancels every receivable it generated. Reason on record: "${input.reason}".`,
      )
    }
    if (order.status === 'confirmed') {
      return ok(
        `Cancel confirmed sales order ${order.number} (${formatMoney(order.total)}) and release the stock reserved for its ${String(order.items.length)} line(s).`,
      )
    }
    return ok(
      `Cancel draft sales order ${order.number} (${formatMoney(order.total)}). No stock or financial impact.`,
    )
  },
})

export const listSalesOrders = defineUseCase({
  name: 'list_sales_orders',
  title: 'List sales orders',
  summary:
    'Lists sales orders, optionally filtered by status, customer or issue date range. Use status ["confirmed"] to find orders waiting to be invoiced.',
  capability: 'sales:read',
  risk: 'read',
  inputSchema: z.object({
    status: z.array(z.enum(SALES_ORDER_STATUSES)).optional(),
    customerId: z.uuid().optional(),
    from: businessDateSchema.optional(),
    to: businessDateSchema.optional(),
    limit: z.number().int().min(1).max(200).default(50),
    offset: z.number().int().min(0).default(0),
  }),
  execute: async (input, context) =>
    ok(
      await context.uow.salesOrders.list({
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.customerId === undefined
          ? {}
          : { customerId: asId<CustomerId>(input.customerId) }),
        ...(input.from === undefined ? {} : { from: input.from }),
        ...(input.to === undefined ? {} : { to: input.to }),
        page: { limit: input.limit, offset: input.offset },
      }),
    ),
})

export const getSalesOrder = defineUseCase({
  name: 'get_sales_order',
  title: 'Get sales order',
  summary:
    'Returns one sales order with its items, its customer, its fiscal document and the receivables it generated.',
  capability: 'sales:read',
  risk: 'read',
  inputSchema: z
    .object({
      orderId: z.uuid().optional(),
      number: z.string().trim().max(20).optional(),
    })
    .refine((value) => value.orderId !== undefined || value.number !== undefined, {
      message: 'Provide either orderId or number.',
    }),
  execute: async (input, context) => {
    const order =
      input.orderId !== undefined
        ? await context.uow.salesOrders.findById(asId<SalesOrderId>(input.orderId))
        : input.number !== undefined
          ? await context.uow.salesOrders.findByNumber(input.number)
          : null
    if (order === null) {
      return err(notFound('Sales order', input.orderId ?? input.number ?? 'unknown'))
    }

    const [customer, receivables, document] = await Promise.all([
      context.uow.customers.findById(order.customerId),
      context.uow.finance.listReceivablesByOrder(order.id),
      order.fiscalDocumentId === null
        ? Promise.resolve(null)
        : context.uow.fiscal.findById(order.fiscalDocumentId),
    ])

    return ok({ order, customer, receivables, fiscalDocument: document })
  },
})
