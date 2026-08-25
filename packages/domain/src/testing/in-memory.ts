import type { Role } from '../auth/roles.js'
import type { Actor, ExecutionContext } from '../context/execution-context.js'
import type { DomainEventDraft, EventRecorder } from '../events/domain-event.js'
import { businessDateIn, compareBusinessDate, type BusinessDate } from '../kit/business-date.js'
import {
  asId,
  type CashSessionId,
  type CustomerId,
  type PayableId,
  type ProductId,
  type PurchaseOrderId,
  type ReceivableId,
  type SalesOrderId,
  type SettlementId,
  type Sku,
  type SupplierId,
  type TenantId,
  type UserId,
  type FiscalDocumentId,
} from '../kit/ids.js'
import { subMoney, sumMoney, ZERO_MONEY, type Money } from '../kit/money.js'
import { subQuantity } from '../kit/quantity.js'
import type { CashSession } from '../model/cash.js'
import {
  outstandingAmount,
  type Payable,
  type Receivable,
  type Settlement,
} from '../model/finance.js'
import type { FiscalDocument } from '../model/fiscal.js'
import type { Customer, Supplier } from '../model/party.js'
import type { Product } from '../model/product.js'
import type { PurchaseOrder } from '../model/purchase-order.js'
import type { SalesOrder } from '../model/sales-order.js'
import {
  emptyBalance,
  type StockAlert,
  type StockBalance,
  type StockMovement,
} from '../model/stock.js'
import type {
  CashRepository,
  CashFlowRow,
  CustomerRepository,
  FinanceRepository,
  FiscalRepository,
  Page,
  Paginated,
  PartyFilter,
  ProductFilter,
  ProductRepository,
  PurchaseOrderFilter,
  PurchaseOrderRepository,
  ReportingRepository,
  SalesByPeriodRow,
  SalesOrderFilter,
  SalesOrderRepository,
  StockMovementFilter,
  StockRepository,
  SupplierRepository,
  TitleFilter,
} from '../ports/repositories.js'
import type { IdGenerator, NumberSequence } from '../ports/services.js'
import type { UnitOfWork } from '../ports/unit-of-work.js'

/**
 * ---------------------------------------------------------------------------
 * In-memory unit of work
 * ---------------------------------------------------------------------------
 * A complete implementation of every port, backed by maps. It exists so the
 * domain can be tested at full speed with no database, and so the eval suite
 * can set up an exact starting state, run the agent and diff the result.
 *
 * It is deliberately not "a fake that always agrees": it enforces the same
 * uniqueness and filtering the SQL adapter does, so a test passing here and
 * failing against Postgres means the adapter is wrong -- which is exactly the
 * signal the integration tests in packages/db are there to give.
 */

const DEFAULT_TENANT = asId<TenantId>('11111111-1111-4111-8111-111111111111')
const DEFAULT_USER = asId<UserId>('22222222-2222-4222-8222-222222222222')

/** Deterministic ids: same scenario, same run, same identifiers, every time. */
export class SequentialIdGenerator implements IdGenerator {
  private counter = 0

  constructor(private readonly prefix = '00000000-0000-4000-8000') {}

  next(): string {
    this.counter += 1
    return `${this.prefix}-${this.counter.toString().padStart(12, '0')}`
  }
}

export class InMemoryEventRecorder implements EventRecorder {
  private readonly events: DomainEventDraft[] = []

  record(event: DomainEventDraft): void {
    this.events.push(event)
  }

  get recorded(): readonly DomainEventDraft[] {
    return this.events
  }

  typesRecorded(): readonly string[] {
    return this.events.map((event) => event.type)
  }

  clear(): void {
    this.events.length = 0
  }
}

class InMemorySequences implements NumberSequence {
  constructor(private readonly counters: Map<string, number>) {}

  async next(name: string): Promise<number> {
    const value = (this.counters.get(name) ?? 0) + 1
    this.counters.set(name, value)
    return await Promise.resolve(value)
  }
}

function paginate<T>(rows: readonly T[], page: Page | undefined): Paginated<T> {
  const limit = page?.limit ?? 50
  const offset = page?.offset ?? 0
  return { rows: rows.slice(offset, offset + limit), total: rows.length }
}

function matches(haystack: string, needle: string | undefined): boolean {
  return needle === undefined || haystack.toLowerCase().includes(needle.toLowerCase())
}

