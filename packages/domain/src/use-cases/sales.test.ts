import { ZERO_QUANTITY, ZERO_UNIT_COST } from '../kit/index.js'
import fc from 'fast-check'
import { beforeEach, describe, expect, it } from 'vitest'
import { formatMoney, sumMoney, type Money } from '../kit/money.js'
import { formatQuantity } from '../kit/quantity.js'
import { formatUnitValue } from '../kit/unit-value.js'
import { unwrap } from '../kit/result.js'
import {
  aCustomer,
  aProduct,
  cost,
  createTestHarness,
  price,
  qty,
  type TestHarness,
} from '../testing/index.js'
import { USE_CASES } from './registry.js'

let harness: TestHarness

beforeEach(() => {
  harness = createTestHarness()
})

const context = (): TestHarness['context'] => harness.context

describe('confirm_sales_order', () => {
  it('refuses to confirm what the warehouse cannot cover, and says by how much', () => {
    return (async () => {
      const customer = aCustomer(harness)
      const product = aProduct(harness, { sku: 'SKU-114', onHand: qty(2), averageCost: cost(10) })

      const order = unwrap(
        await USE_CASES.create_sales_order.execute(
          {
            customerId: customer.id,
            instalments: 1,
            items: [{ productId: product.id, quantity: qty(5) }],
          },
          context(),
        ),
      )

      const confirmed = await USE_CASES.confirm_sales_order.execute(
        { orderId: order.id },
        context(),
      )

      expect(confirmed.ok).toBe(false)
      if (confirmed.ok) return
      expect(confirmed.error.code).toBe('INSUFFICIENT_STOCK')
      expect(confirmed.error.message).toContain('SKU-114')

      // The order stays a draft and nothing was reserved: a half-reserved
      // order is worse than a rejected one.
      expect(harness.db.salesOrders.get(order.id)?.status).toBe('draft')
      expect(formatQuantity(harness.db.balances.get(product.id)?.reserved ?? ZERO_QUANTITY)).toBe(
        '0',
      )
    })()
  })

  it('reserves every line when it succeeds', async () => {
    const customer = aCustomer(harness)
    const first = aProduct(harness, { onHand: qty(10), averageCost: cost(4) })
    const second = aProduct(harness, { onHand: qty(10), averageCost: cost(6) })

    const order = unwrap(
      await USE_CASES.create_sales_order.execute(
        {
          customerId: customer.id,
          instalments: 1,
          items: [
            { productId: first.id, quantity: qty(3) },
            { productId: second.id, quantity: qty(7) },
          ],
        },
        context(),
      ),
    )

    unwrap(await USE_CASES.confirm_sales_order.execute({ orderId: order.id }, context()))

    expect(formatQuantity(harness.db.balances.get(first.id)?.reserved ?? ZERO_QUANTITY)).toBe('3')
    expect(formatQuantity(harness.db.balances.get(second.id)?.reserved ?? ZERO_QUANTITY)).toBe('7')
    expect(harness.events.typesRecorded()).toContain('sales_order.confirmed')
  })

  it('reserves nothing when a later line fails', async () => {
    const customer = aCustomer(harness)
    const plenty = aProduct(harness, { onHand: qty(50), averageCost: cost(4) })
    const scarce = aProduct(harness, { sku: 'SKU-SHORT', onHand: qty(1), averageCost: cost(6) })

    const order = unwrap(
      await USE_CASES.create_sales_order.execute(
        {
          customerId: customer.id,
          instalments: 1,
          items: [
            { productId: plenty.id, quantity: qty(5) },
            { productId: scarce.id, quantity: qty(9) },
          ],
        },
        context(),
      ),
    )

    const confirmed = await USE_CASES.confirm_sales_order.execute({ orderId: order.id }, context())
    expect(confirmed.ok).toBe(false)
    expect(formatQuantity(harness.db.balances.get(plenty.id)?.reserved ?? ZERO_QUANTITY)).toBe('0')
  })
})

