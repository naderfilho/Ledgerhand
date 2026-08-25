import { z } from 'zod'
import { addDays, businessDateSchema } from '../kit/business-date.js'
import { today, type ExecutionContext } from '../context/execution-context.js'
import { domainEvent } from '../events/domain-event.js'
import { domainError, notFound, type DomainError } from '../kit/errors.js'
import {
  asId,
  type PayableId,
  type ProductId,
  type PurchaseOrderId,
  type PurchaseOrderItemId,
  type SupplierId,
} from '../kit/ids.js'
import { formatMoney } from '../kit/money.js'
import { formatQuantity, positiveQuantitySchema, ZERO_QUANTITY } from '../kit/quantity.js'
import { collect, err, ok, type Result } from '../kit/result.js'
import { formatUnitValue, nonNegativeUnitCostSchema } from '../kit/unit-value.js'
import { ZERO_MONEY } from '../kit/money.js'
import type { Payable } from '../model/finance.js'
import {
  cancelPurchaseOrder as cancelPurchaseOrderState,
  placePurchaseOrder as placePurchaseOrderState,
  purchaseLineTotal,
  purchaseOrderTotal,
  receivePurchaseOrder as receivePurchaseOrderState,
  requireReceivable,
  PURCHASE_ORDER_STATUSES,
  type PurchaseOrder,
  type PurchaseOrderItem,
  type ReceiptLine,
} from '../model/purchase-order.js'
import { applyEntry } from '../model/stock.js'
import { defineUseCase } from './definition.js'
import { presentPage, presentParty, presentPurchaseOrder, presentTitle } from '../views/index.js'
import { recordMovement } from './stock.js'

const purchaseItemSchema = z.object({
  productId: z.uuid(),
  quantity: positiveQuantitySchema,
  unitCost: nonNegativeUnitCostSchema,
  description: z.string().trim().max(200).optional(),
})

async function loadPurchaseOrder(
  context: ExecutionContext,
  orderId: string,
): Promise<Result<PurchaseOrder, DomainError>> {
  const order = await context.uow.purchaseOrders.findById(asId<PurchaseOrderId>(orderId))
  return order === null ? err(notFound('Purchase order', orderId)) : ok(order)
}

export const createPurchaseOrder = defineUseCase({
  name: 'create_purchase_order',
  title: 'Create purchase order',
  summary:
    'Creates a purchase order in draft status. Nothing enters stock and no payable is created until the goods are received through receive_purchase_order.',
  capability: 'purchase:write',
  risk: 'write',
  inputSchema: z.object({
    supplierId: z.uuid(),
    issuedOn: businessDateSchema.optional(),
    expectedOn: businessDateSchema.nullish(),
    notes: z.string().trim().max(1000).nullish(),
    items: z.array(purchaseItemSchema).min(1, 'A purchase order needs at least one item.'),
  }),
  execute: async (input, context) => {
    const supplierId = asId<SupplierId>(input.supplierId)
    const supplier = await context.uow.suppliers.findById(supplierId)
    if (supplier === null) return err(notFound('Supplier', input.supplierId))

    const productIds = input.items.map((item) => asId<ProductId>(item.productId))
    const products = await context.uow.products.findManyByIds(productIds)

    const built = collect(
      input.items.map((item): Result<PurchaseOrderItem, DomainError> => {
        const product = products.get(asId<ProductId>(item.productId))
        if (product === undefined) return err(notFound('Product', item.productId))
        if (!product.active) {
          return err(
            domainError(
              'PRODUCT_ARCHIVED',
              `Product ${product.sku} is archived and can no longer be purchased.`,
              { productId: product.id, sku: product.sku },
            ),
          )
        }
        return ok({
          id: asId<PurchaseOrderItemId>(context.uow.ids.next()),
          productId: product.id,
          sku: product.sku,
          description: item.description ?? product.name,
          quantity: item.quantity,
          receivedQuantity: ZERO_QUANTITY,
          unitCost: item.unitCost,
          total: purchaseLineTotal(item.quantity, item.unitCost),
        })
      }),
    )
    if (!built.ok) return built

    const sequence = await context.uow.sequences.next('purchase_order')
    const order: PurchaseOrder = {
      id: asId<PurchaseOrderId>(context.uow.ids.next()),
      tenantId: context.tenantId,
      number: `PO-${String(sequence).padStart(6, '0')}`,
      supplierId,
      status: 'draft',
      issuedOn: input.issuedOn ?? today(context),
      expectedOn: input.expectedOn ?? null,
      items: built.value,
      total: purchaseOrderTotal(built.value),
      notes: input.notes ?? null,
      placedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      createdAt: context.now,
      updatedAt: context.now,
    }

    await context.uow.purchaseOrders.save(order)
    context.uow.events.record(
      domainEvent('purchase_order.created', 'purchase_order', order.id, {
        orderId: order.id,
        number: order.number,
        supplierId,
        total: formatMoney(order.total),
      }),
    )

    return ok(order)
  },
  present: (order) => presentPurchaseOrder(order),
})

