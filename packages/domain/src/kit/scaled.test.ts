import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { formatScaled, mulDiv, parseScaled, rescale, roundDiv } from './scaled.js'

describe('roundDiv', () => {
  it('rounds half away from zero, the way an invoice is expected to', () => {
    expect(roundDiv(5n, 2n)).toBe(3n)
    expect(roundDiv(-5n, 2n)).toBe(-3n)
    expect(roundDiv(4n, 2n)).toBe(2n)
    expect(roundDiv(1n, 3n)).toBe(0n)
    expect(roundDiv(2n, 3n)).toBe(1n)
  })

  it('refuses to divide by zero rather than returning something plausible', () => {
    expect(() => roundDiv(1n, 0n)).toThrow(RangeError)
  })

  it('never lands further than half a unit from the exact quotient', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(10n ** 18n), max: 10n ** 18n }),
        fc.bigInt({ min: 1n, max: 10n ** 9n }),
        (numerator, denominator) => {
          const rounded = roundDiv(numerator, denominator)
          const error = rounded * denominator - numerator
          const absoluteError = error < 0n ? -error : error
          expect(absoluteError * 2n).toBeLessThanOrEqual(denominator)
        },
      ),
    )
  })
})

describe('parseScaled', () => {
  it('accepts plain decimals within the scale', () => {
    const parsed = parseScaled('12.34', 2, 'Amount')
    expect(parsed.ok && parsed.value).toBe(1234n)
  })

  it('pads a shorter fraction to the scale', () => {
    const parsed = parseScaled('12.3', 3, 'Quantity')
    expect(parsed.ok && parsed.value).toBe(12300n)
  })

  it('keeps the sign', () => {
    const parsed = parseScaled('-0.05', 2, 'Amount')
    expect(parsed.ok && parsed.value).toBe(-5n)
  })

  it('rejects excess precision instead of silently rounding it away', () => {
    const parsed = parseScaled('10.005', 2, 'Amount')
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.error.code).toBe('PRECISION_EXCEEDED')
      expect(parsed.error.message).toContain('at most 2 decimal places')
    }
  })

  it('rejects thousands separators, currency symbols and empty input', () => {
    for (const bad of ['1,234.00', 'R$ 10', '', 'ten', '1.2.3']) {
      expect(parseScaled(bad, 2, 'Amount').ok).toBe(false)
    }
  })

  it('rejects scientific notation with an actionable message', () => {
    const parsed = parseScaled(1e21, 2, 'Amount')
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.error.message).toContain('decimal string')
  })

  it('rejects non-finite numbers', () => {
    expect(parseScaled(Number.NaN, 2, 'Amount').ok).toBe(false)
    expect(parseScaled(Number.POSITIVE_INFINITY, 2, 'Amount').ok).toBe(false)
  })
})

describe('formatScaled', () => {
  it('renders the canonical decimal form', () => {
    expect(formatScaled(1234n, 2)).toBe('12.34')
    expect(formatScaled(-5n, 2)).toBe('-0.05')
    expect(formatScaled(0n, 2)).toBe('0.00')
  })

  it('trims trailing zeros down to the requested minimum', () => {
    expect(formatScaled(12300n, 3, { minFractionDigits: 0 })).toBe('12.3')
    expect(formatScaled(12000n, 3, { minFractionDigits: 0 })).toBe('12')
    expect(formatScaled(1000000n, 6, { minFractionDigits: 2 })).toBe('1.00')
  })

  it('round-trips through parseScaled for any value at any scale', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(10n ** 15n), max: 10n ** 15n }),
        fc.constantFrom(2, 3, 6),
        (value, scale) => {
          const text = formatScaled(value, scale)
          const parsed = parseScaled(text, scale, 'Value')
          expect(parsed.ok).toBe(true)
          if (parsed.ok) expect(parsed.value).toBe(value)
        },
      ),
    )
  })
})

describe('rescale', () => {
  it('widens without loss and narrows with rounding', () => {
    expect(rescale(1234n, 2, 6)).toBe(12_340_000n)
    expect(rescale(12_345_678n, 6, 2)).toBe(1235n)
    expect(rescale(42n, 3, 3)).toBe(42n)
  })
})

describe('mulDiv', () => {
  it('multiplies at full width before the single rounding step', () => {
    // Naive stepwise rounding of (7/3)*3 loses a unit; full width does not.
    expect(mulDiv(10n ** 18n + 1n, 3n, 3n)).toBe(10n ** 18n + 1n)
  })
})
