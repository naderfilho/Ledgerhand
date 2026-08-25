import type { Money, Quantity } from '../kit/index.js'
import { beforeEach, describe, expect, it } from 'vitest'
import { formatMoney } from '../kit/money.js'
import { formatQuantity } from '../kit/quantity.js'
import { unwrap } from '../kit/result.js'
import {
  aCustomer,
  aProduct,
  aSupplier,
  cost,
  createTestHarness,
  price,
  qty,
  someDate,
  type TestHarness,
} from '../testing/index.js'
import { USE_CASES } from './registry.js'

/**
 * A language model composing a tool call omits optional arguments far more
 * often than a form does, and takes the defaults with it. These tests walk the
 * paths where a field is absent -- the ones a UI-driven test suite never
 * reaches, and where a wrong default silently changes a business outcome.
 */

let harness: TestHarness

beforeEach(() => {
  harness = createTestHarness()
})

const context = (): TestHarness['context'] => harness.context

describe('catalogue with everything optional omitted', () => {
  it('creates a product with only the four required fields', async () => {
    const product = unwrap(
      await USE_CASES.create_product.descriptor.run(
        { sku: 'MIN-1', name: 'Minimal', salePrice: '10.00' },
        context(),
      ),
    ) as { unit: string; minimumStock: Quantity; description: string | null }

    expect(product.unit).toBe('unit')
    expect(formatQuantity(product.minimumStock)).toBe('0')
    expect(product.description).toBeNull()
  })

  it('creates a customer with only a name', async () => {
    const customer = unwrap(
      await USE_CASES.create_customer.descriptor.run({ name: 'Bare Minimum Ltda' }, context()),
    ) as { taxId: string | null; email: string | null; phone: string | null; notes: string | null }

    expect(customer.taxId).toBeNull()
    expect(customer.email).toBeNull()
    expect(customer.phone).toBeNull()
    expect(customer.notes).toBeNull()
  })

  it('clears a description when null is sent, and keeps it when the field is absent', async () => {
    const created = unwrap(
      await USE_CASES.create_product.descriptor.run(
        { sku: 'DESC-1', name: 'Described', salePrice: '10.00', description: 'Original text' },
        context(),
      ),
    ) as { id: string }

    const untouched = unwrap(
      await USE_CASES.update_product.execute({ productId: created.id, name: 'Renamed' }, context()),
    )
    expect(untouched.description).toBe('Original text')

    const cleared = unwrap(
      await USE_CASES.update_product.execute(
        { productId: created.id, description: null },
        context(),
      ),
    )
    expect(cleared.description).toBeNull()
  })

  it('lists without a search term and without a page', async () => {
    aProduct(harness, { sku: 'LIST-1' })
    aCustomer(harness, { name: 'Listed customer' })
    aSupplier(harness, { name: 'Listed supplier' })

    expect(unwrap(await USE_CASES.list_products.descriptor.run({}, context()))).toBeDefined()
    expect(unwrap(await USE_CASES.list_customers.descriptor.run({}, context()))).toBeDefined()
    expect(unwrap(await USE_CASES.list_suppliers.descriptor.run({}, context()))).toBeDefined()
  })
})

