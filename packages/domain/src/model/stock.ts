import { domainError, type DomainError } from '../kit/errors.js'
import type { ProductId, StockMovementId } from '../kit/ids.js'
import { formatMoney, type Money } from '../kit/money.js'
import {
  addQuantity,
  formatQuantity,
  subQuantity,
  ZERO_QUANTITY,
  type Quantity,
} from '../kit/quantity.js'
import { err, ok, type Result } from '../kit/result.js'
import { extend, weightedAverageCost, ZERO_UNIT_COST, type UnitCost } from '../kit/unit-value.js'

export const STOCK_MOVEMENT_KINDS = ['entry', 'exit', 'adjustment'] as const
export type StockMovementKind = (typeof STOCK_MOVEMENT_KINDS)[number]

export const STOCK_MOVEMENT_REASONS = [
  'purchase_receipt',
  'sales_invoice',
  'sales_cancellation',
  'manual_entry',
  'manual_exit',
  'inventory_count',
  'loss',
  'opening_balance',
] as const
export type StockMovementReason = (typeof STOCK_MOVEMENT_REASONS)[number]

export interface StockMovementReference {
  readonly kind: 'sales_order' | 'purchase_order' | 'manual'
  readonly id: string
}

/** Append-only. A mistake is corrected by another movement, never by an edit. */
export interface StockMovement {
  readonly id: StockMovementId
  readonly productId: ProductId
  readonly kind: StockMovementKind
  readonly reason: StockMovementReason
  /** Always the signed change: negative for exits and for downward adjustments. */
  readonly quantity: Quantity
  readonly unitCost: UnitCost
  readonly totalCost: Money
  readonly onHandAfter: Quantity
  readonly averageCostAfter: UnitCost
  readonly occurredAt: Date
  readonly reference: StockMovementReference | null
  readonly note: string | null
}

export interface StockBalance {
  readonly productId: ProductId
  readonly onHand: Quantity
  /** Committed to confirmed orders but not yet shipped. */
  readonly reserved: Quantity
  readonly averageCost: UnitCost
  readonly updatedAt: Date
}

export function emptyBalance(productId: ProductId, at: Date): StockBalance {
  return {
    productId,
    onHand: ZERO_QUANTITY,
    reserved: ZERO_QUANTITY,
    averageCost: ZERO_UNIT_COST,
    updatedAt: at,
  }
}

/** What may still be promised to a new order. */
export function availableQuantity(balance: StockBalance): Quantity {
  return subQuantity(balance.onHand, balance.reserved)
}

export function stockValue(balance: StockBalance): Money {
  return extend(balance.onHand, balance.averageCost)
}

export function insufficientStock(
  sku: string,
  requested: Quantity,
  available: Quantity,
): DomainError {
  return domainError(
    'INSUFFICIENT_STOCK',
    `Product ${sku} has ${formatQuantity(available)} available but ${formatQuantity(requested)} was requested. Receive stock or reduce the quantity.`,
    { sku, requested: formatQuantity(requested), available: formatQuantity(available) },
  )
}

/**
 * Receiving stock. The weighted average moves here and only here; exits are
 * valued at whatever the average happens to be when they occur.
 */
export function applyEntry(
  balance: StockBalance,
  quantity: Quantity,
  unitCost: UnitCost,
  at: Date,
): Result<{ balance: StockBalance; totalCost: Money }, DomainError> {
  if (quantity <= 0n) {
    return err(
      domainError('VALIDATION_FAILED', 'Stock entry quantity must be greater than zero.', {
        quantity: formatQuantity(quantity),
      }),
    )
  }
  if (unitCost < 0n) {
    return err(domainError('VALIDATION_FAILED', 'Stock entry unit cost must not be negative.'))
  }

  const averageCost = weightedAverageCost(balance.onHand, balance.averageCost, quantity, unitCost)
  return ok({
    balance: {
      ...balance,
      onHand: addQuantity(balance.onHand, quantity),
      averageCost,
      updatedAt: at,
    },
    totalCost: extend(quantity, unitCost),
  })
}

/**
 * Shipping stock out.
 *
 * Two separate checks, and the distinction matters. The quantity must exist
 * (`onHand`), and what remains afterwards must still cover every promise
 * already made (`reserved`). Invoicing releases its own reservation before
 * calling this, so an order always ships against the stock it reserved; a
 * manual write-off, which has no reservation of its own, is refused rather
 * than allowed to strand a confirmed order with goods that are no longer
 * there.
 */
