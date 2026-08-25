import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  addDays,
  businessDate,
  businessDateIn,
  businessDateSchema,
  compareBusinessDate,
  daysBetween,
  isAfter,
  isBefore,
  maxBusinessDate,
  minBusinessDate,
  unsafeBusinessDate,
} from './business-date.js'

describe('businessDate', () => {
  it('accepts an ISO calendar date', () => {
    const parsed = businessDate('2026-03-16')
    expect(parsed.ok && parsed.value).toBe('2026-03-16')
  })

  it('rejects anything that is not YYYY-MM-DD', () => {
    for (const bad of ['16/03/2026', '2026-3-16', '2026-03-16T00:00:00Z', 'today', '']) {
      expect(businessDate(bad).ok).toBe(false)
    }
  })

  it('rejects dates that do not exist on the calendar', () => {
    expect(businessDate('2026-02-30').ok).toBe(false)
    expect(businessDate('2026-13-01').ok).toBe(false)
    // 2028 is a leap year, 2026 is not.
    expect(businessDate('2026-02-29').ok).toBe(false)
    expect(businessDate('2028-02-29').ok).toBe(true)
  })
})

describe('businessDateIn', () => {
  /**
   * The reason business dates exist at all: a payment taken at 21:00 in Sao
   * Paulo is 00:00 the next day in UTC, and it must still land on the day the
   * cashier was working.
   */
  it('reads the calendar date in the tenant timezone, not in UTC', () => {
    const lateEvening = new Date('2026-03-17T00:30:00.000Z')
    expect(businessDateIn(lateEvening, 'America/Sao_Paulo')).toBe('2026-03-16')
    expect(businessDateIn(lateEvening, 'UTC')).toBe('2026-03-17')
  })

  it('handles the other direction too', () => {
    const earlyMorning = new Date('2026-03-16T02:00:00.000Z')
    expect(businessDateIn(earlyMorning, 'Asia/Tokyo')).toBe('2026-03-16')
    expect(businessDateIn(earlyMorning, 'America/Sao_Paulo')).toBe('2026-03-15')
  })
})

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays(unsafeBusinessDate('2026-03-16'), 30)).toBe('2026-04-15')
    expect(addDays(unsafeBusinessDate('2026-12-31'), 1)).toBe('2027-01-01')
    expect(addDays(unsafeBusinessDate('2026-03-01'), -1)).toBe('2026-02-28')
  })

  it('is exactly reversible, so due dates never drift', () => {
    fc.assert(
      fc.property(fc.integer({ min: -3650, max: 3650 }), (days) => {
        const start = unsafeBusinessDate('2026-06-15')
        expect(addDays(addDays(start, days), -days)).toBe(start)
      }),
    )
  })

  it('agrees with daysBetween', () => {
    fc.assert(
      fc.property(fc.integer({ min: -2000, max: 2000 }), (days) => {
        const start = unsafeBusinessDate('2026-01-01')
        expect(daysBetween(start, addDays(start, days))).toBe(days)
      }),
    )
  })
})

describe('comparison helpers', () => {
  const early = unsafeBusinessDate('2026-01-10')
  const late = unsafeBusinessDate('2026-05-20')

  it('orders dates', () => {
    expect(compareBusinessDate(early, late)).toBe(-1)
    expect(compareBusinessDate(late, early)).toBe(1)
    expect(compareBusinessDate(early, early)).toBe(0)
    expect(isBefore(early, late)).toBe(true)
    expect(isAfter(early, late)).toBe(false)
    expect(minBusinessDate(early, late)).toBe(early)
    expect(maxBusinessDate(early, late)).toBe(late)
    expect(minBusinessDate(late, early)).toBe(early)
    expect(maxBusinessDate(late, early)).toBe(late)
  })
})

describe('businessDateSchema', () => {
  it('parses valid input and reports invalid input as a field error', () => {
    expect(businessDateSchema.safeParse('2026-03-16').success).toBe(true)
    const failed = businessDateSchema.safeParse('not-a-date')
    expect(failed.success).toBe(false)
    if (!failed.success) expect(failed.error.issues[0]?.message).toContain('YYYY-MM-DD')
  })
})
