import type { BusinessDate } from '../kit/business-date.js'
import { domainError, type DomainError } from '../kit/errors.js'
import type {
  ProductId,
  PurchaseOrderId,
  PurchaseOrderItemId,
  SupplierId,
  TenantId,
} from '../kit/ids.js'
import { sumMoney, ZERO_MONEY, type Money } from '../kit/money.js'
import {
  addQuantity,
  formatQuantity,
  subQuantity,
  ZERO_QUANTITY,
  type Quantity,
} from '../kit/quantity.js'
import { err, ok, type Result } from '../kit/result.js'
import { extend, type UnitCost } from '../kit/unit-value.js'

/**
 * ---------------------------------------------------------------------------
 * Purchase order lifecycle
 * ---------------------------------------------------------------------------
 *
 *   draft ──place──> placed ──receive──> partially_received ──receive──> received
 *     │                 │                        │
 *     └──cancel─────────┴────────────────────────┘  (nothing received yet)
 *
 * Receiving is what actually creates stock and a payable, so it is tracked per
 * line: suppliers under-deliver, and an ERP that cannot express "8 of the 10
 * arrived" forces its users to lie to it.
 */
export const PURCHASE_ORDER_STATUSES = [
  'draft',
  'placed',
  'partially_received',
  'received',
  'cancelled',
] as const
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number]

export interface PurchaseOrderItem {
  readonly id: PurchaseOrderItemId
  readonly productId: ProductId
  readonly sku: string
  readonly description: string
  readonly quantity: Quantity
  readonly receivedQuantity: Quantity
  readonly unitCost: UnitCost
  readonly total: Money
}

