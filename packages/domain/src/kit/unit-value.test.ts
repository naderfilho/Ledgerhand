import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { formatMoney, moneyFromCents } from './money.js'
import { quantityFromThousandths, type Quantity } from './quantity.js'
import {
  extend,
  formatUnitValue,
  unitCost,
  unitCostFromMillionths,
  unitCostFromTotal,
  unitPrice,
  weightedAverageCost,
  type UnitCost,
} from './unit-value.js'

const aQuantity = fc.bigInt({ min: 1n, max: 10_000_000n }).map(quantityFromThousandths)
const aCost = fc.bigInt({ min: 0n, max: 100_000_000_000n }).map(unitCostFromMillionths)

describe('extend', () => {
  it('turns a per-unit value into money with a single rounding step', () => {
    const three = quantityFromThousandths(3000n)
    const price = unitPrice('19.99')
    expect(price.ok && formatMoney(extend(three, price.value))).toBe('59.97')
  })

  it('rounds half away from zero at the money boundary', () => {
    const one = quantityFromThousandths(1000n)
    const price = unitPrice('0.005')
    expect(price.ok && formatMoney(extend(one, price.value))).toBe('0.01')
  })

  it('handles fractional quantities, which is the whole reason for the 1e3 scale', () => {
    const halfKilo = quantityFromThousandths(500n)
    const price = unitPrice('24.90')
    expect(price.ok && formatMoney(extend(halfKilo, price.value))).toBe('12.45')
  })
})

describe('unitCostFromTotal', () => {
  it('inverts extend for receipts that state a line total', () => {
    // 100.00 spread over 4 units
    const cost = unitCostFromTotal(moneyFromCents(10_000n), quantityFromThousandths(4000n))
    expect(formatUnitValue(cost)).toBe('25.00')
  })

  it('round-trips against extend for representable values', () => {
    const quantity = quantityFromThousandths(2000n)
    const total = moneyFromCents(4_999n)
    expect(formatMoney(extend(quantity, unitCostFromTotal(total, quantity)))).toBe(
      formatMoney(total),
    )
  })

  it('refuses to divide a total by a zero quantity', () => {
    expect(() => unitCostFromTotal(moneyFromCents(100n), quantityFromThousandths(0n))).toThrow(
      RangeError,
    )
  })
})

describe('weightedAverageCost', () => {
  it('averages proportionally to the quantities involved', () => {
    const current = unitCost('10.00')
    const incoming = unitCost('20.00')
    expect(current.ok && incoming.ok).toBe(true)
    if (!current.ok || !incoming.ok) return

    const result = weightedAverageCost(
      quantityFromThousandths(10_000n),
      current.value,
      quantityFromThousandths(10_000n),
      incoming.value,
    )
    expect(formatUnitValue(result)).toBe('15.00')
  })

  it('adopts the incoming cost when there is nothing to average against', () => {
    const incoming = unitCostFromMillionths(7_500_000n)
    const fromEmpty = weightedAverageCost(
      quantityFromThousandths(0n),
      unitCostFromMillionths(0n),
      quantityFromThousandths(1000n),
      incoming,
    )
    expect(fromEmpty).toBe(incoming)
  })

  it('always lands between the two costs it averages', () => {
    fc.assert(
      fc.property(aQuantity, aCost, aQuantity, aCost, (onHand, current, incoming, incomingCost) => {
        const result = weightedAverageCost(onHand, current, incoming, incomingCost)
        const low = current < incomingCost ? current : incomingCost
        const high = current > incomingCost ? current : incomingCost
        expect(result).toBeGreaterThanOrEqual(low)
        expect(result).toBeLessThanOrEqual(high)
      }),
    )
  })

  it('matches an independent exact computation to within one unit of the last digit', () => {
    fc.assert(
      fc.property(aQuantity, aCost, aQuantity, aCost, (onHand, current, incoming, incomingCost) => {
        const result = weightedAverageCost(onHand, current, incoming, incomingCost)
        // Oracle: the same weighted mean, computed at 1e6 times the precision.
        const numerator = (onHand * current + incoming * incomingCost) * 1_000_000n
        const exact = numerator / (onHand + incoming)
        const difference = result * 1_000_000n - exact
        const absolute = difference < 0n ? -difference : difference
        expect(absolute).toBeLessThanOrEqual(1_000_000n)
      }),
    )
  })

  it('does not drift away from the ledger over a long run of receipts', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(aQuantity, aCost), { minLength: 2, maxLength: 40 }),
        (receipts) => {
          let onHand = quantityFromThousandths(0n)
          let average: UnitCost = unitCostFromMillionths(0n)
          let exactValue = 0n // quantity(1e3) * cost(1e6) = 1e9

          for (const [quantity, cost] of receipts) {
            average = weightedAverageCost(onHand, average, quantity, cost)
            onHand = (onHand + quantity) as Quantity
            exactValue += quantity * cost
          }

          const bookValue = onHand * average
          const drift = bookValue - exactValue
          const absoluteDrift = drift < 0n ? -drift : drift
          // One unit of rounding per receipt, scaled by the quantity on hand.
          expect(absoluteDrift).toBeLessThanOrEqual(onHand * BigInt(receipts.length))
        },
      ),
    )
  })
})