export const placePurchaseOrder = defineUseCase({
  name: 'place_purchase_order',
  title: 'Place purchase order',
  summary:
    'Sends a draft purchase order to the supplier, making it eligible to receive deliveries. Still no stock and no payable.',
  capability: 'purchase:write',
  risk: 'write',
  inputSchema: z.object({ orderId: z.uuid() }),
  execute: async (input, context) => {
    const loaded = await loadPurchaseOrder(context, input.orderId)
    if (!loaded.ok) return loaded

    const placed = placePurchaseOrderState(loaded.value, context.now)
    if (!placed.ok) return placed

    await context.uow.purchaseOrders.save(placed.value)
    context.uow.events.record(
      domainEvent('purchase_order.placed', 'purchase_order', placed.value.id, {
        orderId: placed.value.id,
        number: placed.value.number,
        total: formatMoney(placed.value.total),
      }),
    )

    return ok(placed.value)
  },
  present: (order) => presentPurchaseOrder(order),
})

export const receivePurchaseOrder = defineUseCase({
  name: 'receive_purchase_order',
  title: 'Receive purchase order',
  summary:
    'Records a delivery against a placed purchase order. Every received line enters stock at its unit cost and updates the weighted average; a payable is created for the value received, due according to the supplier payment term. Partial deliveries are supported; receiving more than was ordered is refused. Omit the lines to receive everything still outstanding.',
  capability: 'purchase:write',
  risk: 'write',
  inputSchema: z.object({
    orderId: z.uuid(),
    lines: z
      .array(
        z.object({
          itemId: z.uuid(),
          quantity: positiveQuantitySchema,
          unitCost: nonNegativeUnitCostSchema.nullish(),
        }),
      )
      .optional(),
  }),
  execute: async (input, context) => {
    const loaded = await loadPurchaseOrder(context, input.orderId)
    if (!loaded.ok) return loaded
    const order = loaded.value

    // Status first: an order that is finished or cancelled should say so,
    // rather than report that its (empty) outstanding list has nothing in it.
    const receivable = requireReceivable(order)
    if (!receivable.ok) return receivable

    const lines: ReceiptLine[] =
      input.lines === undefined
        ? order.items
            .filter((item) => item.receivedQuantity < item.quantity)
            .map((item) => ({
              itemId: item.id,
              quantity: (item.quantity - item.receivedQuantity) as typeof item.quantity,
              unitCost: null,
            }))
        : input.lines.map((line) => ({
            itemId: asId<PurchaseOrderItemId>(line.itemId),
            quantity: line.quantity,
            unitCost: line.unitCost ?? null,
          }))

    if (lines.length === 0) {
      return err(
        domainError(
          'VALIDATION_FAILED',
          `Purchase order ${order.number} has nothing left to receive.`,
          { orderId: order.id, number: order.number },
        ),
      )
    }

    const applied = receivePurchaseOrderState(order, lines, context.now)
    if (!applied.ok) return applied
    const outcome = applied.value

    for (const entry of outcome.received) {
      const product = await context.uow.products.findById(entry.item.productId)
      if (product === null) return err(notFound('Product', entry.item.productId))

      const balanceBefore = await context.uow.stock.getBalanceForUpdate(product.id)
      const entered = applyEntry(balanceBefore, entry.quantity, entry.unitCost, context.now)
      if (!entered.ok) return entered

      await recordMovement(context, {
        product,
        balanceBefore,
        balanceAfter: entered.value.balance,
        kind: 'entry',
        reason: 'purchase_receipt',
        signedQuantity: entry.quantity,
        unitCost: entry.unitCost,
        totalCost: entered.value.totalCost,
        reference: { kind: 'purchase_order', id: order.id },
        note: null,
      })

      context.uow.events.record(
        domainEvent('stock.entry_registered', 'stock', product.id, {
          productId: product.id,
          sku: product.sku,
          quantity: formatQuantity(entry.quantity),
          unitCost: formatUnitValue(entry.unitCost),
          totalCost: formatMoney(entered.value.totalCost),
          onHandAfter: formatQuantity(entered.value.balance.onHand),
          averageCostAfter: formatUnitValue(entered.value.balance.averageCost),
          reason: 'purchase_receipt',
        }),
      )
    }

    const supplier = await context.uow.suppliers.findById(order.supplierId)
    if (supplier === null) return err(notFound('Supplier', order.supplierId))

    const receivedOn = today(context)
    let payable: Payable | null = null
    if (outcome.receivedTotal > 0n) {
      payable = {
        id: asId<PayableId>(context.uow.ids.next()),
        kind: 'payable',
        tenantId: context.tenantId,
        supplierId: order.supplierId,
        purchaseOrderId: order.id,
        amount: outcome.receivedTotal,
        settledAmount: ZERO_MONEY,
        issuedOn: receivedOn,
        dueDate: addDays(receivedOn, supplier.paymentTermDays),
        status: 'open',
        description: `Purchase order ${order.number}`,
        instalment: 1,
        instalments: 1,
        createdAt: context.now,
        updatedAt: context.now,
      }
      await context.uow.finance.savePayable(payable)
      context.uow.events.record(
        domainEvent('payable.created', 'payable', payable.id, {
          payableId: payable.id,
          purchaseOrderId: order.id,
          supplierId: order.supplierId,
          amount: formatMoney(payable.amount),
          dueDate: payable.dueDate,
        }),
      )
    }

    await context.uow.purchaseOrders.save(outcome.order)
    context.uow.events.record(
      domainEvent('purchase_order.received', 'purchase_order', outcome.order.id, {
        orderId: outcome.order.id,
        number: outcome.order.number,
        fullyReceived: outcome.fullyReceived,
        payableId: payable?.id ?? null,
        receivedTotal: formatMoney(outcome.receivedTotal),
      }),
    )

    return ok({ order: outcome.order, payable, receivedTotal: outcome.receivedTotal })
  },
  present: ({ order, payable, receivedTotal }) => ({
    order: presentPurchaseOrder(order),
    payable: payable === null ? null : presentTitle(payable),
    receivedTotal: formatMoney(receivedTotal),
  }),
})

