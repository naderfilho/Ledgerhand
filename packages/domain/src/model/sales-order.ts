import type { BusinessDate } from '../kit/business-date.js'
import { domainError, type DomainError } from '../kit/errors.js'
import type {
  CustomerId,
  FiscalDocumentId,
  ProductId,
  SalesOrderId,
  SalesOrderItemId,
  TenantId,
} from '../kit/ids.js'
import { subMoney, sumMoney, ZERO_MONEY, type Money } from '../kit/money.js'
import type { Quantity } from '../kit/quantity.js'
import { err, ok, type Result } from '../kit/result.js'
import { extend, type UnitCost, type UnitPrice } from '../kit/unit-value.js'

/**
 * ---------------------------------------------------------------------------
 * Sales order lifecycle
 * ---------------------------------------------------------------------------
 *
 *   draft ──confirm──> confirmed ──invoice──> invoiced
 *     │                    │                      │
 *     └──cancel───────────┴──cancel──────────────┘ (invoiced needs a reversal)
 *
 * The transitions carry the business rules the brief asks for: an order cannot
 * be confirmed without stock, cannot be invoiced unless confirmed, and cannot
 * be cancelled after invoicing without an explicit reversal reason. The rules
 * live here so the UI, the HTTP API and the MCP server all inherit them rather
 * than each re-implementing them slightly differently.
 */
export const SALES_ORDER_STATUSES = ['draft', 'confirmed', 'invoiced', 'cancelled'] as const
export type SalesOrderStatus = (typeof SALES_ORDER_STATUSES)[number]

export interface SalesOrderItem {
  readonly id: SalesOrderItemId
  readonly productId: ProductId
  /** Denormalised so a historical order still reads correctly after a rename. */
  readonly sku: string
  readonly description: string
  readonly quantity: Quantity
  readonly unitPrice: UnitPrice
  readonly discount: Money
  readonly total: Money
  /**
   * The weighted average cost the goods carried at the moment they were
   * invoiced. Captured so that reversing a cancellation puts the stock back at
   * the cost it left with, instead of at whatever the average happens to be
   * weeks later -- which would silently create or destroy inventory value.
   */
  readonly unitCostAtInvoice: UnitCost | null
}

export interface SalesOrder {
  readonly id: SalesOrderId
  readonly tenantId: TenantId
  readonly number: string
  readonly customerId: CustomerId
  readonly status: SalesOrderStatus
  readonly issuedOn: BusinessDate
  readonly items: readonly SalesOrderItem[]
  readonly total: Money
  /** How many receivables invoicing will generate. */
  readonly instalments: number
  readonly notes: string | null
  readonly confirmedAt: Date | null
  readonly invoicedAt: Date | null
  readonly cancelledAt: Date | null
  readonly cancellationReason: string | null
  readonly fiscalDocumentId: FiscalDocumentId | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

export function lineTotal(quantity: Quantity, unitPrice: UnitPrice, discount: Money): Money {
  return subMoney(extend(quantity, unitPrice), discount)
}

export function salesOrderTotal(items: readonly SalesOrderItem[]): Money {
  return items.length === 0 ? ZERO_MONEY : sumMoney(items.map((item) => item.total))
}

export function invalidTransition(
  entity: string,
  identifier: string,
  from: string,
  action: string,
  expected: readonly string[],
): DomainError {
  return domainError(
    'INVALID_STATE_TRANSITION',
    `${entity} ${identifier} is ${from} and cannot be ${action}. Only ${expected.join(' or ')} orders can be ${action}.`,
    { entity, id: identifier, status: from, action, expected: [...expected] },
  )
}

export function requireStatus(
  order: SalesOrder,
  action: string,
  expected: readonly SalesOrderStatus[],
): Result<void, DomainError> {
  return expected.includes(order.status)
    ? ok(undefined)
    : err(invalidTransition('Sales order', order.number, order.status, action, expected))
}

/** Confirming reserves stock; the caller performs the reservation. */
export function confirmSalesOrder(order: SalesOrder, at: Date): Result<SalesOrder, DomainError> {
  const allowed = requireStatus(order, 'confirmed', ['draft'])
  if (!allowed.ok) return allowed
  if (order.items.length === 0) {
    return err(
      domainError(
        'ORDER_HAS_NO_ITEMS',
        `Sales order ${order.number} has no items. Add at least one item before confirming.`,
        { orderId: order.id, number: order.number },
      ),
    )
  }
  return ok({ ...order, status: 'confirmed', confirmedAt: at, updatedAt: at })
}

/** Invoicing issues the fiscal document, ships the stock and creates the titles. */
export function invoiceSalesOrder(
  order: SalesOrder,
  fiscalDocumentId: FiscalDocumentId,
  at: Date,
): Result<SalesOrder, DomainError> {
  const allowed = requireStatus(order, 'invoiced', ['confirmed'])
  if (!allowed.ok) return allowed
  return ok({ ...order, status: 'invoiced', fiscalDocumentId, invoicedAt: at, updatedAt: at })
}

/**
 * Cancelling an invoiced order is not a state flip -- it is a reversal, and the
 * caller must undo the stock movement and the receivables. The reason is
 * mandatory because somebody will have to explain the gap in the fiscal
 * sequence later.
 */
export function cancelSalesOrder(
  order: SalesOrder,
  reason: string,
  at: Date,
): Result<{ order: SalesOrder; requiresReversal: boolean }, DomainError> {
  if (order.status === 'cancelled') {
    return err(
      invalidTransition('Sales order', order.number, order.status, 'cancelled', [
        'draft',
        'confirmed',
        'invoiced',
      ]),
    )
  }
  const trimmed = reason.trim()
  if (order.status === 'invoiced' && trimmed.length === 0) {
    return err(
      domainError(
        'REVERSAL_REASON_REQUIRED',
        `Sales order ${order.number} has been invoiced. Cancelling it reverses the fiscal document, the stock movement and the receivables, so a reason is required.`,
        { orderId: order.id, number: order.number },
      ),
    )
  }

  return ok({
    order: {
      ...order,
      status: 'cancelled',
      cancelledAt: at,
      cancellationReason: trimmed.length > 0 ? trimmed : null,
      updatedAt: at,
    },
    requiresReversal: order.status === 'invoiced',
  })
}

/** Confirmed and invoiced orders are frozen; only drafts accept edits. */
export function requireEditable(order: SalesOrder): Result<void, DomainError> {
  return requireStatus(order, 'edited', ['draft'])
}

export function reservesStock(status: SalesOrderStatus): boolean {
  return status === 'confirmed'
}
