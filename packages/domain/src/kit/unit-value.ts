import { z } from 'zod'
import type { DomainError } from './errors.js'
import { moneyFromCents, MONEY_SCALE, type Money } from './money.js'
import { QUANTITY_SCALE, type Quantity } from './quantity.js'
import { mapOk, type Result } from './result.js'
import { formatScaled, mulDiv, parseScaled, pow10, roundDiv, type Brand } from './scaled.js'

/**
 * Per-unit values -- what one unit sells for, what one unit is worth in stock.
 * Held at 1e6 rather than 1e2 because weighted average cost is a running
 * division: rounding it to cents on every receipt makes inventory valuation
 * drift away from the general ledger over a few hundred movements.
 */
export type UnitPrice = Brand<bigint, 'UnitPrice'>
export type UnitCost = Brand<bigint, 'UnitCost'>

export const UNIT_VALUE_SCALE = 6
export const ZERO_UNIT_PRICE = 0n as UnitPrice
export const ZERO_UNIT_COST = 0n as UnitCost

/** qty(1e3) * unit(1e6) => 1e9, and money is 1e2, so the divisor is 1e7. */
const EXTENSION_DIVISOR = pow10(QUANTITY_SCALE + UNIT_VALUE_SCALE - MONEY_SCALE)

export function unitPriceFromMillionths(value: bigint): UnitPrice {
  return value as UnitPrice
}

export function unitCostFromMillionths(value: bigint): UnitCost {
  return value as UnitCost
}

export function unitPrice(input: string | number): Result<UnitPrice, DomainError> {
  return mapOk(parseScaled(input, UNIT_VALUE_SCALE, 'Unit price'), unitPriceFromMillionths)
}

export function unitCost(input: string | number): Result<UnitCost, DomainError> {
  return mapOk(parseScaled(input, UNIT_VALUE_SCALE, 'Unit cost'), unitCostFromMillionths)
}

/**
 * The one place a per-unit value becomes an amount of money, and therefore the
 * one place rounding happens. Everything upstream stays exact.
 */
export function extend(quantity: Quantity, perUnit: UnitPrice | UnitCost): Money {
  return moneyFromCents(mulDiv(quantity, perUnit, EXTENSION_DIVISOR))
}

/** Inverse of `extend`, for receipts that state a line total instead of a unit cost. */
export function unitCostFromTotal(total: Money, quantity: Quantity): UnitCost {
  if (quantity === 0n) {
    throw new RangeError('unitCostFromTotal: quantity must not be zero')
  }
  return unitCostFromMillionths(mulDiv(total, EXTENSION_DIVISOR, quantity))
}

/**
 * Weighted average cost after receiving `incomingQuantity` at `incomingCost`.
 *
 *   newCost = (onHand * currentCost + incoming * incomingCost) / (onHand + incoming)
 *
 * Numerator is 1e3 * 1e6 = 1e9; dividing by a 1e3 quantity lands back on 1e6,
 * so no intermediate rescaling is required and only one rounding step occurs.
 * Receiving into a zero or negative balance adopts the incoming cost outright,
 * which is the only defensible answer when there is nothing to average with.
 */
export function weightedAverageCost(
  onHand: Quantity,
  currentCost: UnitCost,
  incomingQuantity: Quantity,
  incomingCost: UnitCost,
): UnitCost {
  const resultingQuantity = onHand + incomingQuantity
  if (onHand <= 0n || resultingQuantity <= 0n) return incomingCost
  const numerator = onHand * currentCost + incomingQuantity * incomingCost
  return unitCostFromMillionths(roundDiv(numerator, resultingQuantity))
}

export function formatUnitValue(value: UnitPrice | UnitCost): string {
  return formatScaled(value, UNIT_VALUE_SCALE, { minFractionDigits: 2 })
}

export function compareUnitValue(a: UnitPrice | UnitCost, b: UnitPrice | UnitCost): -1 | 0 | 1 {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

export const unitPriceSchema = z.union([z.string(), z.number()]).transform((raw, ctx) => {
  const parsed = unitPrice(raw)
  if (!parsed.ok) {
    ctx.addIssue({ code: 'custom', message: parsed.error.message })
    return z.NEVER
  }
  return parsed.value
})

export const unitCostSchema = z.union([z.string(), z.number()]).transform((raw, ctx) => {
  const parsed = unitCost(raw)
  if (!parsed.ok) {
    ctx.addIssue({ code: 'custom', message: parsed.error.message })
    return z.NEVER
  }
  return parsed.value
})

export const positiveUnitPriceSchema = unitPriceSchema.refine((value) => value > 0n, {
  message: 'Unit price must be greater than zero.',
})

export const nonNegativeUnitCostSchema = unitCostSchema.refine((value) => value >= 0n, {
  message: 'Unit cost must not be negative.',
})
