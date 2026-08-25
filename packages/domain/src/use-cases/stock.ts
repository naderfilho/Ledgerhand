import { z } from 'zod'
import { businessDateSchema } from '../kit/business-date.js'
import { domainEvent } from '../events/domain-event.js'
import type { ExecutionContext } from '../context/execution-context.js'
import { domainError, notFound, type DomainError } from '../kit/errors.js'
import { asId, type ProductId, type StockMovementId } from '../kit/ids.js'
import { formatMoney, type Money } from '../kit/money.js'
import {
  formatQuantity,
  negateQuantity,
  positiveQuantitySchema,
  quantitySchema,
  type Quantity,
} from '../kit/quantity.js'
import { err, ok, type Result } from '../kit/result.js'
import { formatUnitValue, nonNegativeUnitCostSchema, type UnitCost } from '../kit/unit-value.js'
import type { Product } from '../model/product.js'
import {
  applyAdjustment,
  applyEntry,
  applyExit,
  availableQuantity,
  emptyBalance,
  stockValue,
  type StockBalance,
  type StockMovement,
  type StockMovementKind,
  type StockMovementReason,
  type StockMovementReference,
} from '../model/stock.js'
import { defineUseCase } from './definition.js'

/**
 * Writes one movement and the balance it produced, then reports a minimum
 * stock breach if this movement caused one. Every stock change in the system
 * -- manual, from a sale, from a purchase receipt -- goes through here, which
 * is what keeps `onHand` equal to the sum of the movements.
 */
export async function recordMovement(
  context: ExecutionContext,
  args: {
    readonly product: Product
    readonly balanceBefore: StockBalance
    readonly balanceAfter: StockBalance
    readonly kind: StockMovementKind
    readonly reason: StockMovementReason
    readonly signedQuantity: Quantity
    readonly unitCost: UnitCost
    readonly totalCost: Money
    readonly reference: StockMovementReference | null
    readonly note: string | null
  },
): Promise<StockMovement> {
  const movement: StockMovement = {
    id: asId<StockMovementId>(context.uow.ids.next()),
    productId: args.product.id,
    kind: args.kind,
    reason: args.reason,
    quantity: args.signedQuantity,
    unitCost: args.unitCost,
    totalCost: args.totalCost,
    onHandAfter: args.balanceAfter.onHand,
    averageCostAfter: args.balanceAfter.averageCost,
    occurredAt: context.now,
    reference: args.reference,
    note: args.note,
  }

  await context.uow.stock.saveBalance(args.balanceAfter)
  await context.uow.stock.appendMovement(movement)

  const minimum = args.product.minimumStock
  const wasAbove = args.balanceBefore.onHand >= minimum
  const isBelow = args.balanceAfter.onHand < minimum
  if (minimum > 0n && wasAbove && isBelow) {
    context.uow.events.record(
      domainEvent('stock.minimum_breached', 'stock', args.product.id, {
        productId: args.product.id,
        sku: args.product.sku,
        onHand: formatQuantity(args.balanceAfter.onHand),
        minimumStock: formatQuantity(minimum),
      }),
    )
  }

  return movement
}

async function loadSellableProduct(
  context: ExecutionContext,
  productId: string,
): Promise<Result<Product, DomainError>> {
  const product = await context.uow.products.findById(asId<ProductId>(productId))
  if (product === null) return err(notFound('Product', productId))
  if (!product.active) {
    return err(
      domainError(
        'PRODUCT_ARCHIVED',
        `Product ${product.sku} is archived and cannot move in or out of stock.`,
        { productId: product.id, sku: product.sku },
      ),
    )
  }
  return ok(product)
}

const manualEntryReasons = [
  'manual_entry',
  'opening_balance',
] as const satisfies readonly StockMovementReason[]
const manualExitReasons = ['manual_exit', 'loss'] as const satisfies readonly StockMovementReason[]

