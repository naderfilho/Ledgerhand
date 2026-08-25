import { domainError, validationFailed, type DomainError } from './errors.js'
import { err, ok, type Result } from './result.js'

/**
 * ---------------------------------------------------------------------------
 * Fixed-point arithmetic
 * ---------------------------------------------------------------------------
 * Every monetary and quantitative value in Ledgerhand is a `bigint` holding an
 * integer number of the smallest unit it is allowed to have. No `number`, no
 * IEEE-754, no cents quietly evaporating from a weighted average.
 *
 * Three scales are in use, and they are not interchangeable:
 *
 *   Money      1e2   cents                  totals, balances, settlements
 *   Quantity   1e3   thousandths of a unit  supports kg, litres, boxes of 12
 *   UnitValue  1e6   millionths             per-unit price and per-unit cost
 *
 * The unit scale is deliberately four digits finer than money. Weighted
 * average cost divides repeatedly, and rounding it to cents on every receipt
 * makes stock valuation drift away from the ledger. Rounding happens once, at
 * the edge, when a per-unit value is extended into an amount of money.
 *
 * See docs/adr/0003-fixed-point-arithmetic.md.
 */

declare const brandTag: unique symbol
export type Brand<T, B extends string> = T & { readonly [brandTag]: B }

const POW10: readonly bigint[] = [
  1n,
  10n,
  100n,
  1_000n,
  10_000n,
  100_000n,
  1_000_000n,
  10_000_000n,
  100_000_000n,
  1_000_000_000n,
]

export function pow10(exponent: number): bigint {
  const cached = POW10[exponent]
  if (cached !== undefined) return cached
  return 10n ** BigInt(exponent)
}

/**
 * Integer division rounding half away from zero -- the rule invoices are
 * expected to follow, and the one a bookkeeper would apply by hand. Banker's
 * rounding is statistically nicer but surprises people reading a total.
 */
export function roundDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError('roundDiv: division by zero')
  const negative = numerator < 0n !== denominator < 0n
  const absNumerator = numerator < 0n ? -numerator : numerator
  const absDenominator = denominator < 0n ? -denominator : denominator
  const quotient = absNumerator / absDenominator
  const remainder = absNumerator % absDenominator
  const rounded = remainder * 2n >= absDenominator ? quotient + 1n : quotient
  return negative ? -rounded : rounded
}

/** `a * b / divisor`, computed at full width before a single rounding step. */
export function mulDiv(a: bigint, b: bigint, divisor: bigint): bigint {
  return roundDiv(a * b, divisor)
}

/** Moves a value between scales, rounding only when precision is lost. */
export function rescale(value: bigint, fromScale: number, toScale: number): bigint {
  if (fromScale === toScale) return value
  return toScale > fromScale
    ? value * pow10(toScale - fromScale)
    : roundDiv(value, pow10(fromScale - toScale))
}

const DECIMAL_PATTERN = /^[+-]?\d+(\.\d+)?$/

/**
 * Parses external input (JSON from a form, a tool call from a model) into a
 * scaled integer. Excess precision is rejected rather than silently rounded:
 * an agent asking to settle 10.005 of something must be told the field takes
 * two decimals, not have its intent quietly altered.
 */
export function parseScaled(
  input: string | number,
  scale: number,
  label: string,
): Result<bigint, DomainError> {
  let text: string
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      return err(validationFailed(`${label} must be a finite number.`, { received: String(input) }))
    }
    text = String(input)
    if (text.includes('e') || text.includes('E')) {
      return err(
        validationFailed(
          `${label} is too large or too small to be written as a plain number. Send it as a decimal string instead.`,
          { received: text },
        ),
      )
    }
  } else {
    text = input.trim()
  }

  if (!DECIMAL_PATTERN.test(text)) {
    return err(
      validationFailed(
        `${label} must be a decimal number such as "12.50", with no thousands separators or currency symbols.`,
        { received: text },
      ),
    )
  }

  const negative = text.startsWith('-')
  const unsigned = text.replace(/^[+-]/, '')
  const [integerPart = '0', fractionPart = ''] = unsigned.split('.')

  if (fractionPart.length > scale) {
    return err(
      domainError(
        'PRECISION_EXCEEDED',
        `${label} accepts at most ${String(scale)} decimal places, received ${String(fractionPart.length)}.`,
        { received: text, maxDecimals: scale },
      ),
    )
  }

  const magnitude = BigInt(integerPart + fractionPart.padEnd(scale, '0'))
  return ok(negative ? -magnitude : magnitude)
}

export interface FormatOptions {
  /** Drop trailing zeros down to this many decimals. Defaults to the scale. */
  readonly minFractionDigits?: number
}

/**
 * Renders a scaled integer as a plain decimal string. Locale formatting is a
 * presentation concern and lives in the UI; everything crossing an API, a tool
 * result or an event payload uses this canonical form.
 */
export function formatScaled(value: bigint, scale: number, options: FormatOptions = {}): string {
  const negative = value < 0n
  const digits = (negative ? -value : value).toString().padStart(scale + 1, '0')
  const integerPart = digits.slice(0, digits.length - scale)
  let fractionPart = scale === 0 ? '' : digits.slice(digits.length - scale)

  const minFractionDigits = Math.min(options.minFractionDigits ?? scale, scale)
  while (fractionPart.length > minFractionDigits && fractionPart.endsWith('0')) {
    fractionPart = fractionPart.slice(0, -1)
  }

  const sign = negative ? '-' : ''
  return fractionPart.length > 0 ? `${sign}${integerPart}.${fractionPart}` : `${sign}${integerPart}`
}

export function sumBigints(values: readonly bigint[]): bigint {
  return values.reduce<bigint>((total, value) => total + value, 0n)
}

export function absBigint(value: bigint): bigint {
  return value < 0n ? -value : value
}

export function minBigint(a: bigint, b: bigint): bigint {
  return a < b ? a : b
}

export function maxBigint(a: bigint, b: bigint): bigint {
  return a > b ? a : b
}
