import type { JsonObject } from '../kit/json.js'
import type { Actor } from '../context/execution-context.js'
import type { DomainEventId, TenantId } from '../kit/ids.js'

/**
 * ---------------------------------------------------------------------------
 * Domain events
 * ---------------------------------------------------------------------------
 * Use cases record facts; the unit of work persists them inside the same
 * transaction as the state change, so the event log can never disagree with
 * the tables. This log is what the audit screen reads, what links a stock
 * movement back to the agent run that caused it, and what the eval suite
 * diffs to decide whether a scenario passed.
 *
 * Payloads carry decimals as strings on purpose: an event is JSON on disk and
 * must survive a round trip through any consumer without a bigint dying in
 * `JSON.stringify`.
 */
export const AGGREGATE_TYPES = [
  'product',
  'customer',
  'supplier',
  'stock',
  'sales_order',
  'purchase_order',
  'receivable',
  'payable',
  'cash_session',
  'fiscal_document',
] as const
export type AggregateType = (typeof AGGREGATE_TYPES)[number]

export interface DomainEventPayloads extends Record<string, JsonObject> {
  'product.created': { productId: string; sku: string; name: string; salePrice: string }
  'product.updated': { productId: string; sku: string; changes: string[] }
  'product.archived': { productId: string; sku: string }

  'customer.created': { customerId: string; name: string }
  'supplier.created': { supplierId: string; name: string }

  'stock.entry_registered': {
    productId: string
    sku: string
    quantity: string
    unitCost: string
    totalCost: string
    onHandAfter: string
    averageCostAfter: string
    reason: string
  }
  'stock.exit_registered': {
    productId: string
    sku: string
    quantity: string
    unitCost: string
    totalCost: string
    onHandAfter: string
    reason: string
  }
  'stock.adjusted': {
    productId: string
    sku: string
    delta: string
    onHandBefore: string
    onHandAfter: string
    reason: string
  }
  'stock.reserved': { productId: string; sku: string; quantity: string; reservedAfter: string }
  'stock.reservation_released': {
    productId: string
    sku: string
    quantity: string
    reservedAfter: string
  }
  'stock.minimum_breached': {
    productId: string
    sku: string
    onHand: string
    minimumStock: string
  }

  'sales_order.created': { orderId: string; number: string; customerId: string; total: string }
  'sales_order.items_updated': { orderId: string; number: string; total: string; itemCount: number }
  'sales_order.confirmed': { orderId: string; number: string; total: string }
  'sales_order.invoiced': {
    orderId: string
    number: string
    total: string
    fiscalDocumentId: string
    fiscalDocumentNumber: string
    receivableIds: string[]
  }
  'sales_order.cancelled': {
    orderId: string
    number: string
    previousStatus: string
    reason: string
    reversed: boolean
  }

  'purchase_order.created': { orderId: string; number: string; supplierId: string; total: string }
  'purchase_order.placed': { orderId: string; number: string; total: string }
  'purchase_order.received': {
    orderId: string
    number: string
    fullyReceived: boolean
    payableId: string | null
    receivedTotal: string
  }
  'purchase_order.cancelled': { orderId: string; number: string; reason: string }

  'receivable.created': {
    receivableId: string
    orderId: string
    customerId: string
    amount: string
    dueDate: string
    instalment: number
    instalments: number
  }
  'receivable.settled': {
    receivableId: string
    settlementId: string
    amount: string
    outstandingAfter: string
    method: string
    settledOn: string
  }
  'payable.created': {
    payableId: string
    purchaseOrderId: string
    supplierId: string
    amount: string
    dueDate: string
  }
  'payable.settled': {
    payableId: string
    settlementId: string
    amount: string
    outstandingAfter: string
    method: string
    settledOn: string
  }
  'settlement.reversed': {
    settlementId: string
    titleKind: string
    titleId: string
    amount: string
    reason: string
  }

  'cash_session.opened': { sessionId: string; businessDate: string; openingBalance: string }
  'cash_session.closed': {
    sessionId: string
    businessDate: string
    openingBalance: string
    inflow: string
    outflow: string
    closingBalance: string
    unsettledTitles: number
    justification: string | null
  }

  'fiscal_document.issued': {
    documentId: string
    series: string
    number: string
    orderId: string
    total: string
  }
}

export type DomainEventType = keyof DomainEventPayloads & string

/** What a use case produces. Identity, tenant, actor and time are added on persist. */
export interface DomainEventDraft<T extends DomainEventType = DomainEventType> {
  readonly type: T
  readonly aggregateType: AggregateType
  readonly aggregateId: string
  readonly payload: DomainEventPayloads[T]
  /** Bumped when a payload shape changes, so old rows stay readable. */
  readonly version?: number
}

/** What the event store holds. */
export interface DomainEvent<
  T extends DomainEventType = DomainEventType,
> extends DomainEventDraft<T> {
  readonly id: DomainEventId
  readonly tenantId: TenantId
  readonly occurredAt: Date
  readonly actor: Actor
  readonly version: number
}

export function domainEvent<T extends DomainEventType>(
  type: T,
  aggregateType: AggregateType,
  aggregateId: string,
  payload: DomainEventPayloads[T],
): DomainEventDraft<T> {
  return { type, aggregateType, aggregateId, payload, version: 1 }
}

/**
 * Collects the facts recorded during one transaction. The implementation in
 * `packages/db` flushes them on commit; an in-memory implementation in tests
 * simply keeps the list, which is how domain tests assert on events without a
 * database.
 */
export interface EventRecorder {
  record(event: DomainEventDraft): void
  readonly recorded: readonly DomainEventDraft[]
}
