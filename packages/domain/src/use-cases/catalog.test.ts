import { beforeEach, describe, expect, it } from 'vitest'
import { formatQuantity } from '../kit/quantity.js'
import { formatUnitValue } from '../kit/unit-value.js'
import { unwrap } from '../kit/result.js'
import { describeCustomer, describeSupplier } from '../model/party.js'
import { describeProduct } from '../model/product.js'
import { aProduct, cost, createTestHarness, qty, type TestHarness } from '../testing/index.js'
import { USE_CASES } from './registry.js'

let harness: TestHarness

beforeEach(() => {
  harness = createTestHarness()
})

const context = (): TestHarness['context'] => harness.context

describe('create_product', () => {
  it('normalises the SKU and starts the product with no stock', async () => {
    const product = unwrap(
      await USE_CASES.create_product.descriptor.run(
        { sku: 'wid-01', name: 'Widget', unit: 'box', salePrice: '49.90', minimumStock: 5 },
        context(),
      ),
    ) as { sku: string; active: boolean; id: string }

    expect(product.sku).toBe('WID-01')
    expect(product.active).toBe(true)
    expect(harness.db.balances.has(product.id as never)).toBe(false)
    expect(harness.events.typesRecorded()).toContain('product.created')
  })

  it('refuses a SKU that is already taken and names the product holding it', async () => {
    aProduct(harness, { sku: 'WID-01', name: 'Existing widget' })

    const duplicate = await USE_CASES.create_product.descriptor.run(
      { sku: 'WID-01', name: 'Another widget', salePrice: '10.00' },
      context(),
    )

    expect(duplicate.ok).toBe(false)
    if (!duplicate.ok) {
      expect(duplicate.error.code).toBe('DUPLICATE_KEY')
      expect(duplicate.error.message).toContain('Existing widget')
    }
  })

  it('rejects a SKU with characters that would break a document', async () => {
    const bad = await USE_CASES.create_product.descriptor.run(
      { sku: 'wid 01/2', name: 'Widget', salePrice: '10.00' },
      context(),
    )
    expect(bad.ok).toBe(false)
  })

  it('rejects a zero or negative price', async () => {
    for (const salePrice of ['0', '-1.00']) {
      const bad = await USE_CASES.create_product.descriptor.run(
        { sku: 'WID-99', name: 'Widget', salePrice },
        context(),
      )
      expect(bad.ok).toBe(false)
    }
  })
})

describe('update_product', () => {
  it('records exactly which fields changed', async () => {
    const product = aProduct(harness, { sku: 'WID-02' })

    unwrap(
      await USE_CASES.update_product.execute(
        { productId: product.id, salePrice: undefined, name: 'Renamed widget' },
        context(),
      ),
    )

    const event = harness.events.recorded.find((entry) => entry.type === 'product.updated')
    expect(event?.payload).toMatchObject({ changes: ['name'] })
  })

  it('does nothing, and says nothing, when the values are unchanged', async () => {
    const product = aProduct(harness, { name: 'Same name' })
    unwrap(
      await USE_CASES.update_product.execute(
        { productId: product.id, name: 'Same name' },
        context(),
      ),
    )
    expect(harness.events.typesRecorded()).not.toContain('product.updated')
  })

  it('refuses to edit an archived product', async () => {
    const product = aProduct(harness, { active: false })
    const updated = await USE_CASES.update_product.execute(
      { productId: product.id, name: 'New name' },
      context(),
    )
    expect(updated.ok).toBe(false)
    if (!updated.ok) expect(updated.error.code).toBe('PRODUCT_ARCHIVED')
  })

  it('reports a product that does not exist', async () => {
    const missing = await USE_CASES.update_product.execute(
      { productId: '00000000-0000-4000-8000-999999999999', name: 'X' },
      context(),
    )
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error.code).toBe('NOT_FOUND')
  })
})