describe('stock with everything optional omitted', () => {
  it('registers an entry with no note and the default reason', async () => {
    const product = aProduct(harness)
    const result = unwrap(
      await USE_CASES.register_stock_entry.descriptor.run(
        { productId: product.id, quantity: 5, unitCost: '2.00' },
        context(),
      ),
    ) as { movement: { note: string | null; reason: string } }

    expect(result.movement.note).toBeNull()
    expect(result.movement.reason).toBe('manual_entry')
  })

  it('registers an exit with the default reason', async () => {
    const product = aProduct(harness, { onHand: qty(10), averageCost: cost(2) })
    const result = unwrap(
      await USE_CASES.register_stock_exit.descriptor.run(
        { productId: product.id, quantity: 1 },
        context(),
      ),
    ) as { movement: { reason: string } }

    expect(result.movement.reason).toBe('manual_exit')
  })

  it('returns the whole position when no product is named', async () => {
    aProduct(harness, { sku: 'POS-1', onHand: qty(3), averageCost: cost(2) })
    aProduct(harness, { sku: 'POS-2', onHand: qty(4), averageCost: cost(5) })

    const rows = unwrap(
      await USE_CASES.get_stock_position.descriptor.run({}, context()),
    ) as unknown[]
    expect(rows).toHaveLength(2)

    const filtered = unwrap(
      await USE_CASES.get_stock_position.descriptor.run({ search: 'POS-2' }, context()),
    ) as unknown[]
    expect(filtered).toHaveLength(1)
  })

  it('lists movements across every product, with and without a date range', async () => {
    const product = aProduct(harness)
    unwrap(
      await USE_CASES.register_stock_entry.execute(
        { productId: product.id, quantity: qty(2), unitCost: cost(1), reason: 'manual_entry' },
        context(),
      ),
    )

    const all = unwrap(await USE_CASES.list_stock_movements.descriptor.run({}, context())) as {
      total: number
    }
    expect(all.total).toBe(1)

    const ranged = unwrap(
      await USE_CASES.list_stock_movements.descriptor.run(
        { from: '2026-03-01', to: '2026-03-31' },
        context(),
      ),
    ) as { total: number }
    expect(ranged.total).toBe(1)
  })
})