describe('invoice_sales_order', () => {
  const setupConfirmedOrder = async (
    options: { instalments?: number; onHand?: number; quantity?: number } = {},
  ) => {
    const customer = aCustomer(harness, { paymentTermDays: 30 })
    const product = aProduct(harness, {
      onHand: qty(options.onHand ?? 20),
      averageCost: cost(30),
      salePrice: price(100),
    })
    const order = unwrap(
      await USE_CASES.create_sales_order.execute(
        {
          customerId: customer.id,
          instalments: options.instalments ?? 1,
          items: [{ productId: product.id, quantity: qty(options.quantity ?? 5) }],
        },
        context(),
      ),
    )
    unwrap(await USE_CASES.confirm_sales_order.execute({ orderId: order.id }, context()))
    return { customer, product, order }
  }

  it('refuses to invoice an order that was never confirmed', async () => {
    const customer = aCustomer(harness)
    const product = aProduct(harness, { onHand: qty(10), averageCost: cost(5) })
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

    const invoiced = await USE_CASES.invoice_sales_order.execute(
      { orderId: order.id, series: 'A' },
      context(),
    )
    expect(invoiced.ok).toBe(false)
    if (!invoiced.ok) {
      expect(invoiced.error.code).toBe('INVALID_STATE_TRANSITION')
      expect(invoiced.error.message).toContain('draft')
    }
  })

  it('ships the stock, issues a sequential document and generates the receivables', async () => {
    const { order, product } = await setupConfirmedOrder({ quantity: 5, onHand: 20 })

    const result = unwrap(
      await USE_CASES.invoice_sales_order.execute({ orderId: order.id, series: 'A' }, context()),
    )

    expect(result.order.status).toBe('invoiced')
    expect(result.document.number).toBe('000001')
    expect(formatMoney(result.document.total)).toBe('500.00')

    const balance = harness.db.balances.get(product.id)
    expect(formatQuantity(balance?.onHand ?? ZERO_QUANTITY)).toBe('15')
    expect(formatQuantity(balance?.reserved ?? ZERO_QUANTITY)).toBe('0')

    expect(result.receivables).toHaveLength(1)
    expect(result.receivables[0]?.dueDate).toBe('2026-04-15')
    expect(harness.events.typesRecorded()).toContain('fiscal_document.issued')
  })

  it('records the cost the goods left with, so a reversal can put it back', async () => {
    const { order, product } = await setupConfirmedOrder({ quantity: 5, onHand: 20 })
    unwrap(
      await USE_CASES.invoice_sales_order.execute({ orderId: order.id, series: 'A' }, context()),
    )

    const stored = harness.db.salesOrders.get(order.id)
    expect(formatUnitValue(stored?.items[0]?.unitCostAtInvoice ?? ZERO_UNIT_COST)).toBe('30.00')
    expect(product.id).toBe(stored?.items[0]?.productId)
  })

  it('never issues the same fiscal number twice', async () => {
    const first = await setupConfirmedOrder()
    const second = await setupConfirmedOrder()

    const one = unwrap(
      await USE_CASES.invoice_sales_order.execute(
        { orderId: first.order.id, series: 'A' },
        context(),
      ),
    )
    const two = unwrap(
      await USE_CASES.invoice_sales_order.execute(
        { orderId: second.order.id, series: 'A' },
        context(),
      ),
    )

    expect(one.document.number).toBe('000001')
    expect(two.document.number).toBe('000002')
  })

  /**
   * The invariant the brief calls out: the titles a sale generates must add up
   * to exactly what was sold, whatever the instalment count does to the cents.
   */
  it('always generates receivables that sum to the order total', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 97 }),
        fc.integer({ min: 1, max: 40 }),
        async (instalments, priceCents, quantity) => {
          harness = createTestHarness()
          const customer = aCustomer(harness)
          const product = aProduct(harness, {
            onHand: qty(quantity + 10),
            averageCost: cost(1),
            salePrice: price(priceCents / 100),
          })

          const order = unwrap(
            await USE_CASES.create_sales_order.execute(
              {
                customerId: customer.id,
                instalments,
                items: [{ productId: product.id, quantity: qty(quantity) }],
              },
              context(),
            ),
          )
          unwrap(await USE_CASES.confirm_sales_order.execute({ orderId: order.id }, context()))
          const result = unwrap(
            await USE_CASES.invoice_sales_order.execute(
              { orderId: order.id, series: 'A' },
              context(),
            ),
          )

          expect(result.receivables).toHaveLength(instalments)
          expect(sumMoney(result.receivables.map((title) => title.amount))).toBe(result.order.total)
        },
      ),
      { numRuns: 60 },
    )
  })
})

