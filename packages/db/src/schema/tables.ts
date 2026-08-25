import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { businessDate, money, quantity, unitValue } from './columns.js'

/**
 * ---------------------------------------------------------------------------
 * Schema
 * ---------------------------------------------------------------------------
 * Every business table carries `tenant_id`, and row level security is applied
 * to all of them in `drizzle/0001_row_level_security.sql`. The column is not a
 * convention the application is trusted to honour: the database refuses to
 * return another tenant's rows to the application role, and there is a test
 * that proves it.
 */

export const userRole = pgEnum('user_role', ['admin', 'sales', 'finance', 'stock', 'readonly'])
export const productUnit = pgEnum('product_unit', [
  'unit',
  'box',
  'pack',
  'kg',
  'g',
  'l',
  'ml',
  'm',
])
export const stockMovementKind = pgEnum('stock_movement_kind', ['entry', 'exit', 'adjustment'])
export const stockMovementReason = pgEnum('stock_movement_reason', [
  'purchase_receipt',
  'sales_invoice',
  'sales_cancellation',
  'manual_entry',
  'manual_exit',
  'inventory_count',
  'loss',
  'opening_balance',
])
export const salesOrderStatus = pgEnum('sales_order_status', [
  'draft',
  'confirmed',
  'invoiced',
  'cancelled',
])
export const purchaseOrderStatus = pgEnum('purchase_order_status', [
  'draft',
  'placed',
  'partially_received',
  'received',
  'cancelled',
])
export const titleKind = pgEnum('title_kind', ['receivable', 'payable'])
export const titleStatus = pgEnum('title_status', [
  'open',
  'partially_settled',
  'settled',
  'cancelled',
])
export const settlementMethod = pgEnum('settlement_method', [
  'cash',
  'bank_transfer',
  'pix',
  'card',
  'cheque',
  'other',
])
export const cashSessionStatus = pgEnum('cash_session_status', ['open', 'closed'])
export const fiscalDocumentStatus = pgEnum('fiscal_document_status', ['issued', 'cancelled'])
export const actorKind = pgEnum('actor_kind', ['user', 'agent', 'system'])

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  /** IANA zone; business dates are derived in it. */
  timeZone: text('time_zone').notNull().default('America/Sao_Paulo'),
  currency: text('currency').notNull().default('BRL'),
  ...timestamps,
})

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name').notNull(),
    /** Argon2id. Never a plain hash, never reversible. */
    passwordHash: text('password_hash').notNull(),
    role: userRole('role').notNull(),
    active: boolean('active').notNull().default(true),
    ...timestamps,
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)],
)

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    unit: productUnit('unit').notNull().default('unit'),
    salePrice: unitValue('sale_price').notNull(),
    // Expressed as SQL rather than as a value: the column carries a scaled
    // bigint, and drizzle-kit serialises snapshots with JSON.stringify.
    minimumStock: quantity('minimum_stock')
      .notNull()
      .default(sql`0`),
    active: boolean('active').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('products_tenant_sku_unique').on(table.tenantId, table.sku),
    index('products_tenant_name_idx').on(table.tenantId, table.name),
  ],
)

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    taxId: text('tax_id'),
    email: text('email'),
    phone: text('phone'),
    notes: text('notes'),
    paymentTermDays: integer('payment_term_days').notNull().default(30),
    active: boolean('active').notNull().default(true),
    ...timestamps,
  },
  (table) => [index('customers_tenant_name_idx').on(table.tenantId, table.name)],
)

export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    taxId: text('tax_id'),
    email: text('email'),
    phone: text('phone'),
    notes: text('notes'),
    paymentTermDays: integer('payment_term_days').notNull().default(30),
    active: boolean('active').notNull().default(true),
    ...timestamps,
  },
  (table) => [index('suppliers_tenant_name_idx').on(table.tenantId, table.name)],
)