export interface PurchaseOrder {
  readonly id: PurchaseOrderId
  readonly tenantId: TenantId
  readonly number: string
  readonly supplierId: SupplierId
  readonly status: PurchaseOrderStatus
  readonly issuedOn: BusinessDate
  readonly expectedOn: BusinessDate | null
  readonly items: readonly PurchaseOrderItem[]
  readonly total: Money
  readonly notes: string | null
  readonly placedAt: Date | null
  readonly cancelledAt: Date | null
  readonly cancellationReason: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

export function purchaseLineTotal(quantity: Quantity, unitCost: UnitCost): Money {
  return extend(quantity, unitCost)
}

export function purchaseOrderTotal(items: readonly PurchaseOrderItem[]): Money {
  return items.length === 0 ? ZERO_MONEY : sumMoney(items.map((item) => item.total))
}

export function outstandingQuantity(item: PurchaseOrderItem): Quantity {
  return subQuantity(item.quantity, item.receivedQuantity)
}

export function isFullyReceived(items: readonly PurchaseOrderItem[]): boolean {
  return items.every((item) => item.receivedQuantity >= item.quantity)
}

export function hasAnyReceipt(items: readonly PurchaseOrderItem[]): boolean {
  return items.some((item) => item.receivedQuantity > 0n)
}

function invalidPurchaseTransition(
  order: PurchaseOrder,
  action: string,
  expected: readonly PurchaseOrderStatus[],
): DomainError {
  return domainError(
    'INVALID_STATE_TRANSITION',
    `Purchase order ${order.number} is ${order.status} and cannot be ${action}. Only ${expected.join(' or ')} orders can be ${action}.`,
    { orderId: order.id, number: order.number, status: order.status, expected: [...expected] },
  )
}

export function placePurchaseOrder(
  order: PurchaseOrder,
  at: Date,
): Result<PurchaseOrder, DomainError> {
  if (order.status !== 'draft') {
    return err(invalidPurchaseTransition(order, 'placed', ['draft']))
  }
  if (order.items.length === 0) {
    return err(
      domainError(
        'ORDER_HAS_NO_ITEMS',
        `Purchase order ${order.number} has no items. Add at least one item before placing it.`,
        { orderId: order.id, number: order.number },
      ),
    )
  }
  return ok({ ...order, status: 'placed', placedAt: at, updatedAt: at })
}

export interface ReceiptLine {
  readonly itemId: PurchaseOrderItemId
  readonly quantity: Quantity
  /** Suppliers change their prices between quote and delivery. */
  readonly unitCost: UnitCost | null
}

export interface ReceiptOutcome {
  readonly order: PurchaseOrder
  readonly received: readonly {
    readonly item: PurchaseOrderItem
    readonly quantity: Quantity
    readonly unitCost: UnitCost
  }[]
  readonly receivedTotal: Money
  readonly fullyReceived: boolean
}

/**
 * Whether the order is in a state that can accept a delivery at all. Separate
 * from `receivePurchaseOrder` so a caller can answer "is this order finished?"
 * before it works out which lines are still outstanding.
 */
export function requireReceivable(order: PurchaseOrder): Result<void, DomainError> {
  return order.status === 'placed' || order.status === 'partially_received'
    ? ok(undefined)
    : err(invalidPurchaseTransition(order, 'received', ['placed', 'partially_received']))
}

/**
 * Applies a delivery to the order. Over-receipt is refused rather than
 * absorbed: if the supplier sent more than was ordered, that is a commercial
 * conversation, not a silent stock entry.
 */
export function receivePurchaseOrder(
  order: PurchaseOrder,
  lines: readonly ReceiptLine[],
  at: Date,
): Result<ReceiptOutcome, DomainError> {
  const receivable = requireReceivable(order)
  if (!receivable.ok) return receivable
  if (lines.length === 0) {
    return err(domainError('VALIDATION_FAILED', 'A receipt must contain at least one line.'))
  }

  const itemsById = new Map(order.items.map((item) => [item.id, item]))
  const received: { item: PurchaseOrderItem; quantity: Quantity; unitCost: UnitCost }[] = []
  const updatedItems = new Map<PurchaseOrderItemId, PurchaseOrderItem>()

  for (const line of lines) {
    const item = updatedItems.get(line.itemId) ?? itemsById.get(line.itemId)
    if (item === undefined) {
      return err(
        domainError('NOT_FOUND', `Purchase order ${order.number} has no line ${line.itemId}.`, {
          orderId: order.id,
          itemId: line.itemId,
        }),
      )
    }
    if (line.quantity <= 0n) {
      return err(
        domainError(
          'VALIDATION_FAILED',
          `Received quantity for ${item.sku} must be greater than zero.`,
          {
            sku: item.sku,
          },
        ),
      )
    }

    const outstanding = outstandingQuantity(item)
    if (line.quantity > outstanding) {
      return err(
        domainError(
          'OVER_RECEIPT',
          `Cannot receive ${formatQuantity(line.quantity)} of ${item.sku}: only ${formatQuantity(outstanding)} is still outstanding on purchase order ${order.number}.`,
          {
            sku: item.sku,
            requested: formatQuantity(line.quantity),
            outstanding: formatQuantity(outstanding),
          },
        ),
      )
    }

    const unitCost = line.unitCost ?? item.unitCost
    if (unitCost < 0n) {
      return err(
        domainError('VALIDATION_FAILED', `Unit cost for ${item.sku} must not be negative.`, {
          sku: item.sku,
        }),
      )
    }

    updatedItems.set(item.id, {
      ...item,
      receivedQuantity: addQuantity(item.receivedQuantity, line.quantity),
    })
    received.push({ item, quantity: line.quantity, unitCost })
  }

  const items = order.items.map((item) => updatedItems.get(item.id) ?? item)
  const fullyReceived = isFullyReceived(items)
  const receivedTotal =
    received.length === 0
      ? ZERO_MONEY
      : sumMoney(received.map((entry) => extend(entry.quantity, entry.unitCost)))

  return ok({
    order: {
      ...order,
      items,
      status: fullyReceived ? 'received' : 'partially_received',
      updatedAt: at,
    },
    received,
    receivedTotal,
    fullyReceived,
  })
}

/**
 * Cancelling after a partial receipt would strand stock that physically
 * arrived, so it is refused. The way out is a stock adjustment plus a note,
 * both of which are auditable.
 */
export function cancelPurchaseOrder(
  order: PurchaseOrder,
  reason: string,
  at: Date,
): Result<PurchaseOrder, DomainError> {
  if (order.status === 'cancelled' || order.status === 'received') {
    return err(invalidPurchaseTransition(order, 'cancelled', ['draft', 'placed']))
  }
  if (hasAnyReceipt(order.items)) {
    return err(
      domainError(
        'INVALID_STATE_TRANSITION',
        `Purchase order ${order.number} has already received part of the delivery. Adjust stock instead of cancelling.`,
        { orderId: order.id, number: order.number, status: order.status },
      ),
    )
  }
  const trimmed = reason.trim()
  if (trimmed.length === 0) {
    return err(
      domainError('VALIDATION_FAILED', 'Cancelling a purchase order requires a reason.', {
        orderId: order.id,
      }),
    )
  }
  return ok({
    ...order,
    status: 'cancelled',
    cancelledAt: at,
    cancellationReason: trimmed,
    updatedAt: at,
  })
}

export function emptyReceivedQuantity(): Quantity {
  return ZERO_QUANTITY
}
