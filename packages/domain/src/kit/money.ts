import { z } from 'zod'
import type { DomainError } from './errors.js'
import { mapOk, type Result } from './result.js'
import { absBigint, formatScaled, parseScaled, sumBigints, type Brand } from './scaled.js'

/** Amounts of money, held as an integer number of cents. */
export type Money = Brand<bigint, 'Money'>

export const MONEY_SCALE = 2
export const ZERO_MONEY = 0n as Money

export function moneyFromCents(cents: bigint): Money {
  return cents as Money
}

export function money(input: string | number): Result<Money, DomainError> {
  return mapOk(parseScaled(input, MONEY_SCALE, 'Amount'), moneyFromCents)
}

export function addMoney(a: Money, b: Money): Money {
  return (a + b) as Money
}

export function subMoney(a: Money, b: Money): Money {
  return (a - b) as Money
}

export function negateMoney(value: Money): Money {
  return subMoney(ZERO_MONEY, value)
}

export function absMoney(value: Money): Money {
  return absBigint(value) as Money
}

export function sumMoney(values: readonly Money[]): Money {
  return sumBigints(values) as Money
}

export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

export function isZeroMoney(value: Money): boolean {
  return value === 0n
}

export function isNegativeMoney(value: Money): boolean {
  return value < 0n
}

export function isPositiveMoney(value: Money): boolean {
  return value > 0n
}

export function minMoney(a: Money, b: Money): Money {
  return a < b ? a : b
}

export function maxMoney(a: Money, b: Money): Money {
  return a > b ? a : b
}

export function formatMoney(value: Money): string {
  return formatScaled(value, MONEY_SCALE)
}

/**
 * Splits an amount across weighted parts so that the parts always add back up
 * to the original -- largest remainder method. Used to break an order total
 * into instalments without the last cent going missing, which is precisely the
 * invariant `sum(receivables) === order.total` in the property tests.
 */
export function allocateMoney(total: Money, weights: readonly bigint[]): Money[] {
  const weightTotal = sumBigints(weights)
  if (weightTotal === 0n) {
    throw new RangeError('allocateMoney: weights must not sum to zero')
  }

  const floors: bigint[] = []
  const remainders: { index: number; remainder: bigint }[] = []
  let distributed = 0n

  weights.forEach((weight, index) => {
    const exactNumerator = total * weight
    const share = exactNumerator / weightTotal
    floors.push(share)
    remainders.push({ index, remainder: exactNumerator - share * weightTotal })
    distributed += share
  })

  let leftover = total - distributed
  remainders.sort((a, b) =>
    b.remainder === a.remainder ? a.index - b.index : Number(b.remainder - a.remainder),
  )

  const step = leftover < 0n ? -1n : 1n
  let cursor = 0
  while (leftover !== 0n && remainders.length > 0) {
    const target = remainders[cursor % remainders.length]
    if (target === undefined) break
    const current = floors[target.index]
    if (current !== undefined) {
      floors[target.index] = current + step
      leftover -= step
    }
    cursor += 1
  }

  return floors.map(moneyFromCents)
}

/** Splits an amount into `count` equal parts, cents included. */
export function splitMoney(total: Money, count: number): Money[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError('splitMoney: count must be a positive integer')
  }
  return allocateMoney(
    total,
    Array.from({ length: count }, () => 1n),
  )
}

/**
 * The single schema every adapter reuses: an HTML form, a JSON API body and an
 * MCP tool call all validate money the same way and produce the same type.
 */
export const moneySchema = z.union([z.string(), z.number()]).transform((raw, ctx) => {
  const parsed = money(raw)
  if (!parsed.ok) {
    ctx.addIssue({ code: 'custom', message: parsed.error.message })
    return z.NEVER
  }
  return parsed.value
})

export const positiveMoneySchema = moneySchema.refine((value) => value > 0n, {
  message: 'Amount must be greater than zero.',
})

export const nonNegativeMoneySchema = moneySchema.refine((value) => value >= 0n, {
  message: 'Amount must not be negative.',
})
