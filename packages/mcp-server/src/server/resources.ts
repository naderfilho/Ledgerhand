import type { JsonObject } from '@ledgerhand/domain'

/**
 * ---------------------------------------------------------------------------
 * Resources
 * ---------------------------------------------------------------------------
 * The handful of answers an agent needs so often that making it assemble them
 * from tool calls is waste: what is in the catalogue, what is below minimum,
 * what is overdue, what today's cash looks like.
 *
 * Every resource is a use case behind a URI, never a query of its own. A
 * resource can therefore never show something the caller's role could not have
 * asked for through a tool -- the same authorisation runs, in the same place.
 */

export interface ResourceOperation {
  readonly operation: string
  readonly input: JsonObject
}

export interface ResourceContext {
  /** Today in the tenant's timezone, from the ERP rather than from the clock here. */
  readonly today: string
}

export interface ErpResource {
  readonly uri: string
  readonly name: string
  readonly title: string
  readonly description: string
  readonly operation: string
  readonly build: (context: ResourceContext) => ResourceOperation
}

export interface ErpResourceTemplate {
  readonly uriTemplate: string
  readonly pattern: RegExp
  readonly name: string
  readonly title: string
  readonly description: string
  readonly operation: string
  readonly build: (variables: readonly string[], context: ResourceContext) => ResourceOperation
}

export const RESOURCE_MIME_TYPE = 'application/json'

export const RESOURCES: readonly ErpResource[] = [
  {
    uri: 'erp://catalog/products',
    name: 'catalog-products',
    title: 'Product catalogue',
    description:
      'Every active product with its SKU, unit, selling price and minimum stock. Quantities on hand are not here -- read erp://stock/position for those.',
    operation: 'list_products',
    build: () => ({
      operation: 'list_products',
      input: { activeOnly: true, page: { limit: 200, offset: 0 } },
    }),
  },
  {
    uri: 'erp://stock/position',
    name: 'stock-position',
    title: 'Stock position',
    description:
      'On hand, reserved, available to promise, average cost and value for every active product.',
    operation: 'get_stock_position',
    build: () => ({ operation: 'get_stock_position', input: { limit: 200 } }),
  },
  {
    uri: 'erp://stock/below-minimum',
    name: 'stock-below-minimum',
    title: 'Products below minimum stock',
    description:
      'Products whose quantity on hand is under their configured minimum, with the shortfall. The starting point for a replenishment run.',
    operation: 'list_products_below_minimum',
    build: () => ({ operation: 'list_products_below_minimum', input: {} }),
  },
  {
    uri: 'erp://sales/orders/pending',
    name: 'sales-orders-pending',
    title: 'Confirmed sales orders awaiting invoicing',
    description:
      'Sales orders that are confirmed -- stock is reserved for them -- and have not been invoiced yet.',
    operation: 'list_sales_orders',
    build: () => ({
      operation: 'list_sales_orders',
      input: { status: ['confirmed'], limit: 100, offset: 0 },
    }),
  },
  {
    uri: 'erp://finance/receivables/overdue',
    name: 'receivables-overdue',
    title: 'Overdue receivables',
    description: 'Everything customers owe that is past its due date, with the outstanding amount.',
    operation: 'list_receivables',
    build: () => ({
      operation: 'list_receivables',
      input: { overdueOnly: true, limit: 200, offset: 0 },
    }),
  },
  {
    uri: 'erp://finance/payables/due-today',
    name: 'payables-due-today',
    title: 'Payables due today',
    description: 'Supplier obligations dated for today in the tenant timezone.',
    operation: 'list_payables',
    build: (context) => ({
      operation: 'list_payables',
      input: { dueOn: context.today, limit: 200, offset: 0 },
    }),
  },
  {
    uri: 'erp://cash/today',
    name: 'cash-today',
    title: "Today's cash session",
    description:
      'The cash session for today: whether it is open, the opening balance, money in and out, the expected closing balance and how many titles due today are still unsettled.',
    operation: 'get_cash_position',
    build: () => ({ operation: 'get_cash_position', input: {} }),
  },
]

export const RESOURCE_TEMPLATES: readonly ErpResourceTemplate[] = [
  {
    uriTemplate: 'erp://reports/sales/{from}/{to}',
    pattern: /^erp:\/\/reports\/sales\/([^/]+)\/([^/]+)$/,
    name: 'sales-report',
    title: 'Sales report for a period',
    description:
      'Invoiced sales between two dates (YYYY-MM-DD), by day: order count, gross, discounts, net revenue, cost and margin.',
    operation: 'report_sales_by_period',
    build: (variables) => ({
      operation: 'report_sales_by_period',
      input: {
        from: decodeURIComponent(variables[0] ?? ''),
        to: decodeURIComponent(variables[1] ?? ''),
        granularity: 'day',
      },
    }),
  },
  {
    uriTemplate: 'erp://fiscal/documents/{series}/{number}',
    pattern: /^erp:\/\/fiscal\/documents\/([^/]+)\/([^/]+)$/,
    name: 'fiscal-document',
    title: 'Fiscal document',
    description:
      'One issued fiscal document by series and number, with its total and status. The document is simulated -- see ADR 0007 -- so this is its data, not a PDF.',
    operation: 'get_fiscal_document',
    build: (variables) => ({
      operation: 'get_fiscal_document',
      input: {
        series: decodeURIComponent(variables[0] ?? ''),
        number: decodeURIComponent(variables[1] ?? ''),
      },
    }),
  },
]

export interface ResolvedResource {
  readonly operation: string
  readonly build: (context: ResourceContext) => ResourceOperation
}

export function resolveResource(uri: string): ResolvedResource | null {
  const fixed = RESOURCES.find((resource) => resource.uri === uri)
  if (fixed !== undefined) return { operation: fixed.operation, build: fixed.build }

  for (const template of RESOURCE_TEMPLATES) {
    const matched = template.pattern.exec(uri)
    if (matched === null) continue
    const variables = matched.slice(1)
    return {
      operation: template.operation,
      build: (context) => template.build(variables, context),
    }
  }
  return null
}
