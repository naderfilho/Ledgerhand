import { ZERO_MONEY } from '../kit/index.js'
import { beforeEach, describe, expect, it } from 'vitest'
import { formatMoney } from '../kit/money.js'
import { unwrap } from '../kit/result.js'
import {
  aCustomer,
  anOpenCashSession,
  aProduct,
  aReceivable,
  aSupplier,
  brl,
  cost,
  createTestHarness,
  price,
  qty,
  someDate,
  type TestHarness,
} from '../testing/index.js'
import { USE_CASES } from './registry.js'

let harness: TestHarness

beforeEach(() => {
  harness = createTestHarness()
})

const context = (): TestHarness['context'] => harness.context

const draftOrder = async (customerId: string, quantity = 1) => {
  const product = aProduct(harness, {
    onHand: qty(100),
    averageCost: cost(1),
    salePrice: price(10),
  })
  return unwrap(
    await USE_CASES.create_sales_order.execute(
      {
        customerId,
        instalments: 1,
        items: [{ productId: product.id, quantity: qty(quantity) }],
      },
      context(),
    ),
  )
}

describe('list_sales_orders', () => {
  it('filters by status, which is how the agent finds what is waiting to be invoiced', async () => {
    const customer = aCustomer(harness)
    const first = await draftOrder(customer.id)
    await draftOrder(customer.id)
    unwrap(await USE_CASES.confirm_sales_order.execute({ orderId: first.id }, context()))

    const confirmed = unwrap(
      await USE_CASES.list_sales_orders.execute(
        { status: ['confirmed'], limit: 50, offset: 0 },
        context(),
      ),
    )
    expect(confirmed.rows).toHaveLength(1)
    expect(confirmed.rows[0]?.id).toBe(first.id)

    const drafts = unwrap(
      await USE_CASES.list_sales_orders.execute(
        { status: ['draft'], limit: 50, offset: 0 },
        context(),
      ),
    )
    expect(drafts.rows).toHaveLength(1)
  })

  it('filters by customer and by issue date range', async () => {
    const one = aCustomer(harness, { name: 'One' })
    const two = aCustomer(harness, { name: 'Two' })
    await draftOrder(one.id)
    await draftOrder(two.id)

    const byCustomer = unwrap(
      await USE_CASES.list_sales_orders.execute(
        { customerId: one.id, limit: 50, offset: 0 },
        context(),
      ),
    )
    expect(byCustomer.rows).toHaveLength(1)

    const inRange = unwrap(
      await USE_CASES.list_sales_orders.execute(
        { from: someDate('2026-03-01'), to: someDate('2026-03-31'), limit: 50, offset: 0 },
        context(),
      ),
    )
    expect(inRange.rows).toHaveLength(2)

    const outOfRange = unwrap(
      await USE_CASES.list_sales_orders.execute(
        { from: someDate('2026-04-01'), limit: 50, offset: 0 },
        context(),
      ),
    )
    expect(outOfRange.rows).toHaveLength(0)
  })

  it('paginates and reports the full count', async () => {
    const customer = aCustomer(harness)
    await draftOrder(customer.id)
    await draftOrder(customer.id)
    await draftOrder(customer.id)

    const page = unwrap(
      await USE_CASES.list_sales_orders.execute({ limit: 2, offset: 0 }, context()),
    )
    expect(page.rows).toHaveLength(2)
    expect(page.total).toBe(3)
  })
})

describe('get_sales_order', () => {
  it('finds an order by its human-readable number and includes its relations', async () => {
    const customer = aCustomer(harness, { name: 'Aurora' })
    const order = await draftOrder(customer.id)

    const found = unwrap(
      await USE_CASES.get_sales_order.execute({ number: order.number }, context()),
    )

    expect(found.order.id).toBe(order.id)
    expect(found.customer?.name).toBe('Aurora')
    expect(found.receivables).toHaveLength(0)
    expect(found.fiscalDocument).toBeNull()
  })

  it('reports a number that does not exist', async () => {
    const missing = await USE_CASES.get_sales_order.execute({ number: 'SO-999999' }, context())
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error.code).toBe('NOT_FOUND')
  })

  it('requires one of the two identifiers', async () => {
    expect((await USE_CASES.get_sales_order.descriptor.run({}, context())).ok).toBe(false)
  })
})