/** The shared store. Tests seed it directly; use cases go through the ports. */
export class InMemoryDatabase {
  readonly products = new Map<ProductId, Product>()
  readonly customers = new Map<CustomerId, Customer>()
  readonly suppliers = new Map<SupplierId, Supplier>()
  readonly balances = new Map<ProductId, StockBalance>()
  readonly movements: StockMovement[] = []
  readonly salesOrders = new Map<SalesOrderId, SalesOrder>()
  readonly purchaseOrders = new Map<PurchaseOrderId, PurchaseOrder>()
  readonly receivables = new Map<ReceivableId, Receivable>()
  readonly payables = new Map<PayableId, Payable>()
  readonly settlements = new Map<SettlementId, Settlement>()
  readonly cashSessions = new Map<CashSessionId, CashSession>()
  readonly fiscalDocuments = new Map<FiscalDocumentId, FiscalDocument>()
  /** Kept on the database so numbering survives a change of clock or role. */
  readonly sequenceCounters = new Map<string, number>()
}

class InMemoryProducts implements ProductRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async findById(id: ProductId): Promise<Product | null> {
    return await Promise.resolve(this.db.products.get(id) ?? null)
  }

  async findBySku(sku: Sku): Promise<Product | null> {
    const found = [...this.db.products.values()].find((product) => product.sku === sku)
    return await Promise.resolve(found ?? null)
  }

  async findManyByIds(ids: readonly ProductId[]): Promise<Map<ProductId, Product>> {
    const result = new Map<ProductId, Product>()
    for (const id of ids) {
      const product = this.db.products.get(id)
      if (product !== undefined) result.set(id, product)
    }
    return await Promise.resolve(result)
  }

  async list(filter: ProductFilter): Promise<Paginated<Product>> {
    const rows = [...this.db.products.values()]
      .filter((product) => (filter.activeOnly === true ? product.active : true))
      .filter(
        (product) => matches(product.sku, filter.search) || matches(product.name, filter.search),
      )
      .sort((a, b) => a.sku.localeCompare(b.sku))
    return await Promise.resolve(paginate(rows, filter.page))
  }

  async save(product: Product): Promise<void> {
    this.db.products.set(product.id, product)
    await Promise.resolve()
  }
}

class InMemoryCustomers implements CustomerRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async findById(id: CustomerId): Promise<Customer | null> {
    return await Promise.resolve(this.db.customers.get(id) ?? null)
  }

  async list(filter: PartyFilter): Promise<Paginated<Customer>> {
    const rows = [...this.db.customers.values()]
      .filter((customer) => (filter.activeOnly === true ? customer.active : true))
      .filter((customer) => matches(customer.name, filter.search))
      .sort((a, b) => a.name.localeCompare(b.name))
    return await Promise.resolve(paginate(rows, filter.page))
  }

  async save(customer: Customer): Promise<void> {
    this.db.customers.set(customer.id, customer)
    await Promise.resolve()
  }
}

class InMemorySuppliers implements SupplierRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async findById(id: SupplierId): Promise<Supplier | null> {
    return await Promise.resolve(this.db.suppliers.get(id) ?? null)
  }

  async list(filter: PartyFilter): Promise<Paginated<Supplier>> {
    const rows = [...this.db.suppliers.values()]
      .filter((supplier) => (filter.activeOnly === true ? supplier.active : true))
      .filter((supplier) => matches(supplier.name, filter.search))
      .sort((a, b) => a.name.localeCompare(b.name))
    return await Promise.resolve(paginate(rows, filter.page))
  }

  async save(supplier: Supplier): Promise<void> {
    this.db.suppliers.set(supplier.id, supplier)
    await Promise.resolve()
  }
}

class InMemoryStock implements StockRepository {
  constructor(
    private readonly db: InMemoryDatabase,
    private readonly clock: () => Date,
  ) {}

  async getBalance(productId: ProductId): Promise<StockBalance> {
    return await Promise.resolve(
      this.db.balances.get(productId) ?? emptyBalance(productId, this.clock()),
    )
  }

  async getBalanceForUpdate(productId: ProductId): Promise<StockBalance> {
    return await this.getBalance(productId)
  }

  async getBalances(productIds: readonly ProductId[]): Promise<Map<ProductId, StockBalance>> {
    const result = new Map<ProductId, StockBalance>()
    for (const productId of productIds) {
      result.set(productId, await this.getBalance(productId))
    }
    return result
  }