export const stockBalances = pgTable(
  'stock_balances',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .primaryKey()
      .references(() => products.id, { onDelete: 'cascade' }),
    onHand: quantity('on_hand').notNull(),
    reserved: quantity('reserved').notNull(),
    averageCost: unitValue('average_cost').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('stock_balances_tenant_idx').on(table.tenantId)],
)

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    kind: stockMovementKind('kind').notNull(),
    reason: stockMovementReason('reason').notNull(),
    /** Signed: negative for exits and downward adjustments. */
    quantity: quantity('quantity').notNull(),
    unitCost: unitValue('unit_cost').notNull(),
    totalCost: money('total_cost').notNull(),
    onHandAfter: quantity('on_hand_after').notNull(),
    averageCostAfter: unitValue('average_cost_after').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    referenceKind: text('reference_kind'),
    referenceId: uuid('reference_id'),
    note: text('note'),
  },
  (table) => [
    index('stock_movements_product_idx').on(table.tenantId, table.productId, table.occurredAt),
    index('stock_movements_reference_idx').on(table.referenceKind, table.referenceId),
  ],
)

export const salesOrders = pgTable(
  'sales_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    number: text('number').notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    status: salesOrderStatus('status').notNull().default('draft'),
    issuedOn: businessDate('issued_on').notNull(),
    total: money('total').notNull(),
    instalments: integer('instalments').notNull().default(1),
    notes: text('notes'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    invoicedAt: timestamp('invoiced_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancellationReason: text('cancellation_reason'),
    fiscalDocumentId: uuid('fiscal_document_id'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('sales_orders_tenant_number_unique').on(table.tenantId, table.number),
    index('sales_orders_tenant_status_idx').on(table.tenantId, table.status, table.issuedOn),
    index('sales_orders_customer_idx').on(table.tenantId, table.customerId),
  ],
)

export const salesOrderItems = pgTable(
  'sales_order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => salesOrders.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    sku: text('sku').notNull(),
    description: text('description').notNull(),
    quantity: quantity('quantity').notNull(),
    unitPrice: unitValue('unit_price').notNull(),
    discount: money('discount').notNull(),
    total: money('total').notNull(),
    /** The average cost at the moment of invoicing; null until then. */
    unitCostAtInvoice: unitValue('unit_cost_at_invoice'),
  },
  (table) => [
    index('sales_order_items_order_idx').on(table.orderId, table.position),
    uniqueIndex('sales_order_items_order_position_unique').on(table.orderId, table.position),
  ],
)

export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    number: text('number').notNull(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    status: purchaseOrderStatus('status').notNull().default('draft'),
    issuedOn: businessDate('issued_on').notNull(),
    expectedOn: businessDate('expected_on'),
    total: money('total').notNull(),
    notes: text('notes'),
    placedAt: timestamp('placed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancellationReason: text('cancellation_reason'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('purchase_orders_tenant_number_unique').on(table.tenantId, table.number),
    index('purchase_orders_tenant_status_idx').on(table.tenantId, table.status),
  ],
)

export const purchaseOrderItems = pgTable(
  'purchase_order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    sku: text('sku').notNull(),
    description: text('description').notNull(),
    quantity: quantity('quantity').notNull(),
    receivedQuantity: quantity('received_quantity').notNull(),
    unitCost: unitValue('unit_cost').notNull(),
    total: money('total').notNull(),
  },
  (table) => [
    uniqueIndex('purchase_order_items_order_position_unique').on(table.orderId, table.position),
  ],
)

export const fiscalDocuments = pgTable(
  'fiscal_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    series: text('series').notNull(),
    number: text('number').notNull(),
    salesOrderId: uuid('sales_order_id')
      .notNull()
      .references(() => salesOrders.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    total: money('total').notNull(),
    status: fiscalDocumentStatus('status').notNull().default('issued'),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancellationReason: text('cancellation_reason'),
    pdfPath: text('pdf_path'),
  },
  (table) => [
    // The gap-free promise, enforced by the database rather than by hope.
    uniqueIndex('fiscal_documents_tenant_series_number_unique').on(
      table.tenantId,
      table.series,
      table.number,
    ),
    index('fiscal_documents_order_idx').on(table.salesOrderId),
  ],
)