export function applyExit(
  balance: StockBalance,
  quantity: Quantity,
  sku: string,
  at: Date,
): Result<{ balance: StockBalance; totalCost: Money }, DomainError> {
  if (quantity <= 0n) {
    return err(
      domainError('VALIDATION_FAILED', 'Stock exit quantity must be greater than zero.', {
        quantity: formatQuantity(quantity),
      }),
    )
  }
  if (quantity > balance.onHand) {
    return err(insufficientStock(sku, quantity, balance.onHand))
  }

  const onHand = subQuantity(balance.onHand, quantity)
  if (onHand < balance.reserved) {
    return err(
      domainError(
        'RESERVATION_EXCEEDS_BALANCE',
        `Removing ${formatQuantity(quantity)} of ${sku} would leave ${formatQuantity(onHand)} on hand while ${formatQuantity(balance.reserved)} is reserved for confirmed orders. Cancel one of those orders first, or write off a smaller quantity.`,
        {
          sku,
          requested: formatQuantity(quantity),
          resulting: formatQuantity(onHand),
          reserved: formatQuantity(balance.reserved),
        },
      ),
    )
  }

  return ok({
    balance: { ...balance, onHand, updatedAt: at },
    totalCost: extend(quantity, balance.averageCost),
  })
}

/**
 * The only operation allowed to move stock with no business document behind
 * it, which is exactly why it is classified `destructive` at the MCP boundary
 * and always carries a reason on the record.
 */
export function applyAdjustment(
  balance: StockBalance,
  delta: Quantity,
  reason: string,
  at: Date,
): Result<{ balance: StockBalance; totalCost: Money }, DomainError> {
  if (delta === 0n) {
    return err(domainError('VALIDATION_FAILED', 'A stock adjustment must change the quantity.'))
  }
  if (reason.trim().length === 0) {
    return err(
      domainError(
        'ADJUSTMENT_REASON_REQUIRED',
        'Stock adjustments must record why the physical count differs from the system.',
      ),
    )
  }

  const onHand = addQuantity(balance.onHand, delta)
  if (onHand < 0n) {
    return err(
      domainError(
        'NEGATIVE_STOCK',
        `Adjustment would leave ${formatQuantity(onHand)} on hand. Stock may not go negative.`,
        { delta: formatQuantity(delta), resulting: formatQuantity(onHand) },
      ),
    )
  }
  if (onHand < balance.reserved) {
    return err(
      domainError(
        'RESERVATION_EXCEEDS_BALANCE',
        `Adjustment would leave ${formatQuantity(onHand)} on hand while ${formatQuantity(balance.reserved)} is reserved for confirmed orders. Cancel an order first.`,
        { resulting: formatQuantity(onHand), reserved: formatQuantity(balance.reserved) },
      ),
    )
  }

  return ok({
    balance: { ...balance, onHand, updatedAt: at },
    totalCost: extend(delta, balance.averageCost),
  })
}

/** Confirming an order promises stock to it. */
export function applyReservation(
  balance: StockBalance,
  quantity: Quantity,
  sku: string,
  at: Date,
): Result<StockBalance, DomainError> {
  if (quantity <= 0n) {
    return err(domainError('VALIDATION_FAILED', 'Reserved quantity must be greater than zero.'))
  }
  const available = availableQuantity(balance)
  if (quantity > available) {
    return err(insufficientStock(sku, quantity, available))
  }
  return ok({ ...balance, reserved: addQuantity(balance.reserved, quantity), updatedAt: at })
}

/** Cancelling or invoicing an order gives the promise back. */
export function releaseReservation(
  balance: StockBalance,
  quantity: Quantity,
  at: Date,
): Result<StockBalance, DomainError> {
  if (quantity <= 0n) {
    return err(domainError('VALIDATION_FAILED', 'Released quantity must be greater than zero.'))
  }
  if (quantity > balance.reserved) {
    return err(
      domainError(
        'RESERVATION_EXCEEDS_BALANCE',
        `Cannot release ${formatQuantity(quantity)} when only ${formatQuantity(balance.reserved)} is reserved.`,
        { requested: formatQuantity(quantity), reserved: formatQuantity(balance.reserved) },
      ),
    )
  }
  return ok({ ...balance, reserved: subQuantity(balance.reserved, quantity), updatedAt: at })
}

export interface StockAlert {
  readonly productId: ProductId
  readonly sku: string
  readonly name: string
  readonly onHand: Quantity
  readonly minimumStock: Quantity
  readonly shortfall: Quantity
}

export function describeMovement(movement: StockMovement): string {
  return `${movement.kind} ${formatQuantity(movement.quantity)} @ ${formatMoney(movement.totalCost)}`
}