  async saveBalance(balance: StockBalance): Promise<void> {
    this.db.balances.set(balance.productId, balance)
    await Promise.resolve()
  }

  async appendMovement(movement: StockMovement): Promise<void> {
    this.db.movements.push(movement)
    await Promise.resolve()
  }

  async listMovements(filter: StockMovementFilter): Promise<Paginated<StockMovement>> {
    const rows = this.db.movements
      .filter(
        (movement) => filter.productId === undefined || movement.productId === filter.productId,
      )
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    return await Promise.resolve(paginate(rows, filter.page))
  }

  async listBelowMinimum(): Promise<readonly StockAlert[]> {
    const alerts: StockAlert[] = []
    for (const product of this.db.products.values()) {
      if (!product.active || product.minimumStock <= 0n) continue
      const balance = await this.getBalance(product.id)
      if (balance.onHand < product.minimumStock) {
        alerts.push({
          productId: product.id,
          sku: product.sku,
          name: product.name,
          onHand: balance.onHand,
          minimumStock: product.minimumStock,
          shortfall: subQuantity(product.minimumStock, balance.onHand),
        })
      }
    }
    return alerts.sort((a, b) => a.sku.localeCompare(b.sku))
  }
}

class InMemorySalesOrders implements SalesOrderRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async findById(id: SalesOrderId): Promise<SalesOrder | null> {
    return await Promise.resolve(this.db.salesOrders.get(id) ?? null)
  }

  async findByNumber(number: string): Promise<SalesOrder | null> {
    const found = [...this.db.salesOrders.values()].find((order) => order.number === number)
    return await Promise.resolve(found ?? null)
  }

  async list(filter: SalesOrderFilter): Promise<Paginated<SalesOrder>> {
    const rows = [...this.db.salesOrders.values()]
      .filter((order) => filter.status === undefined || filter.status.includes(order.status))
      .filter((order) => filter.customerId === undefined || order.customerId === filter.customerId)
      .filter(
        (order) =>
          filter.from === undefined || compareBusinessDate(order.issuedOn, filter.from) >= 0,
      )
      .filter(
        (order) => filter.to === undefined || compareBusinessDate(order.issuedOn, filter.to) <= 0,
      )
      .sort((a, b) => b.number.localeCompare(a.number))
    return await Promise.resolve(paginate(rows, filter.page))
  }

  async save(order: SalesOrder): Promise<void> {
    this.db.salesOrders.set(order.id, order)
    await Promise.resolve()
  }
}

class InMemoryPurchaseOrders implements PurchaseOrderRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async findById(id: PurchaseOrderId): Promise<PurchaseOrder | null> {
    return await Promise.resolve(this.db.purchaseOrders.get(id) ?? null)
  }

  async findByNumber(number: string): Promise<PurchaseOrder | null> {
    const found = [...this.db.purchaseOrders.values()].find((order) => order.number === number)
    return await Promise.resolve(found ?? null)
  }

  async list(filter: PurchaseOrderFilter): Promise<Paginated<PurchaseOrder>> {
    const rows = [...this.db.purchaseOrders.values()]
      .filter((order) => filter.status === undefined || filter.status.includes(order.status))
      .filter((order) => filter.supplierId === undefined || order.supplierId === filter.supplierId)
      .sort((a, b) => b.number.localeCompare(a.number))
    return await Promise.resolve(paginate(rows, filter.page))
  }

  async save(order: PurchaseOrder): Promise<void> {
    this.db.purchaseOrders.set(order.id, order)
    await Promise.resolve()
  }
}

function titleMatches(
  title: { dueDate: BusinessDate; status: string },
  filter: TitleFilter,
): boolean {
  if (filter.status !== undefined && !filter.status.includes(title.status as never)) return false
  if (filter.dueOn !== undefined && title.dueDate !== filter.dueOn) return false
  if (filter.dueBefore !== undefined && compareBusinessDate(title.dueDate, filter.dueBefore) >= 0) {
    return false
  }
  if (filter.overdueAsOf !== undefined) {
    if (title.status === 'settled' || title.status === 'cancelled') return false
    if (compareBusinessDate(title.dueDate, filter.overdueAsOf) >= 0) return false
  }
  return true
}

