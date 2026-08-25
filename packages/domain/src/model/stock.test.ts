import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { asId, type ProductId } from '../kit/ids.js'
import { formatQuantity, quantityFromThousandths, type Quantity } from '../kit/quantity.js'
import { unitCostFromMillionths, formatUnitValue } from '../kit/unit-value.js'
import {
  applyAdjustment,
  applyEntry,
  applyExit,
  applyReservation,
  availableQuantity,
  emptyBalance,
  releaseReservation,
  type StockBalance,
} from './stock.js'

const PRODUCT = asId<ProductId>('00000000-0000-4000-8000-000000000001')
const AT = new Date('2026-03-16T12:00:00.000Z')
const start = (): StockBalance => emptyBalance(PRODUCT, AT)
const q = (value: number): Quantity => quantityFromThousandths(BigInt(Math.round(value * 1000)))
const c = (value: number) => unitCostFromMillionths(BigInt(Math.round(value * 1_000_000)))

describe('applyEntry', () => {
  it('adds to the balance and moves the weighted average', () => {
    const first = applyEntry(start(), q(10), c(5), AT)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const second = applyEntry(first.value.balance, q(10), c(15), AT)
    expect(second.ok).toBe(true)
    if (!second.ok) return

    expect(formatQuantity(second.value.balance.onHand)).toBe('20')
    expect(formatUnitValue(second.value.balance.averageCost)).toBe('10.00')
  })

  it('refuses a non-positive quantity and a negative cost', () => {
    expect(applyEntry(start(), q(0), c(5), AT).ok).toBe(false)
    expect(applyEntry(start(), q(-1), c(5), AT).ok).toBe(false)
    expect(applyEntry(start(), q(1), c(-1), AT).ok).toBe(false)
  })
})

describe('applyExit', () => {
  it('names the product and the shortfall when stock is short', () => {
    const entry = applyEntry(start(), q(3), c(5), AT)
    expect(entry.ok).toBe(true)
    if (!entry.ok) return

    const exit = applyExit(entry.value.balance, q(5), 'SKU-114', AT)
    expect(exit.ok).toBe(false)
    if (exit.ok) return
    expect(exit.error.code).toBe('INSUFFICIENT_STOCK')
    expect(exit.error.message).toContain('SKU-114')
    expect(exit.error.details).toMatchObject({ requested: '5', available: '3' })
  })

  it('values the exit at the current average cost', () => {
    const entry = applyEntry(start(), q(4), c(12.5), AT)
    expect(entry.ok).toBe(true)
    if (!entry.ok) return
    const exit = applyExit(entry.value.balance, q(2), 'SKU-1', AT)
    expect(exit.ok && exit.value.totalCost).toBe(2500n)
  })

  it('refuses to write off goods that are reserved for a confirmed order', () => {
    const entry = applyEntry(start(), q(5), c(1), AT)
    expect(entry.ok).toBe(true)
    if (!entry.ok) return
    const reserved = applyReservation(entry.value.balance, q(5), 'SKU-1', AT)
    expect(reserved.ok).toBe(true)
    if (!reserved.ok) return

    const exit = applyExit(reserved.value, q(5), 'SKU-1', AT)
    expect(exit.ok).toBe(false)
    if (!exit.ok) {
      expect(exit.error.code).toBe('RESERVATION_EXCEEDS_BALANCE')
      expect(exit.error.message).toContain('reserved for confirmed orders')
    }
  })

  it('ships once the order releases its own reservation, which is what invoicing does', () => {
    const entry = applyEntry(start(), q(5), c(1), AT)
    expect(entry.ok).toBe(true)
    if (!entry.ok) return
    const reserved = applyReservation(entry.value.balance, q(5), 'SKU-1', AT)
    expect(reserved.ok).toBe(true)
    if (!reserved.ok) return
    expect(formatQuantity(availableQuantity(reserved.value))).toBe('0')

    const released = releaseReservation(reserved.value, q(5), AT)
    expect(released.ok).toBe(true)
    if (!released.ok) return
    expect(applyExit(released.value, q(5), 'SKU-1', AT).ok).toBe(true)
  })
})