describe('archive_product', () => {
  it('refuses while the warehouse still holds the goods', async () => {
    const product = aProduct(harness, { sku: 'WID-03', onHand: qty(4), averageCost: cost(3) })

    const archived = await USE_CASES.archive_product.execute({ productId: product.id }, context())

    expect(archived.ok).toBe(false)
    if (!archived.ok) {
      expect(archived.error.code).toBe('PRODUCT_IN_USE')
      expect(archived.error.message).toContain('adjust_stock')
    }
  })

  it('archives an empty product and is idempotent afterwards', async () => {
    const product = aProduct(harness, { sku: 'WID-04' })

    const archived = unwrap(
      await USE_CASES.archive_product.execute({ productId: product.id }, context()),
    )
    expect(archived.active).toBe(false)

    const again = unwrap(
      await USE_CASES.archive_product.execute({ productId: product.id }, context()),
    )
    expect(again.active).toBe(false)
    expect(
      harness.events.typesRecorded().filter((type) => type === 'product.archived'),
    ).toHaveLength(1)
  })

  it('previews the consequence in plain language', async () => {
    const product = aProduct(harness, { sku: 'WID-05', name: 'Retired widget' })
    const preview = await USE_CASES.archive_product.descriptor.preview?.(
      { productId: product.id },
      context(),
    )
    expect(preview?.ok).toBe(true)
    if (preview?.ok !== true) return
    expect(preview.value).toContain('WID-05')
    expect(preview.value).toContain('Retired widget')
  })
})

describe('parties', () => {
  it('creates a customer with a payment term that drives due dates', async () => {
    const customer = unwrap(
      await USE_CASES.create_customer.descriptor.run(
        { name: 'Aurora Trading Co.', taxId: '12.345.678/0001-90', paymentTermDays: 45 },
        context(),
      ),
    ) as { name: string; paymentTermDays: number; taxId: string }

    expect(customer.paymentTermDays).toBe(45)
    expect(describeCustomer(customer as never)).toBe('Aurora Trading Co. (12.345.678/0001-90)')
    expect(harness.events.typesRecorded()).toContain('customer.created')
  })

  it('creates a supplier and defaults the payment term to 30 days', async () => {
    const supplier = unwrap(
      await USE_CASES.create_supplier.descriptor.run({ name: 'Northwind Supplies' }, context()),
    ) as { name: string; paymentTermDays: number }

    expect(supplier.paymentTermDays).toBe(30)
    expect(describeSupplier(supplier as never)).toBe('Northwind Supplies')
  })

  it('rejects an e-mail that is not one', async () => {
    const bad = await USE_CASES.create_customer.descriptor.run(
      { name: 'Broken', email: 'not-an-email' },
      context(),
    )
    expect(bad.ok).toBe(false)
  })
})

describe('catalogue queries', () => {
  it('searches by SKU and by name, and hides archived products by default', async () => {
    aProduct(harness, { sku: 'ALPHA-1', name: 'Copper wire' })
    aProduct(harness, { sku: 'BETA-1', name: 'Copper pipe' })
    aProduct(harness, { sku: 'GAMMA-1', name: 'Steel beam', active: false })

    const copper = unwrap(
      await USE_CASES.list_products.execute({ search: 'copper', activeOnly: true }, context()),
    )
    expect(copper.rows).toHaveLength(2)

    const all = unwrap(await USE_CASES.list_products.execute({ activeOnly: false }, context()))
    expect(all.rows).toHaveLength(3)
  })

  it('returns a product with its stock balance, by id or by SKU', async () => {
    const product = aProduct(harness, { sku: 'FIND-1', onHand: qty(12), averageCost: cost(7) })

    const byId = unwrap(await USE_CASES.get_product.execute({ productId: product.id }, context()))
    const bySku = unwrap(await USE_CASES.get_product.execute({ sku: product.sku }, context()))

    expect(formatQuantity(byId.balance.onHand)).toBe('12')
    expect(formatUnitValue(bySku.balance.averageCost)).toBe('7.00')
    expect(describeProduct(byId.product)).toBe(
      'FIND-1 (Product 1)'.replace('Product 1', byId.product.name),
    )
  })

  it('requires at least one way to identify the product', async () => {
    const nothing = await USE_CASES.get_product.descriptor.run({}, context())
    expect(nothing.ok).toBe(false)
  })

  it('lists customers and suppliers', async () => {
    unwrap(await USE_CASES.create_customer.descriptor.run({ name: 'Zeta Ltda' }, context()))
    unwrap(await USE_CASES.create_supplier.descriptor.run({ name: 'Omega SA' }, context()))

    const customers = unwrap(
      await USE_CASES.list_customers.execute({ activeOnly: true }, context()),
    )
    const suppliers = unwrap(
      await USE_CASES.list_suppliers.execute({ activeOnly: true }, context()),
    )

    expect(customers.rows).toHaveLength(1)
    expect(suppliers.rows).toHaveLength(1)
  })
})