export const registerStockEntry = defineUseCase({
  name: 'register_stock_entry',
  title: 'Register stock entry',
  summary:
    'Adds quantity to a product at a given unit cost and recalculates its weighted average cost. Use this for stock that arrives without a purchase order, such as an opening balance or a return; deliveries against a purchase order should go through receive_purchase_order so the payable is created too.',
  capability: 'stock:write',
  risk: 'write',
  inputSchema: z.object({
    productId: z.uuid(),
    quantity: positiveQuantitySchema,
    unitCost: nonNegativeUnitCostSchema,
    reason: z.enum(manualEntryReasons).default('manual_entry'),
    note: z.string().trim().max(500).nullish(),
  }),
  execute: async (input, context) => {
    const loaded = await loadSellableProduct(context, input.productId)
    if (!loaded.ok) return loaded
    const product = loaded.value

    const balanceBefore = await context.uow.stock.getBalanceForUpdate(product.id)
    const applied = applyEntry(balanceBefore, input.quantity, input.unitCost, context.now)
    if (!applied.ok) return applied

    const movement = await recordMovement(context, {
      product,
      balanceBefore,
      balanceAfter: applied.value.balance,
      kind: 'entry',
      reason: input.reason,
      signedQuantity: input.quantity,
      unitCost: input.unitCost,
      totalCost: applied.value.totalCost,
      reference: null,
      note: input.note ?? null,
    })

    context.uow.events.record(
      domainEvent('stock.entry_registered', 'stock', product.id, {
        productId: product.id,
        sku: product.sku,
        quantity: formatQuantity(input.quantity),
        unitCost: formatUnitValue(input.unitCost),
        totalCost: formatMoney(applied.value.totalCost),
        onHandAfter: formatQuantity(applied.value.balance.onHand),
        averageCostAfter: formatUnitValue(applied.value.balance.averageCost),
        reason: input.reason,
      }),
    )

    return ok({ movement, balance: applied.value.balance })
  },
})

export const registerStockExit = defineUseCase({
  name: 'register_stock_exit',
  title: 'Register stock exit',
  summary:
    'Removes quantity from a product outside of a sale -- breakage, loss, internal consumption. Valued at the current weighted average cost. Classified destructive because it writes off goods with no commercial document behind it and can only be undone by another movement.',
  capability: 'stock:write',
  risk: 'destructive',
  inputSchema: z.object({
    productId: z.uuid(),
    quantity: positiveQuantitySchema,
    reason: z.enum(manualExitReasons).default('manual_exit'),
    note: z.string().trim().max(500).nullish(),
  }),
  execute: async (input, context) => {
    const loaded = await loadSellableProduct(context, input.productId)
    if (!loaded.ok) return loaded
    const product = loaded.value

    const balanceBefore = await context.uow.stock.getBalanceForUpdate(product.id)
    const applied = applyExit(balanceBefore, input.quantity, product.sku, context.now)
    if (!applied.ok) return applied

    const movement = await recordMovement(context, {
      product,
      balanceBefore,
      balanceAfter: applied.value.balance,
      kind: 'exit',
      reason: input.reason,
      signedQuantity: negateQuantity(input.quantity),
      unitCost: balanceBefore.averageCost,
      totalCost: applied.value.totalCost,
      reference: null,
      note: input.note ?? null,
    })

    context.uow.events.record(
      domainEvent('stock.exit_registered', 'stock', product.id, {
        productId: product.id,
        sku: product.sku,
        quantity: formatQuantity(input.quantity),
        unitCost: formatUnitValue(balanceBefore.averageCost),
        totalCost: formatMoney(applied.value.totalCost),
        onHandAfter: formatQuantity(applied.value.balance.onHand),
        reason: input.reason,
      }),
    )

    return ok({ movement, balance: applied.value.balance })
  },
  preview: async (input, context) => {
    const product = await context.uow.products.findById(asId<ProductId>(input.productId))
    if (product === null) return err(notFound('Product', input.productId))
    const balance = await context.uow.stock.getBalance(product.id)
    const value = formatMoney(applyExitPreviewValue(balance, input.quantity))
    return ok(
      `Write off ${formatQuantity(input.quantity)} ${product.unit} of ${product.sku} (${product.name}), valued at ${value} at the current average cost. On hand would go from ${formatQuantity(balance.onHand)} to ${formatQuantity((balance.onHand - input.quantity) as Quantity)}.`,
    )
  },
})

function applyExitPreviewValue(balance: StockBalance, quantity: Quantity): Money {
  const preview = applyExit(balance, quantity, 'preview', balance.updatedAt)
  return preview.ok ? preview.value.totalCost : (0n as Money)
}