describe('applyAdjustment', () => {
  it('always requires a reason', () => {
    const adjusted = applyAdjustment(start(), q(1), '   ', AT)
    expect(adjusted.ok).toBe(false)
    if (!adjusted.ok) expect(adjusted.error.code).toBe('ADJUSTMENT_REASON_REQUIRED')
  })

  it('refuses to change nothing', () => {
    expect(applyAdjustment(start(), q(0), 'count', AT).ok).toBe(false)
  })

  it('refuses to push the balance below zero', () => {
    const adjusted = applyAdjustment(start(), q(-1), 'count', AT)
    expect(adjusted.ok).toBe(false)
    if (!adjusted.ok) expect(adjusted.error.code).toBe('NEGATIVE_STOCK')
  })

  it('refuses to strand a reservation, and says which order to cancel first', () => {
    const entry = applyEntry(start(), q(10), c(1), AT)
    expect(entry.ok).toBe(true)
    if (!entry.ok) return
    const reserved = applyReservation(entry.value.balance, q(8), 'SKU-1', AT)
    expect(reserved.ok).toBe(true)
    if (!reserved.ok) return

    const adjusted = applyAdjustment(reserved.value, q(-5), 'breakage', AT)
    expect(adjusted.ok).toBe(false)
    if (!adjusted.ok) {
      expect(adjusted.error.code).toBe('RESERVATION_EXCEEDS_BALANCE')
      expect(adjusted.error.message).toContain('Cancel an order first')
    }
  })
})

describe('reservations', () => {
  it('cannot promise more than is available', () => {
    const entry = applyEntry(start(), q(10), c(1), AT)
    expect(entry.ok).toBe(true)
    if (!entry.ok) return
    const first = applyReservation(entry.value.balance, q(7), 'SKU-1', AT)
    expect(first.ok).toBe(true)
    if (!first.ok) return

    const second = applyReservation(first.value, q(4), 'SKU-1', AT)
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.error.code).toBe('INSUFFICIENT_STOCK')
  })

  it('cannot release more than is reserved', () => {
    const released = releaseReservation(start(), q(1), AT)
    expect(released.ok).toBe(false)
    if (!released.ok) expect(released.error.code).toBe('RESERVATION_EXCEEDS_BALANCE')
  })
})

/**
 * The invariant the whole stock module exists to protect. A random sequence of
 * operations, each individually accepted by the domain, must never produce a
 * negative balance, never leave more reserved than is on hand, and must keep
 * the balance equal to the sum of the movements that were applied.
 */
describe('stock invariants under arbitrary valid operation sequences', () => {
  type Operation =
    | { kind: 'entry'; quantity: Quantity; cost: bigint }
    | { kind: 'exit'; quantity: Quantity }
    | { kind: 'adjust'; delta: Quantity }
    | { kind: 'reserve'; quantity: Quantity }
    | { kind: 'release'; quantity: Quantity }

  const anOperation = fc.oneof(
    fc.record({
      kind: fc.constant('entry' as const),
      quantity: fc.integer({ min: 1, max: 500 }).map((value) => q(value)),
      cost: fc.integer({ min: 0, max: 5000 }).map((value) => c(value)),
    }),
    fc.record({
      kind: fc.constant('exit' as const),
      quantity: fc.integer({ min: 1, max: 500 }).map((value) => q(value)),
    }),
    fc.record({
      kind: fc.constant('adjust' as const),
      delta: fc
        .integer({ min: -200, max: 200 })
        .filter((value) => value !== 0)
        .map((value) => q(value)),
    }),
    fc.record({
      kind: fc.constant('reserve' as const),
      quantity: fc.integer({ min: 1, max: 300 }).map((value) => q(value)),
    }),
    fc.record({
      kind: fc.constant('release' as const),
      quantity: fc.integer({ min: 1, max: 300 }).map((value) => q(value)),
    }),
  ) as fc.Arbitrary<Operation>

  it('never goes negative and never loses track of the balance', () => {
    fc.assert(
      fc.property(fc.array(anOperation, { minLength: 1, maxLength: 60 }), (operations) => {
        let balance = start()
        let applied = 0n

        for (const operation of operations) {
          switch (operation.kind) {
            case 'entry': {
              const result = applyEntry(
                balance,
                operation.quantity,
                unitCostFromMillionths(operation.cost),
                AT,
              )
              if (result.ok) {
                balance = result.value.balance
                applied += operation.quantity
              }
              break
            }
            case 'exit': {
              const result = applyExit(balance, operation.quantity, 'SKU-1', AT)
              if (result.ok) {
                balance = result.value.balance
                applied -= operation.quantity
              }
              break
            }
            case 'adjust': {
              const result = applyAdjustment(balance, operation.delta, 'inventory count', AT)
              if (result.ok) {
                balance = result.value.balance
                applied += operation.delta
              }
              break
            }
            case 'reserve': {
              const result = applyReservation(balance, operation.quantity, 'SKU-1', AT)
              if (result.ok) balance = result.value
              break
            }
            case 'release': {
              const result = releaseReservation(balance, operation.quantity, AT)
              if (result.ok) balance = result.value
              break
            }
          }

          expect(balance.onHand).toBeGreaterThanOrEqual(0n)
          expect(balance.reserved).toBeGreaterThanOrEqual(0n)
          expect(balance.reserved).toBeLessThanOrEqual(balance.onHand)
          expect(availableQuantity(balance)).toBeGreaterThanOrEqual(0n)
        }

        expect(balance.onHand).toBe(applied)
      }),
      { numRuns: 300 },
    )
  })
})