describe('cancel_sales_order', () => {
  const invoiceOne = async () => {
    const customer = aCustomer(harness)
    const product = aProduct(harness, {
      onHand: qty(20),
      averageCost: cost(30),
      salePrice: price(100),
    })
    const order = unwrap(
      await USE_CASES.create_sales_order.execute(
        {
          customerId: customer.id,
          instalments: 1,
          items: [{ productId: product.id, quantity: qty(5) }],
        },
        context(),
      ),
    )
    unwrap(await USE_CASES.confirm_sales_order.execute({ orderId: order.id }, context()))
    const invoiced = unwrap(
      await USE_CASES.invoice_sales_order.execute({ orderId: order.id, series: 'A' }, context()),
    )
    return { customer, product, order, invoiced }
  }

  it('releases the reservation when a confirmed order is cancelled', async () => {
    const customer = aCustomer(harness)
    const product = aProduct(harness, { onHand: qty(10), averageCost: cost(5) })
    const order = unwrap(
      await USE_CASES.create_sales_order.execute(
        {
          customerId: customer.id,
          instalments: 1,
          items: [{ productId: product.id, quantity: qty(4) }],
        },
        context(),
      ),
    )
    unwrap(await USE_CASES.confirm_sales_order.execute({ orderId: order.id }, context()))
    unwrap(
      await USE_CASES.cancel_sales_order.execute(
        { orderId: order.id, reason: 'Customer changed their mind' },
        context(),
      ),
    )

    const balance = harness.db.balances.get(product.id)
    expect(formatQuantity(balance?.reserved ?? ZERO_QUANTITY)).toBe('0')
    expect(formatQuantity(balance?.onHand ?? ZERO_QUANTITY)).toBe('10')
  })

  it('refuses to cancel an invoiced order without a reason', async () => {
    const { order } = await invoiceOne()

    const cancelled = await USE_CASES.cancel_sales_order.execute(
      { orderId: order.id, reason: '' },
      context(),
    )
    expect(cancelled.ok).toBe(false)
    if (!cancelled.ok) expect(cancelled.error.code).toBe('REVERSAL_REASON_REQUIRED')
    expect(harness.db.salesOrders.get(order.id)?.status).toBe('invoiced')
  })

  it('reverses stock at the cost it left with, voids the document and cancels the titles', async () => {
    const { order, product, invoiced } = await invoiceOne()

    unwrap(
      await USE_CASES.cancel_sales_order.execute(
        { orderId: order.id, reason: 'Goods returned undamaged' },
        context(),
      ),
    )

    const balance = harness.db.balances.get(product.id)
    expect(formatQuantity(balance?.onHand ?? ZERO_QUANTITY)).toBe('20')
    expect(formatUnitValue(balance?.averageCost ?? ZERO_UNIT_COST)).toBe('30.00')
    expect(harness.db.fiscalDocuments.get(invoiced.document.id)?.status).toBe('cancelled')
    expect(harness.db.receivables.get(invoiced.receivables[0]?.id ?? ('' as never))?.status).toBe(
      'cancelled',
    )
  })

  it('refuses to cancel once a receivable has been paid, and says to reverse it first', async () => {
    const { order, invoiced, customer } = await invoiceOne()
    const receivable = invoiced.receivables[0]
    expect(receivable).toBeDefined()
    if (receivable === undefined) return

    harness.db.receivables.set(receivable.id, {
      ...receivable,
      settledAmount: receivable.amount,
      status: 'settled',
    })

    const cancelled = await USE_CASES.cancel_sales_order.execute(
      { orderId: order.id, reason: 'Customer complaint' },
      context(),
    )

    expect(cancelled.ok).toBe(false)
    if (!cancelled.ok) {
      expect(cancelled.error.code).toBe('INVALID_STATE_TRANSITION')
      expect(cancelled.error.message).toContain('Reverse those settlements first')
    }
    expect(customer.id).toBeDefined()
  })
})

describe('previews shown on the approval card', () => {
  it('describes an invoicing in terms a person can approve or refuse', async () => {
    const customer = aCustomer(harness, { name: 'Aurora Trading Co.' })
    const product = aProduct(harness, {
      sku: 'SKU-777',
      onHand: qty(10),
      averageCost: cost(5),
      salePrice: price(50),
    })
    const order = unwrap(
      await USE_CASES.create_sales_order.execute(
        {
          customerId: customer.id,
          instalments: 2,
          items: [{ productId: product.id, quantity: qty(3) }],
        },
        context(),
      ),
    )
    unwrap(await USE_CASES.confirm_sales_order.execute({ orderId: order.id }, context()))

    const preview = await USE_CASES.invoice_sales_order.descriptor.preview?.(
      { orderId: order.id },
      context(),
    )
    expect(preview?.ok).toBe(true)
    if (preview?.ok !== true) return
    expect(preview.value).toContain('Aurora Trading Co.')
    expect(preview.value).toContain('3 x SKU-777')
    expect(preview.value).toContain('2 receivable(s)')
    expect(preview.value).toContain('150.00')
  })
})

describe('input validation at the descriptor boundary', () => {
  it('rejects a malformed identifier before any repository is touched', async () => {
    const result = await USE_CASES.confirm_sales_order.descriptor.run(
      { orderId: 'not-a-uuid' },
      context(),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_FAILED')
      expect(result.error.message).toContain('orderId')
    }
  })

  it('rejects a quantity with more precision than the unit allows', async () => {
    const customer = aCustomer(harness)
    const product = aProduct(harness)
    const result = await USE_CASES.create_sales_order.descriptor.run(
      {
        customerId: customer.id,
        items: [{ productId: product.id, quantity: '1.00005' }],
      },
      context(),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('decimal places')
  })

  it('applies the catalogue price when the caller omits one', async () => {
    const customer = aCustomer(harness)
    const product = aProduct(harness, { salePrice: price(19.9), onHand: qty(5) })
    const created = await USE_CASES.create_sales_order.descriptor.run(
      {
        customerId: customer.id,
        items: [{ productId: product.id, quantity: 2 }],
      },
      context(),
    )
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const order = created.value as { total: Money }
    expect(formatMoney(order.total)).toBe('39.80')
  })
})
