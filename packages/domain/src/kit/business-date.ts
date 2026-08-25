import { z } from 'zod'
import { validationFailed, type DomainError } from './errors.js'
import { err, ok, type Result } from './result.js'
import type { Brand } from './scaled.js'

/**
 * A calendar date in the tenant's own timezone, written as `YYYY-MM-DD`.
 *
 * Cash is closed per business day and titles fall due on a date, not at an
 * instant. Storing those as timestamps is how a payment made at 21:00 in Sao
 * Paulo ends up counted on the following day. Instants stay instants
 * (`occurredAt`); business days stay business days.
 */
export type BusinessDate = Brand<string, 'BusinessDate'>

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MS_PER_DAY = 86_400_000

export function businessDate(value: string): Result<BusinessDate, DomainError> {
  const trimmed = value.trim()
  if (!ISO_DATE_PATTERN.test(trimmed)) {
    return err(validationFailed('Date must be written as YYYY-MM-DD.', { received: value }))
  }
  const [year = '', month = '', day = ''] = trimmed.split('-')
  const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day))
  const roundTrip = new Date(timestamp).toISOString().slice(0, 10)
  if (roundTrip !== trimmed) {
    return err(validationFailed(`${trimmed} is not a real calendar date.`, { received: value }))
  }
  return ok(trimmed as BusinessDate)
}

export function unsafeBusinessDate(value: string): BusinessDate {
  return value as BusinessDate
}

/**
 * Derives the tenant's calendar date from an instant. `en-CA` is used purely
 * because it formats as `YYYY-MM-DD`; no locale semantics are implied.
 */
export function businessDateIn(instant: Date, timeZone: string): BusinessDate {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(instant) as BusinessDate
}

export function addDays(date: BusinessDate, days: number): BusinessDate {
  const [year = '', month = '', day = ''] = date.split('-')
  const shifted = Date.UTC(Number(year), Number(month) - 1, Number(day)) + days * MS_PER_DAY
  return new Date(shifted).toISOString().slice(0, 10) as BusinessDate
}

export function daysBetween(from: BusinessDate, to: BusinessDate): number {
  const parse = (value: BusinessDate): number => {
    const [year = '', month = '', day = ''] = value.split('-')
    return Date.UTC(Number(year), Number(month) - 1, Number(day))
  }
  return Math.round((parse(to) - parse(from)) / MS_PER_DAY)
}

export function compareBusinessDate(a: BusinessDate, b: BusinessDate): -1 | 0 | 1 {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

export function isBefore(a: BusinessDate, b: BusinessDate): boolean {
  return a < b
}

export function isAfter(a: BusinessDate, b: BusinessDate): boolean {
  return a > b
}

export function minBusinessDate(a: BusinessDate, b: BusinessDate): BusinessDate {
  return a <= b ? a : b
}

export function maxBusinessDate(a: BusinessDate, b: BusinessDate): BusinessDate {
  return a >= b ? a : b
}

export const businessDateSchema = z.string().transform((raw, ctx) => {
  const parsed = businessDate(raw)
  if (!parsed.ok) {
    ctx.addIssue({ code: 'custom', message: parsed.error.message })
    return z.NEVER
  }
  return parsed.value
})
