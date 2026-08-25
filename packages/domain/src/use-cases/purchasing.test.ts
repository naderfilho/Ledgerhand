import { ZERO_QUANTITY, ZERO_MONEY, ZERO_UNIT_COST } from '../kit/index.js'
import { beforeEach, describe, expect, it } from 'vitest'
import { formatMoney } from '../kit/money.js'
import { formatQuantity } from '../kit/quantity.js'
import { formatUnitValue } from '../kit/unit-value.js'
import { unwrap } from '../kit/result.js'
import {
  aProduct,
  aSupplier,
  cost,
  createTestHarness,
  qty,
  type TestHarness,
} from '../testing/index.js'
import { USE_CASES } from './registry.js'

let harness: TestHarness

beforeEach(() => {
  harness = createTestHarness()
})

const context = (): TestHarness['context'] => harness.context

const placeOrder = async (options: { quantity?: number; unitCost?: number } = {}) => {
  const supplier = aSupplier(harness, { paymentTermDays: 15 })
  const product = aProduct(harness, { sku: 'SKU-201', onHand: qty(10), averageCost: cost(10) })
  const order = unwrap(
    await USE_CASES.create_purchase_order.execute(
      {
        supplierId: supplier.id,
        items: [
          {
            productId: product.id,
            quantity: qty(options.quantity ?? 10),
            unitCost: cost(options.unitCost ?? 20),
          },
        ],
      },
      context(),
    ),
  )
  const placed = unwrap(
    await USE_CASES.place_purchase_order.execute({ orderId: order.id }, context()),
  )
  return { supplier, product, order: placed }
}

describe('receive_purchase_order', () => {
  it('brings stock in, moves the average cost and raises the payable', async () => {
    const { order, product, supplier } = await placeOrder({ quantity: 10, unitCost: 20 })

    const received = unwrap(
      await USE_CASES.receive_purchase_order.execute({ orderId: order.id }, context()),
    )

    const balance = harness.db.balances.get(product.id)
    expect(formatQuantity(balance?.onHand ?? ZERO_QUANTITY)).toBe('20')
    // 10 units at 10.00 plus 10 units at 20.00 averages to 15.00.
    expect(formatUnitValue(balance?.averageCost ?? ZERO_UNIT_COST)).toBe('15.00')

    expect(received.payable).not.toBeNull()
    expect(formatMoney(received.payable?.amount ?? ZERO_MONEY)).toBe('200.00')
    expect(received.payable?.dueDate).toBe('2026-03-31')
    expect(received.payable?.supplierId).toBe(supplier.id)
    expect(received.order.status).toBe('received')
  })

  it('refuses to receive more than was ordered, quoting what is outstanding', async () => {
    const { order } = await placeOrder({ quantity: 10 })
    const itemId = order.items[0]?.id
    expect(itemId).toBeDefined()
    if (itemId === undefined) return

    const received = await USE_CASES.receive_purchase_order.execute(
      { orderId: order.id, lines: [{ itemId, quantity: qty(11) }] },
      context(),
    )

    expect(received.ok).toBe(false)
    if (!received.ok) {
      expect(received.error.code).toBe('OVER_RECEIPT')
      expect(received.error.details).toMatchObject({ outstanding: '10' })
    }
  })

  it('accepts a partial delivery and keeps the order open for the rest', async () => {
    const { order } = await placeOrder({ quantity: 10 })
    const itemId = order.items[0]?.id
    if (itemId === undefined) return

    const first = unwrap(
      await USE_CASES.receive_purchase_order.execute(
        { orderId: order.id, lines: [{ itemId, quantity: qty(4) }] },
        context(),
      ),
    )
    expect(first.order.status).toBe('partially_received')
    expect(formatMoney(first.receivedTotal)).toBe('80.00')

    const second = unwrap(
      await USE_CASES.receive_purchase_order.execute({ orderId: order.id }, context()),
    )
    expect(second.order.status).toBe('received')
    expect(formatMoney(second.receivedTotal)).toBe('120.00')
  })

  it('takes the price the supplier actually charged when it differs from the order', async () => {
    const { order, product } = await placeOrder({ quantity: 10, unitCost: 20 })
    const itemId = order.items[0]?.id
    if (itemId === undefined) return

    const received = unwrap(
      await USE_CASES.receive_purchase_order.execute(
        { orderId: order.id, lines: [{ itemId, quantity: qty(10), unitCost: cost(22) }] },
        context(),
      ),
    )

    expect(formatMoney(received.payable?.amount ?? ZERO_MONEY)).toBe('220.00')
    expect(
      formatUnitValue(harness.db.balances.get(product.id)?.averageCost ?? ZERO_UNIT_COST),
    ).toBe('16.00')
  })

  it('refuses to receive an order that was never placed', async () => {
    const supplier = aSupplier(harness)
    const product = aProduct(harness)
    const draft = unwrap(
      await USE_CASES.create_purchase_order.execute(
        {
          supplierId: supplier.id,
          items: [{ productId: product.id, quantity: qty(1), unitCost: cost(1) }],
        },
        context(),
      ),
    )

    const received = await USE_CASES.receive_purchase_order.execute(
      { orderId: draft.id },
      context(),
    )
    expect(received.ok).toBe(false)
    if (!received.ok) expect(received.error.code).toBe('INVALID_STATE_TRANSITION')
  })

  it('reports that there is nothing left to receive instead of doing nothing quietly', async () => {
    const { order } = await placeOrder()
    unwrap(await USE_CASES.receive_purchase_order.execute({ orderId: order.id }, context()))

    const again = await USE_CASES.receive_purchase_order.execute({ orderId: order.id }, context())
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.error.code).toBe('INVALID_STATE_TRANSITION')
  })
})

describe('cancel_purchase_order', () => {
  it('cancels an order nothing has arrived against', async () => {
    const { order } = await placeOrder()
    const cancelled = unwrap(
      await USE_CASES.cancel_purchase_order.execute(
        { orderId: order.id, reason: 'Supplier cannot deliver on time' },
        context(),
      ),
    )
    expect(cancelled.status).toBe('cancelled')
  })

  it('refuses once part of the delivery has physically arrived', async () => {
    const { order } = await placeOrder({ quantity: 10 })
    const itemId = order.items[0]?.id
    if (itemId === undefined) return
    unwrap(
      await USE_CASES.receive_purchase_order.execute(
        { orderId: order.id, lines: [{ itemId, quantity: qty(3) }] },
        context(),
      ),
    )

    const cancelled = await USE_CASES.cancel_purchase_order.execute(
      { orderId: order.id, reason: 'Changed our mind' },
      context(),
    )

    expect(cancelled.ok).toBe(false)
    if (!cancelled.ok) {
      expect(cancelled.error.code).toBe('INVALID_STATE_TRANSITION')
      expect(cancelled.error.message).toContain('Adjust stock instead')
    }
  })
})