describe('update_sales_order_items', () => {
  it('replaces the lines of a draft and recalculates the total', async () => {
    const customer = aCustomer(harness)
    const order = await draftOrder(customer.id, 1)
    const product = aProduct(harness, {
      onHand: qty(50),
      averageCost: cost(1),
      salePrice: price(7),
    })

    const updated = unwrap(
      await USE_CASES.update_sales_order_items.execute(
        { orderId: order.id, items: [{ productId: product.id, quantity: qty(3) }] },
        context(),
      ),
    )

    expect(updated.items).toHaveLength(1)
    expect(formatMoney(updated.total)).toBe('21.00')
  })

  it('refuses to edit an order that is no longer a draft', async () => {
    const customer = aCustomer(harness)
    const order = await draftOrder(customer.id)
    unwrap(await USE_CASES.confirm_sales_order.execute({ orderId: order.id }, context()))

    const updated = await USE_CASES.update_sales_order_items.execute(
      {
        orderId: order.id,
        items: [{ productId: order.items[0]?.productId ?? '', quantity: qty(1) }],
      },
      context(),
    )

    expect(updated.ok).toBe(false)
    if (!updated.ok) expect(updated.error.code).toBe('INVALID_STATE_TRANSITION')
  })

  it('applies a line discount and refuses one larger than the line', async () => {
    const customer = aCustomer(harness)
    const product = aProduct(harness, {
      onHand: qty(50),
      averageCost: cost(1),
      salePrice: price(10),
    })

    const discounted = unwrap(
      await USE_CASES.create_sales_order.execute(
        {
          customerId: customer.id,
          instalments: 1,
          items: [{ productId: product.id, quantity: qty(2), discount: brl('5.00') }],
        },
        context(),
      ),
    )
    expect(formatMoney(discounted.total)).toBe('15.00')

    const excessive = await USE_CASES.create_sales_order.execute(
      {
        customerId: customer.id,
        instalments: 1,
        items: [{ productId: product.id, quantity: qty(1), discount: brl('50.00') }],
      },
      context(),
    )
    expect(excessive.ok).toBe(false)
    if (!excessive.ok) expect(excessive.error.message).toContain('discount')
  })

  it('reports an unknown customer and an unknown product', async () => {
    const unknownCustomer = await USE_CASES.create_sales_order.execute(
      {
        customerId: '00000000-0000-4000-8000-999999999999',
        instalments: 1,
        items: [{ productId: '00000000-0000-4000-8000-999999999998', quantity: qty(1) }],
      },
      context(),
    )
    expect(unknownCustomer.ok).toBe(false)
    if (!unknownCustomer.ok)
      expect(unknownCustomer.error.details).toMatchObject({ entity: 'Customer' })

    const customer = aCustomer(harness)
    const unknownProduct = await USE_CASES.create_sales_order.execute(
      {
        customerId: customer.id,
        instalments: 1,
        items: [{ productId: '00000000-0000-4000-8000-999999999998', quantity: qty(1) }],
      },
      context(),
    )
    expect(unknownProduct.ok).toBe(false)
    if (!unknownProduct.ok)
      expect(unknownProduct.error.details).toMatchObject({ entity: 'Product' })
  })

  it('refuses to sell an archived product', async () => {
    const customer = aCustomer(harness)
    const product = aProduct(harness, { active: false })
    const result = await USE_CASES.create_sales_order.execute(
      {
        customerId: customer.id,
        instalments: 1,
        items: [{ productId: product.id, quantity: qty(1) }],
      },
      context(),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('PRODUCT_ARCHIVED')
  })
})

describe('purchase order queries', () => {
  it('filters by status and supplier, and finds one by number', async () => {
    const supplier = aSupplier(harness)
    const product = aProduct(harness)
    const order = unwrap(
      await USE_CASES.create_purchase_order.execute(
        {
          supplierId: supplier.id,
          items: [{ productId: product.id, quantity: qty(5), unitCost: cost(2) }],
        },
        context(),
      ),
    )

    const drafts = unwrap(
      await USE_CASES.list_purchase_orders.execute(
        { status: ['draft'], supplierId: supplier.id, limit: 50, offset: 0 },
        context(),
      ),
    )
    expect(drafts.rows).toHaveLength(1)

    const found = unwrap(
      await USE_CASES.get_purchase_order.execute({ number: order.number }, context()),
    )
    expect(found.supplier?.id).toBe(supplier.id)

    const missing = await USE_CASES.get_purchase_order.execute({ number: 'PO-999999' }, context())
    expect(missing.ok).toBe(false)
  })

  it('reports an unknown supplier when creating an order', async () => {
    const product = aProduct(harness)
    const result = await USE_CASES.create_purchase_order.execute(
      {
        supplierId: '00000000-0000-4000-8000-999999999999',
        items: [{ productId: product.id, quantity: qty(1), unitCost: cost(1) }],
      },
      context(),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.details).toMatchObject({ entity: 'Supplier' })
  })
})

describe('title queries', () => {
  it('filters receivables by status, due date and overdue flag', async () => {
    const customer = aCustomer(harness)
    aReceivable(harness, {
      customerId: customer.id,
      amount: brl('100.00'),
      dueDate: someDate('2026-03-01'),
    })
    aReceivable(harness, {
      customerId: customer.id,
      amount: brl('200.00'),
      dueDate: someDate('2026-03-16'),
    })

    const overdue = unwrap(
      await USE_CASES.list_receivables.execute(
        { overdueOnly: true, limit: 50, offset: 0 },
        context(),
      ),
    )
    expect(overdue.rows).toHaveLength(1)

    const dueToday = unwrap(
      await USE_CASES.list_receivables.execute(
        { dueOn: someDate('2026-03-16'), overdueOnly: false, limit: 50, offset: 0 },
        context(),
      ),
    )
    expect(dueToday.rows).toHaveLength(1)

    const beforeMid = unwrap(
      await USE_CASES.list_receivables.execute(
        { dueBefore: someDate('2026-03-10'), overdueOnly: false, limit: 50, offset: 0 },
        context(),
      ),
    )
    expect(beforeMid.rows).toHaveLength(1)

    const open = unwrap(
      await USE_CASES.list_receivables.execute(
        { status: ['open'], overdueOnly: false, limit: 50, offset: 0 },
        context(),
      ),
    )
    expect(open.rows).toHaveLength(2)
  })

  it('lists payables with the same filters', async () => {
    const supplier = aSupplier(harness, { paymentTermDays: 0 })
    const product = aProduct(harness)
    const created = unwrap(
      await USE_CASES.create_purchase_order.execute(
        {
          supplierId: supplier.id,
          items: [{ productId: product.id, quantity: qty(2), unitCost: cost(50) }],
        },
        context(),
      ),
    )
    unwrap(await USE_CASES.place_purchase_order.execute({ orderId: created.id }, context()))
    unwrap(await USE_CASES.receive_purchase_order.execute({ orderId: created.id }, context()))

    const dueToday = unwrap(
      await USE_CASES.list_payables.execute(
        { dueOn: harness.today, overdueOnly: false, limit: 50, offset: 0 },
        context(),
      ),
    )
    expect(dueToday.rows).toHaveLength(1)
    expect(formatMoney(dueToday.rows[0]?.amount ?? ZERO_MONEY)).toBe('100.00')
  })

  it('reports a title that does not exist', async () => {
    anOpenCashSession(harness)
    const missing = await USE_CASES.settle_receivable.execute(
      { receivableId: '00000000-0000-4000-8000-999999999999', method: 'cash' },
      context(),
    )
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error.code).toBe('NOT_FOUND')

    const missingPayable = await USE_CASES.settle_payable.execute(
      { payableId: '00000000-0000-4000-8000-999999999999', method: 'cash' },
      context(),
    )
    expect(missingPayable.ok).toBe(false)

    const missingSettlement = await USE_CASES.reverse_settlement.execute(
      { settlementId: '00000000-0000-4000-8000-999999999999', reason: 'wrong' },
      context(),
    )
    expect(missingSettlement.ok).toBe(false)
  })
})