export const adjustStock = defineUseCase({
  name: 'adjust_stock',
  title: 'Adjust stock',
  summary:
    'Corrects the quantity on hand to match a physical count. Takes the delta, positive or negative, and always requires a reason. Classified destructive because it overwrites what the system believed to be true with no document behind it. It cannot push stock below zero, nor below the quantity already reserved for confirmed orders.',
  capability: 'stock:adjust',
  risk: 'destructive',
  inputSchema: z.object({
    productId: z.uuid(),
    delta: quantitySchema.refine((value) => value !== 0n, {
      message: 'Adjustment delta must not be zero.',
    }),
    reason: z
      .string()
      .trim()
      .min(3, 'Explain why the physical count differs from the system.')
      .max(500),
  }),
  execute: async (input, context) => {
    const loaded = await loadSellableProduct(context, input.productId)
    if (!loaded.ok) return loaded
    const product = loaded.value

    const balanceBefore = await context.uow.stock.getBalanceForUpdate(product.id)
    const applied = applyAdjustment(balanceBefore, input.delta, input.reason, context.now)
    if (!applied.ok) return applied

    const movement = await recordMovement(context, {
      product,
      balanceBefore,
      balanceAfter: applied.value.balance,
      kind: 'adjustment',
      reason: 'inventory_count',
      signedQuantity: input.delta,
      unitCost: balanceBefore.averageCost,
      totalCost: applied.value.totalCost,
      reference: null,
      note: input.reason,
    })

    context.uow.events.record(
      domainEvent('stock.adjusted', 'stock', product.id, {
        productId: product.id,
        sku: product.sku,
        delta: formatQuantity(input.delta),
        onHandBefore: formatQuantity(balanceBefore.onHand),
        onHandAfter: formatQuantity(applied.value.balance.onHand),
        reason: input.reason,
      }),
    )

    return ok({ movement, balance: applied.value.balance })
  },
  preview: async (input, context) => {
    const product = await context.uow.products.findById(asId<ProductId>(input.productId))
    if (product === null) return err(notFound('Product', input.productId))
    const balance = await context.uow.stock.getBalance(product.id)
    const direction = input.delta > 0n ? 'increase' : 'decrease'
    return ok(
      `${direction === 'increase' ? 'Increase' : 'Decrease'} stock of ${product.sku} (${product.name}) by ${formatQuantity(input.delta > 0n ? input.delta : negateQuantity(input.delta))} ${product.unit}: ${formatQuantity(balance.onHand)} would become ${formatQuantity((balance.onHand + input.delta) as Quantity)}. Reason on record: "${input.reason}".`,
    )
  },
})

export const getStockPosition = defineUseCase({
  name: 'get_stock_position',
  title: 'Get stock position',
  summary:
    'Returns quantity on hand, quantity reserved for confirmed orders, quantity available to promise, average cost and total value for one product or for the whole catalogue.',
  capability: 'stock:read',
  risk: 'read',
  inputSchema: z.object({
    productId: z.uuid().optional(),
    search: z.string().trim().max(120).optional(),
    limit: z.number().int().min(1).max(200).default(50),
  }),
  execute: async (input, context) => {
    let products: readonly Product[]
    if (input.productId !== undefined) {
      const single = await context.uow.products.findById(asId<ProductId>(input.productId))
      if (single === null) return err(notFound('Product', input.productId))
      products = [single]
    } else {
      const listed = await context.uow.products.list({
        ...(input.search === undefined ? {} : { search: input.search }),
        activeOnly: true,
        page: { limit: input.limit, offset: 0 },
      })
      products = listed.rows
    }

    const balances = await context.uow.stock.getBalances(products.map((product) => product.id))
    const rows = products.map((product) => {
      const balance = balances.get(product.id) ?? emptyBalance(product.id, context.now)
      return {
        product,
        balance,
        available: availableQuantity(balance),
        value: stockValue(balance),
      }
    })

    return ok(rows)
  },
})

export const listProductsBelowMinimum = defineUseCase({
  name: 'list_products_below_minimum',
  title: 'List products below minimum stock',
  summary:
    'Returns every active product whose quantity on hand is under its configured minimum, with the shortfall. This is the starting point for a replenishment run.',
  capability: 'stock:read',
  risk: 'read',
  inputSchema: z.object({}),
  execute: async (_input, context) => ok(await context.uow.stock.listBelowMinimum()),
})

export const listStockMovements = defineUseCase({
  name: 'list_stock_movements',
  title: 'List stock movements',
  summary:
    'Returns the movement history for a product or a date range: what came in, what went out, at what cost, and which document caused it.',
  capability: 'stock:read',
  risk: 'read',
  inputSchema: z.object({
    productId: z.uuid().optional(),
    from: businessDateSchema.optional(),
    to: businessDateSchema.optional(),
    limit: z.number().int().min(1).max(200).default(50),
    offset: z.number().int().min(0).default(0),
  }),
  execute: async (input, context) =>
    ok(
      await context.uow.stock.listMovements({
        ...(input.productId === undefined ? {} : { productId: asId<ProductId>(input.productId) }),
        ...(input.from === undefined ? {} : { from: input.from }),
        ...(input.to === undefined ? {} : { to: input.to }),
        page: { limit: input.limit, offset: input.offset },
      }),
    ),
})