export const cancelPurchaseOrder = defineUseCase({
  name: 'cancel_purchase_order',
  title: 'Cancel purchase order',
  summary:
    'Cancels a draft or placed purchase order that has not received any delivery. Once part of the goods has arrived, cancelling is refused: adjust stock and settle the payable instead.',
  capability: 'purchase:cancel',
  risk: 'destructive',
  inputSchema: z.object({
    orderId: z.uuid(),
    reason: z.string().trim().min(3, 'Explain why the order is being cancelled.').max(500),
  }),
  execute: async (input, context) => {
    const loaded = await loadPurchaseOrder(context, input.orderId)
    if (!loaded.ok) return loaded

    const cancelled = cancelPurchaseOrderState(loaded.value, input.reason, context.now)
    if (!cancelled.ok) return cancelled

    await context.uow.purchaseOrders.save(cancelled.value)
    context.uow.events.record(
      domainEvent('purchase_order.cancelled', 'purchase_order', cancelled.value.id, {
        orderId: cancelled.value.id,
        number: cancelled.value.number,
        reason: input.reason,
      }),
    )

    return ok(cancelled.value)
  },
  present: (order) => presentPurchaseOrder(order),
  preview: async (input, context) => {
    const loaded = await loadPurchaseOrder(context, input.orderId)
    if (!loaded.ok) return loaded
    const order = loaded.value
    return ok(
      `Cancel purchase order ${order.number} (${formatMoney(order.total)}, ${String(order.items.length)} line(s)). The supplier commitment is dropped; no stock or financial entry is affected.`,
    )
  },
})

export const listPurchaseOrders = defineUseCase({
  name: 'list_purchase_orders',
  title: 'List purchase orders',
  summary:
    'Lists purchase orders, optionally filtered by status or supplier. Use status ["placed","partially_received"] to find deliveries still expected.',
  capability: 'purchase:read',
  risk: 'read',
  inputSchema: z.object({
    status: z.array(z.enum(PURCHASE_ORDER_STATUSES)).optional(),
    supplierId: z.uuid().optional(),
    limit: z.number().int().min(1).max(200).default(50),
    offset: z.number().int().min(0).default(0),
  }),
  execute: async (input, context) => {
    const page = await context.uow.purchaseOrders.list({
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.supplierId === undefined ? {} : { supplierId: asId<SupplierId>(input.supplierId) }),
      page: { limit: input.limit, offset: input.offset },
    })
    const suppliers = await context.uow.suppliers.findManyByIds(
      page.rows.map((order) => order.supplierId),
    )
    return ok({
      rows: page.rows.map((order) => ({
        order,
        supplierName: suppliers.get(order.supplierId)?.name ?? null,
      })),
      total: page.total,
    })
  },
  present: (page) =>
    presentPage(page, ({ order, supplierName }) => presentPurchaseOrder(order, supplierName ?? '')),
})

export const getPurchaseOrder = defineUseCase({
  name: 'get_purchase_order',
  title: 'Get purchase order',
  summary: 'Returns one purchase order with its items, received quantities and supplier.',
  capability: 'purchase:read',
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
        ? await context.uow.purchaseOrders.findById(asId<PurchaseOrderId>(input.orderId))
        : input.number !== undefined
          ? await context.uow.purchaseOrders.findByNumber(input.number)
          : null
    if (order === null) {
      return err(notFound('Purchase order', input.orderId ?? input.number ?? 'unknown'))
    }
    const supplier = await context.uow.suppliers.findById(order.supplierId)
    return ok({ order, supplier })
  },
  present: ({ order, supplier }) => ({
    order: presentPurchaseOrder(order, supplier?.name ?? ''),
    supplier: supplier === null ? null : presentParty(supplier),
  }),
})
