import type { EventRecorder } from '../events/domain-event.js'
import type {
  AuditRepository,
  CashRepository,
  CustomerRepository,
  FinanceRepository,
  FiscalRepository,
  ProductRepository,
  ReportingRepository,
  PurchaseOrderRepository,
  SalesOrderRepository,
  StockRepository,
  SupplierRepository,
} from './repositories.js'
import type { IdGenerator, NumberSequence } from './services.js'

/**
 * One transaction, one unit of work. Everything a use case touches -- rows and
 * the events describing what happened to them -- commits or rolls back
 * together. Invoicing an order that fails while creating its receivables must
 * not leave a consumed fiscal number and shipped stock behind.
 *
 * Use cases never open or commit the transaction themselves; the adapter that
 * builds the context does, which is what keeps `packages/domain` free of any
 * database concept at all.
 */
export interface UnitOfWork {
  readonly products: ProductRepository
  readonly customers: CustomerRepository
  readonly suppliers: SupplierRepository
  readonly stock: StockRepository
  readonly salesOrders: SalesOrderRepository
  readonly purchaseOrders: PurchaseOrderRepository
  readonly finance: FinanceRepository
  readonly cash: CashRepository
  readonly fiscal: FiscalRepository
  readonly reporting: ReportingRepository
  readonly audit: AuditRepository
  readonly sequences: NumberSequence
  readonly ids: IdGenerator
  readonly events: EventRecorder
}
