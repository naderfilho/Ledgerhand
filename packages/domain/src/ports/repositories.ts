import type { BusinessDate } from '../kit/business-date.js'
import type {
  CashSessionId,
  CustomerId,
  FiscalDocumentId,
  PayableId,
  ProductId,
  PurchaseOrderId,
  ReceivableId,
  SalesOrderId,
  SettlementId,
  Sku,
  SupplierId,
} from '../kit/ids.js'
import type { Money } from '../kit/money.js'
import type { CashSession } from '../model/cash.js'
import type { Payable, Receivable, Settlement, TitleStatus } from '../model/finance.js'
import type { FiscalDocument } from '../model/fiscal.js'
import type { Customer, Supplier } from '../model/party.js'
import type { Product } from '../model/product.js'
import type { PurchaseOrder, PurchaseOrderStatus } from '../model/purchase-order.js'
import type { SalesOrder, SalesOrderStatus } from '../model/sales-order.js'
import type { StockAlert, StockBalance, StockMovement } from '../model/stock.js'

/**
 * Repositories are already scoped to one tenant and one transaction: a unit of
 * work is built from an ExecutionContext, so no method takes a tenant id and
 * no caller can forget to pass one. Postgres row level security enforces the
 * same boundary a second time, from below.
 */

export interface Page {
  readonly limit: number
  readonly offset: number
}

export interface Paginated<T> {
  readonly rows: readonly T[]
  readonly total: number
}

export const DEFAULT_PAGE: Page = { limit: 50, offset: 0 }

export interface ProductFilter {
  readonly search?: string
  readonly activeOnly?: boolean
  readonly page?: Page
}

export interface ProductRepository {
  findById(id: ProductId): Promise<Product | null>
  findBySku(sku: Sku): Promise<Product | null>
  findManyByIds(ids: readonly ProductId[]): Promise<Map<ProductId, Product>>
  list(filter: ProductFilter): Promise<Paginated<Product>>
  save(product: Product): Promise<void>
}

export interface PartyFilter {
  readonly search?: string
  readonly activeOnly?: boolean
  readonly page?: Page
}

export interface CustomerRepository {
  findById(id: CustomerId): Promise<Customer | null>
  list(filter: PartyFilter): Promise<Paginated<Customer>>
  save(customer: Customer): Promise<void>
}

export interface SupplierRepository {
  findById(id: SupplierId): Promise<Supplier | null>
  list(filter: PartyFilter): Promise<Paginated<Supplier>>
  save(supplier: Supplier): Promise<void>
}

export interface StockMovementFilter {
  readonly productId?: ProductId
  readonly from?: BusinessDate
  readonly to?: BusinessDate
  readonly page?: Page
}

export interface StockRepository {
  /**
   * Returns the balance, locking the row for the rest of the transaction.
   * Concurrent confirmations of the same product must not both see the same
   * available quantity.
   */
  getBalanceForUpdate(productId: ProductId): Promise<StockBalance>
  getBalance(productId: ProductId): Promise<StockBalance>
  getBalances(productIds: readonly ProductId[]): Promise<Map<ProductId, StockBalance>>
  saveBalance(balance: StockBalance): Promise<void>
  appendMovement(movement: StockMovement): Promise<void>
  listMovements(filter: StockMovementFilter): Promise<Paginated<StockMovement>>
  listBelowMinimum(): Promise<readonly StockAlert[]>
}

export interface SalesOrderFilter {
  readonly status?: readonly SalesOrderStatus[]
  readonly customerId?: CustomerId
  readonly from?: BusinessDate
  readonly to?: BusinessDate
  readonly page?: Page
}

export interface SalesOrderRepository {
  findById(id: SalesOrderId): Promise<SalesOrder | null>
  findByNumber(number: string): Promise<SalesOrder | null>
  list(filter: SalesOrderFilter): Promise<Paginated<SalesOrder>>
  save(order: SalesOrder): Promise<void>
}

export interface PurchaseOrderFilter {
  readonly status?: readonly PurchaseOrderStatus[]
  readonly supplierId?: SupplierId
  readonly page?: Page
}

