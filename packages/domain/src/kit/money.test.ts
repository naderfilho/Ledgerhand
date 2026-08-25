import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  addMoney,
  allocateMoney,
  formatMoney,
  money,
  moneyFromCents,
  splitMoney,
  subMoney,
  sumMoney,
  ZERO_MONEY,
} from './money.js'

const anyAmount = fc.bigInt({ min: 0n, max: 10n ** 12n }).map(moneyFromCents)

describe('money', () => {
  it('parses the forms a form field or a tool call actually produces', () => {
    for (const [input, expected] of [
      ['1234.56', 123456n],
      [0.1, 10n],
      ['0', 0n],
    ] as const) {
      const parsed = money(input)
      expect(parsed.ok).toBe(true)
      if (parsed.ok) expect(parsed.value).toBe(expected)
    }
  })

  it('adds and subtracts without leaving the type', () => {
    const a = moneyFromCents(1050n)
    const b = moneyFromCents(999n)
    expect(formatMoney(addMoney(a, b))).toBe('20.49')
    expect(formatMoney(subMoney(a, b))).toBe('0.51')
    expect(formatMoney(sumMoney([a, b, ZERO_MONEY]))).toBe('20.49')
  })
})

describe('allocateMoney', () => {
  it('never loses or invents a cent, whatever the weights', () => {
    fc.assert(
      fc.property(
        anyAmount,
        fc.array(fc.bigInt({ min: 1n, max: 1000n }), { minLength: 1, maxLength: 12 }),
        (total, weights) => {
          const parts = allocateMoney(total, weights)
          expect(parts).toHaveLength(weights.length)
          expect(sumMoney(parts)).toBe(total)
        },
      ),
    )
  })

  it('distributes the remainder to the largest fractional shares first', () => {
    // 10.00 across three equal parts is 3.33 + 3.33 + 3.34, not 3.33 x 3.
    const parts = allocateMoney(moneyFromCents(1000n), [1n, 1n, 1n]).map(formatMoney)
    expect(parts).toEqual(['3.34', '3.33', '3.33'])
  })

  it('refuses weights that sum to zero rather than dividing by zero', () => {
    expect(() => allocateMoney(moneyFromCents(100n), [0n, 0n])).toThrow(RangeError)
  })
})

describe('splitMoney', () => {
  it('keeps the invariant the receivables depend on: the parts rebuild the whole', () => {
    fc.assert(
      fc.property(anyAmount, fc.integer({ min: 1, max: 12 }), (total, count) => {
        const instalments = splitMoney(total, count)
        expect(instalments).toHaveLength(count)
        expect(sumMoney(instalments)).toBe(total)
      }),
    )
  })

  it('keeps every instalment within one cent of every other', () => {
    fc.assert(
      fc.property(anyAmount, fc.integer({ min: 1, max: 12 }), (total, count) => {
        const instalments = splitMoney(total, count)
        const min = instalments.reduce((a, b) => (a < b ? a : b))
        const max = instalments.reduce((a, b) => (a > b ? a : b))
        expect(max - min).toBeLessThanOrEqual(1n)
      }),
    )
  })

  it('rejects a non-positive instalment count', () => {
    expect(() => splitMoney(moneyFromCents(100n), 0)).toThrow(RangeError)
    expect(() => splitMoney(moneyFromCents(100n), 1.5)).toThrow(RangeError)
  })
})