describe('get_cash_position', () => {
  it('reports a day that was never opened', async () => {
    const position = unwrap(await USE_CASES.get_cash_position.execute({}, context()))
    expect(position.session).toBeNull()
    expect(position.expectedClosing).toBeNull()
    expect(position.unsettledTitles).toBe(0)
  })

  it('reports the running figures of an open day', async () => {
    anOpenCashSession(harness, { openingBalance: brl('100.00') })
    const customer = aCustomer(harness)
    const receivable = aReceivable(harness, {
      customerId: customer.id,
      amount: brl('50.00'),
      dueDate: harness.today,
    })
    unwrap(
      await USE_CASES.settle_receivable.execute(
        { receivableId: receivable.id, amount: brl('20.00'), method: 'cash' },
        context(),
      ),
    )

    const position = unwrap(await USE_CASES.get_cash_position.execute({}, context()))
    expect(formatMoney(position.expectedClosing ?? ZERO_MONEY)).toBe('120.00')
    expect(position.unsettledTitles).toBe(1)
  })
})

describe('settle_payable', () => {
  it('books an outflow and previews it as money leaving', async () => {
    anOpenCashSession(harness, { openingBalance: brl('500.00') })
    const supplier = aSupplier(harness, { name: 'Northwind Supplies', paymentTermDays: 0 })
    const product = aProduct(harness)
    const created = unwrap(
      await USE_CASES.create_purchase_order.execute(
        {
          supplierId: supplier.id,
          items: [{ productId: product.id, quantity: qty(1), unitCost: cost(80) }],
        },
        context(),
      ),
    )
    unwrap(await USE_CASES.place_purchase_order.execute({ orderId: created.id }, context()))
    const received = unwrap(
      await USE_CASES.receive_purchase_order.execute({ orderId: created.id }, context()),
    )
    const payableId = received.payable?.id
    expect(payableId).toBeDefined()
    if (payableId === undefined) return

    const preview = await USE_CASES.settle_payable.descriptor.preview?.({ payableId }, context())
    expect(preview?.ok).toBe(true)
    if (preview?.ok === true) {
      expect(preview.value).toContain('Northwind Supplies')
      expect(preview.value).toContain('80.00')
    }

    const settled = unwrap(
      await USE_CASES.settle_payable.execute({ payableId, method: 'bank_transfer' }, context()),
    )
    expect(formatMoney(settled.session.outflow)).toBe('80.00')
    expect(harness.events.typesRecorded()).toContain('payable.settled')
  })

  it('restores the outflow when the settlement is reversed', async () => {
    anOpenCashSession(harness, { openingBalance: brl('500.00') })
    const supplier = aSupplier(harness, { paymentTermDays: 0 })
    const product = aProduct(harness)
    const created = unwrap(
      await USE_CASES.create_purchase_order.execute(
        {
          supplierId: supplier.id,
          items: [{ productId: product.id, quantity: qty(1), unitCost: cost(40) }],
        },
        context(),
      ),
    )
    unwrap(await USE_CASES.place_purchase_order.execute({ orderId: created.id }, context()))
    const received = unwrap(
      await USE_CASES.receive_purchase_order.execute({ orderId: created.id }, context()),
    )
    const payableId = received.payable?.id
    if (payableId === undefined) return

    const settled = unwrap(
      await USE_CASES.settle_payable.execute({ payableId, method: 'pix' }, context()),
    )
    unwrap(
      await USE_CASES.reverse_settlement.execute(
        { settlementId: settled.settlement.id, reason: 'Paid the wrong supplier' },
        context(),
      ),
    )

    expect(harness.db.payables.get(payableId)?.status).toBe('open')
    const position = unwrap(await USE_CASES.get_cash_position.execute({}, context()))
    expect(formatMoney(position.expectedClosing ?? ZERO_MONEY)).toBe('500.00')
  })
})
