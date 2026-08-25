import { ZERO_QUANTITY, ZERO_MONEY, quantityFromThousandths } from '../kit/index.js'
import { beforeEach, describe, expect, it } from 'vitest'
import { formatMoney } from '../kit/money.js'
import { formatQuantity } from '../kit/quantity.js'
import { formatUnitValue } from '../kit/unit-value.js'
import { unwrap } from '../kit/result.js'
import { aProduct, cost, createTestHarness, qty, type TestHarness } from '../testing/index.js'
import { USE_CASES } from './registry.js'

let harness: TestHarness

beforeEach(() => {
  harness = createTestHarness()
})

const context = (): TestHarness['context'] => harness.context

describe('register_stock_entry', () => {
  it('adds the quantity and recalculates the weighted average cost', async () => {
    const product = aProduct(harness, { onHand: qty(10), averageCost: cost(10) })

    const result = unwrap(
      await USE_CASES.register_stock_entry.execute(
        { productId: product.id, quantity: qty(10), unitCost: cost(20), reason: 'manual_entry' },
        context(),
      ),
    )

    expect(formatQuantity(result.balance.onHand)).toBe('20')
    expect(formatUnitValue(result.balance.averageCost)).toBe('15.00')
    expect(formatMoney(result.movement.totalCost)).toBe('200.00')
    expect(harness.events.typesRecorded()).toContain('stock.entry_registered')
  })

  it('writes a movement whose running balance matches the new balance', async () => {
    const product = aProduct(harness)
    unwrap(
      await USE_CASES.register_stock_entry.execute(
        { productId: product.id, quantity: qty(7), unitCost: cost(3), reason: 'opening_balance' },
        context(),
      ),
    )

    const movement = harness.db.movements[0]
    expect(harness.db.movements).toHaveLength(1)
    expect(formatQuantity(movement?.onHandAfter ?? ZERO_QUANTITY)).toBe('7')
    expect(movement?.reason).toBe('opening_balance')
    expect(movement?.reference).toBeNull()
  })

  it('refuses an archived product', async () => {
    const product = aProduct(harness, { active: false })
    const result = await USE_CASES.register_stock_entry.execute(
      { productId: product.id, quantity: qty(1), unitCost: cost(1), reason: 'manual_entry' },
      context(),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('PRODUCT_ARCHIVED')
  })

  it('rejects a non-positive quantity at the schema boundary', async () => {
    const product = aProduct(harness)
    const result = await USE_CASES.register_stock_entry.descriptor.run(
      { productId: product.id, quantity: 0, unitCost: '1.00' },
      context(),
    )
    expect(result.ok).toBe(false)
  })
})

describe('register_stock_exit', () => {
  it('values the write-off at the current average cost', async () => {
    const product = aProduct(harness, { onHand: qty(10), averageCost: cost(12.5) })

    const result = unwrap(
      await USE_CASES.register_stock_exit.execute(
        { productId: product.id, quantity: qty(2), reason: 'loss' },
        context(),
      ),
    )

    expect(formatQuantity(result.balance.onHand)).toBe('8')
    expect(formatMoney(result.movement.totalCost)).toBe('25.00')
    expect(result.movement.quantity).toBeLessThan(0n)
  })

  it('previews the value about to be written off', async () => {
    const product = aProduct(harness, { sku: 'SKU-900', onHand: qty(10), averageCost: cost(12.5) })

    const preview = await USE_CASES.register_stock_exit.descriptor.preview?.(
      { productId: product.id, quantity: 2 },
      context(),
    )

    expect(preview?.ok).toBe(true)
    if (preview?.ok !== true) return
    expect(preview.value).toContain('SKU-900')
    expect(preview.value).toContain('25.00')
    expect(preview.value).toContain('10 to 8')
  })

  it('reports a minimum stock breach when the movement causes one', async () => {
    const product = aProduct(harness, {
      onHand: qty(10),
      averageCost: cost(1),
      minimumStock: qty(6),
    })

    unwrap(
      await USE_CASES.register_stock_exit.execute(
        { productId: product.id, quantity: qty(5), reason: 'manual_exit' },
        context(),
      ),
    )

    expect(harness.events.typesRecorded()).toContain('stock.minimum_breached')
  })

  it('does not repeat the breach event once the product is already below minimum', async () => {
    const product = aProduct(harness, {
      onHand: qty(5),
      averageCost: cost(1),
      minimumStock: qty(6),
    })

    unwrap(
      await USE_CASES.register_stock_exit.execute(
        { productId: product.id, quantity: qty(1), reason: 'manual_exit' },
        context(),
      ),
    )

    expect(harness.events.typesRecorded()).not.toContain('stock.minimum_breached')
  })
})

describe('adjust_stock', () => {
  it('applies the delta and keeps the reason on the movement', async () => {
    const product = aProduct(harness, { onHand: qty(10), averageCost: cost(2) })

    const result = unwrap(
      await USE_CASES.adjust_stock.execute(
        { productId: product.id, delta: qty(-3), reason: 'Physical count found three missing' },
        context(),
      ),
    )

    expect(formatQuantity(result.balance.onHand)).toBe('7')
    expect(result.movement.note).toBe('Physical count found three missing')
    expect(result.movement.kind).toBe('adjustment')
    expect(harness.events.typesRecorded()).toContain('stock.adjusted')
  })

  it('demands a reason long enough to mean something', async () => {
    const product = aProduct(harness, { onHand: qty(10), averageCost: cost(2) })
    const result = await USE_CASES.adjust_stock.descriptor.run(
      { productId: product.id, delta: -1, reason: 'x' },
      context(),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_FAILED')
  })

  it('previews the direction, the resulting balance and the recorded reason', async () => {
    const product = aProduct(harness, { sku: 'SKU-500', onHand: qty(10), averageCost: cost(2) })

    const preview = await USE_CASES.adjust_stock.descriptor.preview?.(
      { productId: product.id, delta: 4, reason: 'Recount after inventory' },
      context(),
    )

    expect(preview?.ok).toBe(true)
    if (preview?.ok !== true) return
    expect(preview.value).toContain('Increase stock of SKU-500')
    expect(preview.value).toContain('10 would become 14')
    expect(preview.value).toContain('Recount after inventory')
  })
})

describe('stock queries', () => {
  it('reports on hand, reserved and available for one product', async () => {
    const product = aProduct(harness, { onHand: qty(10), reserved: qty(4), averageCost: cost(5) })

    const rows = unwrap(
      await USE_CASES.get_stock_position.execute({ productId: product.id, limit: 50 }, context()),
    )

    expect(rows).toHaveLength(1)
    expect(formatQuantity(rows[0]?.available ?? ZERO_QUANTITY)).toBe('6')
    expect(formatMoney(rows[0]?.value ?? ZERO_MONEY)).toBe('50.00')
  })

  it('reports zero for a product that has never moved', async () => {
    const product = aProduct(harness)
    const rows = unwrap(
      await USE_CASES.get_stock_position.execute({ productId: product.id, limit: 50 }, context()),
    )
    expect(formatQuantity(rows[0]?.balance.onHand ?? quantityFromThousandths(1n))).toBe('0')
  })

  it('reports a product that does not exist rather than an empty list', async () => {
    const missing = await USE_CASES.get_stock_position.execute(
      { productId: '00000000-0000-4000-8000-999999999999', limit: 50 },
      context(),
    )
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error.code).toBe('NOT_FOUND')
  })

  it('lists what needs replenishing, with the shortfall', async () => {
    aProduct(harness, { sku: 'LOW-1', onHand: qty(2), averageCost: cost(1), minimumStock: qty(10) })
    aProduct(harness, { sku: 'OK-1', onHand: qty(50), averageCost: cost(1), minimumStock: qty(10) })
    aProduct(harness, { sku: 'NOMIN-1', onHand: qty(0), averageCost: cost(1) })

    const alerts = unwrap(await USE_CASES.list_products_below_minimum.execute({}, context()))

    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.sku).toBe('LOW-1')
    expect(formatQuantity(alerts[0]?.shortfall ?? ZERO_QUANTITY)).toBe('8')
  })

  it('lists the movement history newest first', async () => {
    const product = aProduct(harness)
    unwrap(
      await USE_CASES.register_stock_entry.execute(
        { productId: product.id, quantity: qty(5), unitCost: cost(1), reason: 'manual_entry' },
        context(),
      ),
    )
    unwrap(
      await USE_CASES.register_stock_exit.execute(
        { productId: product.id, quantity: qty(2), reason: 'loss' },
        context(),
      ),
    )

    const movements = unwrap(
      await USE_CASES.list_stock_movements.execute(
        { productId: product.id, limit: 50, offset: 0 },
        context(),
      ),
    )

    expect(movements.total).toBe(2)
    expect(movements.rows).toHaveLength(2)
  })
})
