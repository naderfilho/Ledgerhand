import { hasCapability, ROLES, type Role } from '../auth/roles.js'
import type { RiskLevel, UseCaseDescriptor } from './definition.js'
import * as catalog from './catalog.js'
import * as finance from './finance.js'
import * as purchasing from './purchasing.js'
import * as reporting from './reporting.js'
import * as sales from './sales.js'
import * as stock from './stock.js'

/**
 * ---------------------------------------------------------------------------
 * The registry
 * ---------------------------------------------------------------------------
 * `USE_CASES` keeps every definition at its precise type, so application code
 * calls `USE_CASES.confirm_sales_order.execute({ orderId })` with full
 * inference. `DESCRIPTORS` is the same list flattened to a uniform shape for
 * code that iterates rather than calls: the MCP tool registry, the audit
 * viewer, the permission matrix in the docs.
 *
 * A descriptor cannot be executed without validating its input first -- that
 * is the whole point of `run` taking `unknown`. Everything reaching the domain
 * from a language model passes through a zod schema on the way in.
 */
export const USE_CASES = {
  // Catalogue
  create_product: catalog.createProduct,
  update_product: catalog.updateProduct,
  archive_product: catalog.archiveProduct,
  create_customer: catalog.createCustomer,
  create_supplier: catalog.createSupplier,
  list_products: catalog.listProducts,
  get_product: catalog.getProduct,
  list_customers: catalog.listCustomers,
  list_suppliers: catalog.listSuppliers,

  // Stock
  register_stock_entry: stock.registerStockEntry,
  register_stock_exit: stock.registerStockExit,
  adjust_stock: stock.adjustStock,
  get_stock_position: stock.getStockPosition,
  list_products_below_minimum: stock.listProductsBelowMinimum,
  list_stock_movements: stock.listStockMovements,

  // Sales
  create_sales_order: sales.createSalesOrder,
  update_sales_order_items: sales.updateSalesOrderItems,
  confirm_sales_order: sales.confirmSalesOrder,
  invoice_sales_order: sales.invoiceSalesOrder,
  cancel_sales_order: sales.cancelSalesOrder,
  list_sales_orders: sales.listSalesOrders,
  get_sales_order: sales.getSalesOrder,

  // Purchasing
  create_purchase_order: purchasing.createPurchaseOrder,
  place_purchase_order: purchasing.placePurchaseOrder,
  receive_purchase_order: purchasing.receivePurchaseOrder,
  cancel_purchase_order: purchasing.cancelPurchaseOrder,
  list_purchase_orders: purchasing.listPurchaseOrders,
  get_purchase_order: purchasing.getPurchaseOrder,

  // Finance
  settle_receivable: finance.settleReceivable,
  settle_payable: finance.settlePayable,
  reverse_settlement: finance.reverseSettlement,
  list_receivables: finance.listReceivables,
  list_payables: finance.listPayables,
  open_cash_session: finance.openCashSession,
  close_daily_cash: finance.closeDailyCash,
  get_cash_position: finance.getCashPosition,

  // Reporting
  report_sales_by_period: reporting.reportSalesByPeriod,
  report_cash_flow: reporting.reportCashFlow,
  report_stock_position: reporting.reportStockPosition,
  report_overdue_titles: reporting.reportOverdueTitles,
  get_current_context: reporting.getCurrentContext,
  list_domain_events: reporting.listDomainEvents,
} as const

export type UseCaseName = keyof typeof USE_CASES

export const DESCRIPTORS: readonly UseCaseDescriptor[] = Object.values(USE_CASES).map(
  (useCase) => useCase.descriptor,
)

export const DESCRIPTORS_BY_NAME: ReadonlyMap<string, UseCaseDescriptor> = new Map(
  DESCRIPTORS.map((descriptor) => [descriptor.name, descriptor]),
)

/**
 * The list an actor with this role is allowed to see. Used by `tools/list` so
 * that a tool the role cannot call is not merely refused at call time -- it is
 * never offered, and therefore never tempts the model into trying it.
 */
export function descriptorsForRole(role: Role): readonly UseCaseDescriptor[] {
  return DESCRIPTORS.filter((descriptor) => hasCapability(role, descriptor.capability))
}

export function riskOf(name: string): RiskLevel | null {
  return DESCRIPTORS_BY_NAME.get(name)?.risk ?? null
}

export function describePermissionMatrix(): readonly {
  readonly role: Role
  readonly allowed: readonly string[]
}[] {
  return ROLES.map((role) => ({
    role,
    allowed: descriptorsForRole(role).map((descriptor) => descriptor.name),
  }))
}