export const receivables = pgTable(
  'receivables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    salesOrderId: uuid('sales_order_id')
      .notNull()
      .references(() => salesOrders.id, { onDelete: 'restrict' }),
    amount: money('amount').notNull(),
    settledAmount: money('settled_amount').notNull(),
    issuedOn: businessDate('issued_on').notNull(),
    dueDate: businessDate('due_date').notNull(),
    status: titleStatus('status').notNull().default('open'),
    description: text('description').notNull(),
    instalment: integer('instalment').notNull().default(1),
    instalments: integer('instalments').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    index('receivables_tenant_due_idx').on(table.tenantId, table.dueDate, table.status),
    index('receivables_order_idx').on(table.salesOrderId, table.instalment),
  ],
)

export const payables = pgTable(
  'payables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'restrict' }),
    amount: money('amount').notNull(),
    settledAmount: money('settled_amount').notNull(),
    issuedOn: businessDate('issued_on').notNull(),
    dueDate: businessDate('due_date').notNull(),
    status: titleStatus('status').notNull().default('open'),
    description: text('description').notNull(),
    instalment: integer('instalment').notNull().default(1),
    instalments: integer('instalments').notNull().default(1),
    ...timestamps,
  },
  (table) => [index('payables_tenant_due_idx').on(table.tenantId, table.dueDate, table.status)],
)

export const settlements = pgTable(
  'settlements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    titleKind: titleKind('title_kind').notNull(),
    titleId: uuid('title_id').notNull(),
    amount: money('amount').notNull(),
    settledOn: businessDate('settled_on').notNull(),
    method: settlementMethod('method').notNull(),
    note: text('note'),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    reversalReason: text('reversal_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('settlements_title_idx').on(table.titleKind, table.titleId),
    index('settlements_tenant_date_idx').on(table.tenantId, table.settledOn),
  ],
)

export const cashSessions = pgTable(
  'cash_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    businessDate: businessDate('business_date').notNull(),
    status: cashSessionStatus('status').notNull().default('open'),
    openingBalance: money('opening_balance').notNull(),
    inflow: money('inflow').notNull(),
    outflow: money('outflow').notNull(),
    closingBalance: money('closing_balance'),
    countedBalance: money('counted_balance'),
    difference: money('difference'),
    unsettledTitles: integer('unsettled_titles').notNull().default(0),
    justification: text('justification'),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
    openedBy: uuid('opened_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: uuid('closed_by').references(() => users.id, { onDelete: 'restrict' }),
  },
  (table) => [
    // One session per tenant per day, enforced where it cannot be raced.
    uniqueIndex('cash_sessions_tenant_date_unique').on(table.tenantId, table.businessDate),
  ],
)

/**
 * Named counters. `next_value` is bumped inside the caller transaction with a
 * row lock, which is what makes fiscal numbering gap-free even when two
 * invoices are issued at the same instant. A Postgres SEQUENCE would be faster
 * and would leave gaps on rollback, which a fiscal series may not have.
 */
export const numberSequences = pgTable(
  'number_sequences',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    nextValue: integer('next_value').notNull().default(1),
  },
  (table) => [uniqueIndex('number_sequences_tenant_name_unique').on(table.tenantId, table.name)],
)

/**
 * The append-only record of everything that happened, written in the same
 * transaction as the change it describes. `agent_run_id` is what links a stock
 * movement back to the agent run that caused it.
 */
export const domainEvents = pgTable(
  'domain_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    version: integer('version').notNull().default(1),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    payload: jsonb('payload').notNull(),
    actorKind: actorKind('actor_kind').notNull(),
    actorId: uuid('actor_id'),
    agentRunId: uuid('agent_run_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('domain_events_tenant_time_idx').on(table.tenantId, table.occurredAt),
    index('domain_events_aggregate_idx').on(table.aggregateType, table.aggregateId),
    index('domain_events_agent_run_idx').on(table.agentRunId),
  ],
)

/**
 * Lets a caller retry a write it is unsure about. The request hash is stored so
 * that reusing a key with different arguments is caught rather than replaying
 * the wrong answer.
 */
export const idempotencyRecords = pgTable(
  'idempotency_records',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    operation: text('operation').notNull(),
    requestHash: text('request_hash').notNull(),
    response: jsonb('response').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idempotency_tenant_key_operation_unique').on(
      table.tenantId,
      table.key,
      table.operation,
    ),
  ],
)