describe('sales and purchasing with everything optional omitted', () => {
  it('dates a sales order today and defaults to a single instalment', async () => {
    const customer = aCustomer(harness)
    const product = aProduct(harness, {
      onHand: qty(10),
      averageCost: cost(1),
      salePrice: price(5),
    })

    const order = unwrap(
      await USE_CASES.create_sales_order.descriptor.run(
        { customerId: customer.id, items: [{ productId: product.id, quantity: 2 }] },
        context(),
      ),
    ) as { issuedOn: string; instalments: number; notes: string | null; total: Money }

    expect(order.issuedOn).toBe('2026-03-16')
    expect(order.instalments).toBe(1)
    expect(order.notes).toBeNull()
    expect(formatMoney(order.total)).toBe('10.00')
  })

  it('honours an explicit issue date and note when given', async () => {
    const customer = aCustomer(harness)
    const product = aProduct(harness, {
      onHand: qty(10),
      averageCost: cost(1),
      salePrice: price(5),
    })

    const order = unwrap(
      await USE_CASES.create_sales_order.execute(
        {
          customerId: customer.id,
          instalments: 3,
          issuedOn: someDate('2026-03-10'),
          notes: 'Deliver before noon',
          items: [{ productId: product.id, quantity: qty(2), description: 'Custom label' }],
        },
        context(),
      ),
    )

    expect(order.issuedOn).toBe('2026-03-10')
    expect(order.notes).toBe('Deliver before noon')
    expect(order.items[0]?.description).toBe('Custom label')
  })

  it('creates a purchase order with and without the optional dates', async () => {
    const supplier = aSupplier(harness)
    const product = aProduct(harness)

    const bare = unwrap(
      await USE_CASES.create_purchase_order.descriptor.run(
        {
          supplierId: supplier.id,
          items: [{ productId: product.id, quantity: 1, unitCost: '3.00' }],
        },
        context(),
      ),
    ) as { expectedOn: string | null; notes: string | null; issuedOn: string }

    expect(bare.expectedOn).toBeNull()
    expect(bare.notes).toBeNull()
    expect(bare.issuedOn).toBe('2026-03-16')

    const detailed = unwrap(
      await USE_CASES.create_purchase_order.execute(
        {
          supplierId: supplier.id,
          issuedOn: someDate('2026-03-12'),
          expectedOn: someDate('2026-03-20'),
          notes: 'Confirm freight cost',
          items: [
            {
              productId: product.id,
              quantity: qty(1),
              unitCost: cost(3),
              description: 'Bulk pack',
            },
          ],
        },
        context(),
      ),
    )

    expect(detailed.expectedOn).toBe('2026-03-20')
    expect(detailed.items[0]?.description).toBe('Bulk pack')
  })

  it('lists purchase orders with no filter at all', async () => {
    const supplier = aSupplier(harness)
    const product = aProduct(harness)
    unwrap(
      await USE_CASES.create_purchase_order.execute(
        {
          supplierId: supplier.id,
          items: [{ productId: product.id, quantity: qty(1), unitCost: cost(1) }],
        },
        context(),
      ),
    )

    const listed = unwrap(await USE_CASES.list_purchase_orders.descriptor.run({}, context())) as {
      total: number
    }
    expect(listed.total).toBe(1)
  })

  it('receives a line at the ordered cost when none is supplied', async () => {
    const supplier = aSupplier(harness)
    const product = aProduct(harness)
    const created = unwrap(
      await USE_CASES.create_purchase_order.execute(
        {
          supplierId: supplier.id,
          items: [{ productId: product.id, quantity: qty(4), unitCost: cost(9) }],
        },
        context(),
      ),
    )
    unwrap(await USE_CASES.place_purchase_order.execute({ orderId: created.id }, context()))

    const itemId = created.items[0]?.id
    if (itemId === undefined) return
    const received = unwrap(
      await USE_CASES.receive_purchase_order.descriptor.run(
        { orderId: created.id, lines: [{ itemId, quantity: 4 }] },
        context(),
      ),
    ) as { receivedTotal: Money }

    expect(formatMoney(received.receivedTotal)).toBe('36.00')
  })

  it('cancels a sales order with no reason when it is only a draft', async () => {
    const customer = aCustomer(harness)
    const product = aProduct(harness, { onHand: qty(10), averageCost: cost(1) })
    const order = unwrap(
      await USE_CASES.create_sales_order.execute(
        {
          customerId: customer.id,
          instalments: 1,
          items: [{ productId: product.id, quantity: qty(1) }],
        },
        context(),
      ),
    )

    const cancelled = unwrap(
      await USE_CASES.cancel_sales_order.descriptor.run({ orderId: order.id }, context()),
    ) as { status: string; cancellationReason: string | null }

    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.cancellationReason).toBeNull()

    const preview = await USE_CASES.cancel_sales_order.descriptor.preview?.(
      { orderId: order.id },
      context(),
    )
    expect(preview?.ok).toBe(true)
    if (preview?.ok === true) expect(preview.value).toContain('No stock or financial impact')
  })

  it('refuses to cancel the same order twice', async () => {
    const customer = aCustomer(harness)
    const product = aProduct(harness, { onHand: qty(10), averageCost: cost(1) })
    const order = unwrap(
      await USE_CASES.create_sales_order.execute(
        {
          customerId: customer.id,
          instalments: 1,
          items: [{ productId: product.id, quantity: qty(1) }],
        },
        context(),
      ),
    )
    unwrap(await USE_CASES.cancel_sales_order.execute({ orderId: order.id, reason: '' }, context()))

    const again = await USE_CASES.cancel_sales_order.execute(
      { orderId: order.id, reason: '' },
      context(),
    )
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.error.code).toBe('INVALID_STATE_TRANSITION')
  })

  it('previews a confirmed cancellation as a release of reserved stock', async () => {
    const customer = aCustomer(harness)
    const product = aProduct(harness, {
      onHand: qty(10),
      averageCost: cost(1),
      salePrice: price(4),
    })
    const order = unwrap(
      await USE_CASES.create_sales_order.execute(
        {
          customerId: customer.id,
          instalments: 1,
          items: [{ productId: product.id, quantity: qty(2) }],
        },
        context(),
      ),
    )
    unwrap(await USE_CASES.confirm_sales_order.execute({ orderId: order.id }, context()))

    const preview = await USE_CASES.cancel_sales_order.descriptor.preview?.(
      { orderId: order.id },
      context(),
    )
    expect(preview?.ok).toBe(true)
    if (preview?.ok === true) expect(preview.value).toContain('release the stock reserved')
  })
})