class InMemoryFinance implements FinanceRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async findReceivable(id: ReceivableId): Promise<Receivable | null> {
    return await Promise.resolve(this.db.receivables.get(id) ?? null)
  }

  async findPayable(id: PayableId): Promise<Payable | null> {
    return await Promise.resolve(this.db.payables.get(id) ?? null)
  }

  async listReceivables(filter: TitleFilter): Promise<Paginated<Receivable>> {
    const rows = [...this.db.receivables.values()]
      .filter((title) => titleMatches(title, filter))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    return await Promise.resolve(paginate(rows, filter.page))
  }

  async listPayables(filter: TitleFilter): Promise<Paginated<Payable>> {
    const rows = [...this.db.payables.values()]
      .filter((title) => titleMatches(title, filter))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    return await Promise.resolve(paginate(rows, filter.page))
  }

  async listReceivablesByOrder(orderId: SalesOrderId): Promise<readonly Receivable[]> {
    return await Promise.resolve(
      [...this.db.receivables.values()]
        .filter((title) => title.salesOrderId === orderId)
        .sort((a, b) => a.instalment - b.instalment),
    )
  }

  async saveReceivable(receivable: Receivable): Promise<void> {
    this.db.receivables.set(receivable.id, receivable)
    await Promise.resolve()
  }

  async savePayable(payable: Payable): Promise<void> {
    this.db.payables.set(payable.id, payable)
    await Promise.resolve()
  }

  async findSettlement(id: SettlementId): Promise<Settlement | null> {
    return await Promise.resolve(this.db.settlements.get(id) ?? null)
  }

  async appendSettlement(settlement: Settlement): Promise<void> {
    this.db.settlements.set(settlement.id, settlement)
    await Promise.resolve()
  }

  async saveSettlement(settlement: Settlement): Promise<void> {
    this.db.settlements.set(settlement.id, settlement)
    await Promise.resolve()
  }

  async listSettlementsOn(businessDate: BusinessDate): Promise<readonly Settlement[]> {
    return await Promise.resolve(
      [...this.db.settlements.values()].filter(
        (settlement) => settlement.settledOn === businessDate && settlement.reversedAt === null,
      ),
    )
  }

  async countUnsettledDueOn(businessDate: BusinessDate): Promise<number> {
    const open = [...[...this.db.receivables.values()], ...[...this.db.payables.values()]].filter(
      (title) =>
        title.dueDate === businessDate &&
        title.status !== 'settled' &&
        title.status !== 'cancelled',
    )
    return await Promise.resolve(open.length)
  }
}

class InMemoryCash implements CashRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async findByDate(businessDate: BusinessDate): Promise<CashSession | null> {
    const found = [...this.db.cashSessions.values()].find(
      (session) => session.businessDate === businessDate,
    )
    return await Promise.resolve(found ?? null)
  }

  async findById(id: CashSessionId): Promise<CashSession | null> {
    return await Promise.resolve(this.db.cashSessions.get(id) ?? null)
  }

  async findLatestClosed(before: BusinessDate): Promise<CashSession | null> {
    const found = [...this.db.cashSessions.values()]
      .filter(
        (session) =>
          session.status === 'closed' && compareBusinessDate(session.businessDate, before) < 0,
      )
      .sort((a, b) => b.businessDate.localeCompare(a.businessDate))[0]
    return await Promise.resolve(found ?? null)
  }

  async save(session: CashSession): Promise<void> {
    this.db.cashSessions.set(session.id, session)
    await Promise.resolve()
  }
}

class InMemoryFiscal implements FiscalRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async findById(id: FiscalDocumentId): Promise<FiscalDocument | null> {
    return await Promise.resolve(this.db.fiscalDocuments.get(id) ?? null)
  }

  async findBySalesOrder(orderId: SalesOrderId): Promise<FiscalDocument | null> {
    const found = [...this.db.fiscalDocuments.values()].find(
      (document) => document.salesOrderId === orderId,
    )
    return await Promise.resolve(found ?? null)
  }

  async save(document: FiscalDocument): Promise<void> {
    this.db.fiscalDocuments.set(document.id, document)
    await Promise.resolve()
  }
}

