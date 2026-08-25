import { beforeEach, describe, expect, it } from 'vitest'
import type { JsonValue } from '../kit/json.js'
import type { IdempotencyRecord, IdempotencyStore } from '../ports/services.js'
import { createTestHarness, type TestHarness } from '../testing/index.js'
import { runOperation, type OperationDependencies } from './operations.js'
import { DESCRIPTORS } from './registry.js'

/**
 * ---------------------------------------------------------------------------
 * Every operation, presented
 * ---------------------------------------------------------------------------
 * One trading day, run entirely through the boundary a remote caller uses:
 * a name, a blob of JSON, and `runOperation`. Two things are checked of every
 * step, and a third at the end.
 *
 *  - the operation succeeds with realistic arguments;
 *  - its result survives `JSON.stringify`, which is where a leaked `bigint`
 *    would surface as a thrown TypeError rather than as a wrong number;
 *  - and the registry is exhausted, so adding a use case without teaching it
 *    to present itself fails here instead of in front of a language model.
 */

class NoIdempotency implements IdempotencyStore {
  find(): Promise<IdempotencyRecord | null> {
    return Promise.resolve(null)
  }

  save(): Promise<void> {
    return Promise.resolve()
  }
}

let harness: TestHarness
let dependencies: OperationDependencies
let exercised: Set<string>

beforeEach(() => {
  harness = createTestHarness()
  dependencies = { idempotency: new NoIdempotency(), hash: (canonical) => canonical }
  exercised = new Set<string>()
})

async function call(name: string, input: unknown = {}): Promise<JsonValue> {
  const outcome = await runOperation({ name, input }, harness.context, dependencies)
  if (!outcome.ok) {
    throw new Error(`${name} was refused: ${outcome.error.code} -- ${outcome.error.message}`)
  }
  exercised.add(name)
  // A branded bigint that escaped a presenter throws here, by design.
  expect(() => JSON.stringify(outcome.value)).not.toThrow()
  return outcome.value
}

/** Reads a string out of a presented result: `at(order, 'items.0.sku')`. */
function at(value: JsonValue, path: string): string {
  let current: unknown = value
  for (const key of path.split('.')) {
    current = (current as Record<string, unknown> | undefined)?.[key]
  }
  if (typeof current !== 'string') {
    throw new Error(`Expected a string at "${path}", found ${JSON.stringify(current)}`)
  }
  return current
}

describe('the whole registry, through runOperation', () => {
  it('runs a trading day and presents every result as JSON', async () => {
    // Catalogue
    const widget = await call('create_product', {
      sku: 'WID-01',
      name: 'Widget',
      unit: 'unit',
      salePrice: '49.90',
      minimumStock: '5',
    })
    const productId = at(widget, 'id')
    await call('update_product', { productId, name: 'Widget mk2' })

    const spare = await call('create_product', {
      sku: 'WID-02',
      name: 'Spare widget',
      salePrice: '9.90',
    })
    const customer = await call('create_customer', { name: 'Ana Ltda', paymentTermDays: 15 })
    const supplier = await call('create_supplier', { name: 'Fornecedora SA' })
    const customerId = at(customer, 'id')
    const supplierId = at(supplier, 'id')

    // Stock
    await call('register_stock_entry', { productId, quantity: '100', unitCost: '20.00' })
    await call('list_products')
    await call('get_product', { productId })
    await call('list_customers')
    await call('list_suppliers')
    await call('get_stock_position')
    await call('list_products_below_minimum')
    await call('list_stock_movements')

    // Sales, through to an invoice
    const order = await call('create_sales_order', {
      customerId,
      instalments: 2,
      items: [{ productId, quantity: '10' }],
    })
    const orderId = at(order, 'id')
    await call('update_sales_order_items', { orderId, items: [{ productId, quantity: '8' }] })
    await call('confirm_sales_order', { orderId })
    await call('open_cash_session', { openingBalance: '0.00' })
    await call('invoice_sales_order', { orderId })
    await call('list_sales_orders')
    await call('get_sales_order', { orderId })
    await call('get_fiscal_document', { orderId })

    // Finance: settle one instalment, then back it out again
    const receivables = await call('list_receivables')
    const receivableId = at(receivables, 'rows.0.id')
    const settled = await call('settle_receivable', { receivableId, amount: '10.00' })
    await call('reverse_settlement', {
      settlementId: at(settled, 'settlement.id'),
      reason: 'Posted twice by mistake',
    })

    // Purchasing, through to a payable
    const purchase = await call('create_purchase_order', {
      supplierId,
      items: [{ productId, quantity: '20', unitCost: '19.00' }],
    })
    const purchaseId = at(purchase, 'id')
    await call('place_purchase_order', { orderId: purchaseId })
    await call('receive_purchase_order', { orderId: purchaseId })
    await call('list_purchase_orders')
    await call('get_purchase_order', { orderId: purchaseId })

    const payables = await call('list_payables')
    await call('settle_payable', { payableId: at(payables, 'rows.0.id'), amount: '10.00' })

    // The two ways stock moves without a document behind it
    await call('adjust_stock', { productId, delta: '-1', reason: 'Physical count came up short' })
    await call('register_stock_exit', { productId, quantity: '1', reason: 'loss' })

    // Cancellations need their own documents, since the ones above are spent
    const doomedOrder = await call('create_sales_order', {
      customerId,
      items: [{ productId, quantity: '1' }],
    })
    await call('cancel_sales_order', {
      orderId: at(doomedOrder, 'id'),
      reason: 'Customer changed their mind',
    })
    const doomedPurchase = await call('create_purchase_order', {
      supplierId,
      items: [{ productId, quantity: '1', unitCost: '19.00' }],
    })
    await call('cancel_purchase_order', {
      orderId: at(doomedPurchase, 'id'),
      reason: 'Ordered by mistake',
    })
    await call('archive_product', { productId: at(spare, 'id'), reason: 'Discontinued' })

    // Reporting, and finally the close, which freezes the day
    await call('report_sales_by_period')
    await call('report_cash_flow')
    await call('report_stock_position')
    await call('report_overdue_titles')
    await call('get_current_context')
    await call('list_domain_events')
    await call('get_cash_position')
    await call('close_daily_cash', { justification: 'Titles still open at the end of the test' })

    const missing = DESCRIPTORS.map((descriptor) => descriptor.name).filter(
      (name) => !exercised.has(name),
    )
    expect(missing).toEqual([])
  })

  it('presents money as decimal strings and never as cents', async () => {
    const product = await call('create_product', {
      sku: 'WID-01',
      name: 'Widget',
      salePrice: '1234.50',
    })

    expect(at(product, 'salePrice')).toBe('1234.50')
  })
})