export interface PurchaseOrderRepository {
  findById(id: PurchaseOrderId): Promise<PurchaseOrder | null>
  findByNumber(number: string): Promise<PurchaseOrder | null>
  list(filter: PurchaseOrderFilter): Promise<Paginated<PurchaseOrder>>
  save(order: PurchaseOrder): Promise<void>
}

export interface TitleFilter {
  readonly status?: readonly TitleStatus[]
  readonly dueBefore?: BusinessDate
  readonly dueOn?: BusinessDate
  readonly overdueAsOf?: BusinessDate
  readonly page?: Page
}

export interface FinanceRepository {
  findReceivable(id: ReceivableId): Promise<Receivable | null>
  findPayable(id: PayableId): Promise<Payable | null>
  listReceivables(filter: TitleFilter): Promise<Paginated<Receivable>>
  listPayables(filter: TitleFilter): Promise<Paginated<Payable>>
  listReceivablesByOrder(orderId: SalesOrderId): Promise<readonly Receivable[]>
  saveReceivable(receivable: Receivable): Promise<void>
  savePayable(payable: Payable): Promise<void>
  findSettlement(id: SettlementId): Promise<Settlement | null>
  appendSettlement(settlement: Settlement): Promise<void>
  saveSettlement(settlement: Settlement): Promise<void>
  listSettlementsOn(businessDate: BusinessDate): Promise<readonly Settlement[]>
  /** Titles due on a business day that are neither settled nor cancelled. */
  countUnsettledDueOn(businessDate: BusinessDate): Promise<number>
}

export interface CashRepository {
  findByDate(businessDate: BusinessDate): Promise<CashSession | null>
  findById(id: CashSessionId): Promise<CashSession | null>
  findLatestClosed(before: BusinessDate): Promise<CashSession | null>
  save(session: CashSession): Promise<void>
}

export interface FiscalRepository {
  findById(id: FiscalDocumentId): Promise<FiscalDocument | null>
  findBySalesOrder(orderId: SalesOrderId): Promise<FiscalDocument | null>
  save(document: FiscalDocument): Promise<void>
}

/**
 * Reports are aggregate queries, not business rules: pushing the grouping down
 * to SQL is both faster and more honest than loading every order into memory
 * and summing it in TypeScript. They live behind a port so the domain still
 * owns the shape of the answer.
 */
export interface SalesByPeriodRow {
  /** `YYYY-MM-DD`, `YYYY-Www` or `YYYY-MM` depending on the granularity. */
  readonly period: string
  readonly orderCount: number
  readonly gross: Money
  readonly discount: Money
  readonly net: Money
  readonly cost: Money
  readonly margin: Money
}

export interface CashFlowRow {
  readonly businessDate: BusinessDate
  readonly openingBalance: Money
  readonly inflow: Money
  readonly outflow: Money
  readonly closingBalance: Money
  readonly status: 'open' | 'closed'
}

export type ReportGranularity = 'day' | 'week' | 'month'

export interface ReportingRepository {
  salesByPeriod(args: {
    readonly from: BusinessDate
    readonly to: BusinessDate
    readonly granularity: ReportGranularity
  }): Promise<readonly SalesByPeriodRow[]>
  cashFlow(args: {
    readonly from: BusinessDate
    readonly to: BusinessDate
  }): Promise<readonly CashFlowRow[]>
}

/**
 * The audit trail. Read-only by construction: `domain_events` is append-only
 * and the application role has no UPDATE or DELETE on it, so there is nothing
 * to expose but a query.
 */
export interface PersistedEvent {
  readonly id: string
  readonly type: string
  readonly aggregateType: string
  readonly aggregateId: string
  readonly payload: Readonly<Record<string, unknown>>
  readonly actorKind: 'user' | 'agent' | 'system'
  readonly actorId: string | null
  readonly agentRunId: string | null
  readonly occurredAt: Date
}

export interface EventFilter {
  readonly types?: readonly string[]
  readonly aggregateType?: string
  readonly aggregateId?: string
  readonly agentRunId?: string
  readonly actorKind?: 'user' | 'agent' | 'system'
  readonly page?: Page
}

export interface AuditRepository {
  listEvents(filter: EventFilter): Promise<Paginated<PersistedEvent>>
  /** Distinct actors, for the filter control on the audit screen. */
  countByActorKind(): Promise<Readonly<Record<string, number>>>
}