class InMemoryReporting implements ReportingRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async salesByPeriod(args: {
    readonly from: BusinessDate
    readonly to: BusinessDate
  }): Promise<readonly SalesByPeriodRow[]> {
    const invoiced = [...this.db.salesOrders.values()].filter(
      (order) =>
        order.status === 'invoiced' &&
        compareBusinessDate(order.issuedOn, args.from) >= 0 &&
        compareBusinessDate(order.issuedOn, args.to) <= 0,
    )
    const byPeriod = new Map<string, SalesOrder[]>()
    for (const order of invoiced) {
      const bucket = byPeriod.get(order.issuedOn) ?? []
      bucket.push(order)
      byPeriod.set(order.issuedOn, bucket)
    }

    return await Promise.resolve(
      [...byPeriod.entries()]
        .map(([period, orders]) => {
          const net = sumMoney(orders.map((order) => order.total))
          const discount = sumMoney(
            orders.flatMap((order) => order.items.map((item) => item.discount)),
          )
          return {
            period,
            orderCount: orders.length,
            gross: sumMoney([net, discount]),
            discount,
            net,
            cost: ZERO_MONEY,
            margin: net,
          }
        })
        .sort((a, b) => a.period.localeCompare(b.period)),
    )
  }

  async cashFlow(args: {
    readonly from: BusinessDate
    readonly to: BusinessDate
  }): Promise<readonly CashFlowRow[]> {
    return await Promise.resolve(
      [...this.db.cashSessions.values()]
        .filter(
          (session) =>
            compareBusinessDate(session.businessDate, args.from) >= 0 &&
            compareBusinessDate(session.businessDate, args.to) <= 0,
        )
        .sort((a, b) => a.businessDate.localeCompare(b.businessDate))
        .map((session) => ({
          businessDate: session.businessDate,
          openingBalance: session.openingBalance,
          inflow: session.inflow,
          outflow: session.outflow,
          closingBalance:
            session.closingBalance ??
            subMoney(sumMoney([session.openingBalance, session.inflow]), session.outflow),
          status: session.status,
        })),
    )
  }
}

export interface TestContextOptions {
  readonly role?: Role
  readonly now?: Date
  readonly timeZone?: string
  readonly tenantId?: TenantId
  readonly userId?: UserId
  readonly actor?: Actor
  readonly database?: InMemoryDatabase
}

export interface TestHarness {
  readonly context: ExecutionContext
  readonly db: InMemoryDatabase
  readonly events: InMemoryEventRecorder
  readonly ids: SequentialIdGenerator
  /** Same harness, different clock or role -- for multi-day and multi-user scenarios. */
  readonly withOverrides: (overrides: TestContextOptions) => TestHarness
  readonly today: BusinessDate
  readonly outstandingOf: (title: Receivable | Payable) => Money
}

/**
 * Builds a fully wired execution context over in-memory storage. Time is fixed
 * unless a test says otherwise, so anything date-dependent is reproducible.
 */
export function createTestHarness(options: TestContextOptions = {}): TestHarness {
  const db = options.database ?? new InMemoryDatabase()
  const events = new InMemoryEventRecorder()
  const ids = new SequentialIdGenerator()
  const now = options.now ?? new Date('2026-03-16T13:00:00.000Z')
  const timeZone = options.timeZone ?? 'America/Sao_Paulo'
  const tenantId = options.tenantId ?? DEFAULT_TENANT
  const userId = options.userId ?? DEFAULT_USER

  const uow: UnitOfWork = {
    products: new InMemoryProducts(db),
    customers: new InMemoryCustomers(db),
    suppliers: new InMemorySuppliers(db),
    stock: new InMemoryStock(db, () => now),
    salesOrders: new InMemorySalesOrders(db),
    purchaseOrders: new InMemoryPurchaseOrders(db),
    finance: new InMemoryFinance(db),
    cash: new InMemoryCash(db),
    fiscal: new InMemoryFiscal(db),
    reporting: new InMemoryReporting(db),
    sequences: new InMemorySequences(db.sequenceCounters),
    ids,
    events,
  }

  const context: ExecutionContext = {
    tenantId,
    userId,
    role: options.role ?? 'admin',
    actor: options.actor ?? { kind: 'user', userId },
    now,
    timeZone,
    currency: 'BRL',
    uow,
  }

  return {
    context,
    db,
    events,
    ids,
    today: businessDateIn(now, timeZone),
    outstandingOf: outstandingAmount,
    withOverrides: (overrides) => createTestHarness({ ...options, ...overrides, database: db }),
  }
}
