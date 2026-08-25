import { z } from 'zod'
import type { DomainError } from './errors.js'
import { mapOk, type Result } from './result.js'
import { absBigint, formatScaled, parseScaled, sumBigints, type Brand } from './scaled.js'

/** Physical quantities, held as an integer number of thousandths of a unit. */
export type Quantity = Brand<bigint, 'Quantity'>

export const QUANTITY_SCALE = 3
export const ZERO_QUANTITY = 0n as Quantity

export function quantityFromThousandths(value: bigint): Quantity {
  return value as Quantity
}

export function quantity(input: string | number): Result<Quantity, DomainError> {
  return mapOk(parseScaled(input, QUANTITY_SCALE, 'Quantity'), quantityFromThousandths)
}

export function addQuantity(a: Quantity, b: Quantity): Quantity {
  return (a + b) as Quantity
}

export function subQuantity(a: Quantity, b: Quantity): Quantity {
  return (a - b) as Quantity
}

export function negateQuantity(value: Quantity): Quantity {
  return subQuantity(ZERO_QUANTITY, value)
}

export function absQuantity(value: Quantity): Quantity {
  return absBigint(value) as Quantity
}

export function sumQuantity(values: readonly Quantity[]): Quantity {
  return sumBigints(values) as Quantity
}

export function compareQuantity(a: Quantity, b: Quantity): -1 | 0 | 1 {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

export function isZeroQuantity(value: Quantity): boolean {
  return value === 0n
}

export function isPositiveQuantity(value: Quantity): boolean {
  return value > 0n
}

export function isNegativeQuantity(value: Quantity): boolean {
  return value < 0n
}

export function minQuantity(a: Quantity, b: Quantity): Quantity {
  return a < b ? a : b
}

export function maxQuantity(a: Quantity, b: Quantity): Quantity {
  return a > b ? a : b
}

export function formatQuantity(value: Quantity): string {
  return formatScaled(value, QUANTITY_SCALE, { minFractionDigits: 0 })
}

export const quantitySchema = z.union([z.string(), z.number()]).transform((raw, ctx) => {
  const parsed = quantity(raw)
  if (!parsed.ok) {
    ctx.addIssue({ code: 'custom', message: parsed.error.message })
    return z.NEVER
  }
  return parsed.value
})

export const positiveQuantitySchema = quantitySchema.refine((value) => value > 0n, {
  message: 'Quantity must be greater than zero.',
})

export const nonNegativeQuantitySchema = quantitySchema.refine((value) => value >= 0n, {
  message: 'Quantity must not be negative.',
})
