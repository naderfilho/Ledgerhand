import { describe, expect, it } from 'vitest'
import { domainError, isDomainError, notFound, validationFailed } from './errors.js'
import { asId, skuSchema, type ProductId } from './ids.js'
import {
  absMoney,
  compareMoney,
  isNegativeMoney,
  isPositiveMoney,
  isZeroMoney,
  maxMoney,
  minMoney,
  moneyFromCents,
  negateMoney,
} from './money.js'
import {
  absQuantity,
  addQuantity,
  compareQuantity,
  formatQuantity,
  isNegativeQuantity,
  isPositiveQuantity,
  isZeroQuantity,
  maxQuantity,
  minQuantity,
  negateQuantity,
  quantity,
  quantityFromThousandths,
  subQuantity,
  sumQuantity,
} from './quantity.js'
import { collect, err, flatMapOk, isErr, isOk, mapOk, ok, unwrap, UnwrapError } from './result.js'
import { compareUnitValue, unitCost, unitPrice } from './unit-value.js'

/**
 * The value objects are the public surface of `@ledgerhand/domain/kit`: the
 * web app sorts tables with them, the MCP server formats tool output with
 * them. They are tested directly rather than only through the use cases that
 * happen to reach them.
 */

describe('Money operations', () => {
  const ten = moneyFromCents(1000n)
  const three = moneyFromCents(300n)
  const negative = moneyFromCents(-250n)

  it('compares, orders and reports sign', () => {
    expect(compareMoney(three, ten)).toBe(-1)
    expect(compareMoney(ten, three)).toBe(1)
    expect(compareMoney(ten, ten)).toBe(0)
    expect(minMoney(three, ten)).toBe(three)
    expect(maxMoney(three, ten)).toBe(ten)
    expect(minMoney(ten, three)).toBe(three)
    expect(maxMoney(ten, three)).toBe(ten)
  })

  it('negates and absolutes without leaving the type', () => {
    expect(negateMoney(ten)).toBe(moneyFromCents(-1000n))
    expect(absMoney(negative)).toBe(moneyFromCents(250n))
    expect(absMoney(ten)).toBe(ten)
  })

  it('answers the three sign questions a ledger asks', () => {
    expect(isZeroMoney(moneyFromCents(0n))).toBe(true)
    expect(isZeroMoney(ten)).toBe(false)
    expect(isPositiveMoney(ten)).toBe(true)
    expect(isPositiveMoney(negative)).toBe(false)
    expect(isNegativeMoney(negative)).toBe(true)
    expect(isNegativeMoney(ten)).toBe(false)
  })
})

describe('Quantity operations', () => {
  const five = quantityFromThousandths(5000n)
  const two = quantityFromThousandths(2000n)

  it('adds, subtracts and sums', () => {
    expect(formatQuantity(addQuantity(five, two))).toBe('7')
    expect(formatQuantity(subQuantity(five, two))).toBe('3')
    expect(formatQuantity(sumQuantity([five, two, two]))).toBe('9')
    expect(formatQuantity(sumQuantity([]))).toBe('0')
  })

  it('compares, orders, negates and absolutes', () => {
    expect(compareQuantity(two, five)).toBe(-1)
    expect(compareQuantity(five, two)).toBe(1)
    expect(compareQuantity(five, five)).toBe(0)
    expect(minQuantity(two, five)).toBe(two)
    expect(maxQuantity(two, five)).toBe(five)
    expect(minQuantity(five, two)).toBe(two)
    expect(maxQuantity(five, two)).toBe(five)
    expect(formatQuantity(negateQuantity(five))).toBe('-5')
    expect(formatQuantity(absQuantity(negateQuantity(five)))).toBe('5')
    expect(formatQuantity(absQuantity(five))).toBe('5')
  })

  it('answers the sign questions', () => {
    expect(isZeroQuantity(quantityFromThousandths(0n))).toBe(true)
    expect(isZeroQuantity(five)).toBe(false)
    expect(isPositiveQuantity(five)).toBe(true)
    expect(isPositiveQuantity(negateQuantity(five))).toBe(false)
    expect(isNegativeQuantity(negateQuantity(five))).toBe(true)
    expect(isNegativeQuantity(five)).toBe(false)
  })

  it('renders fractional quantities without trailing noise', () => {
    expect(formatQuantity(quantityFromThousandths(1500n))).toBe('1.5')
    expect(formatQuantity(quantityFromThousandths(1000n))).toBe('1')
    expect(formatQuantity(quantityFromThousandths(1n))).toBe('0.001')
  })

  it('parses and rejects like money does', () => {
    expect(quantity('2.5').ok).toBe(true)
    expect(quantity('2.5001').ok).toBe(false)
  })
})

describe('per-unit values', () => {
  it('parses prices and costs at six decimals and orders them', () => {
    const low = unitPrice('1.500000')
    const high = unitCost('1.500001')
    expect(low.ok && high.ok).toBe(true)
    if (!low.ok || !high.ok) return
    expect(compareUnitValue(low.value, high.value)).toBe(-1)
    expect(compareUnitValue(high.value, low.value)).toBe(1)
    expect(compareUnitValue(low.value, low.value)).toBe(0)
  })

  it('rejects more precision than six decimals', () => {
    expect(unitPrice('1.0000001').ok).toBe(false)
    expect(unitCost('1.0000001').ok).toBe(false)
  })
})

describe('SKU normalisation', () => {
  it('upper-cases and trims', () => {
    expect(skuSchema.parse('  wid-01 ')).toBe('WID-01')
  })

  it('rejects separators that would break a document layout', () => {
    for (const bad of ['wid 01', 'wid/01', '', '-leading']) {
      expect(skuSchema.safeParse(bad).success).toBe(false)
    }
  })

  it('brands a known identifier without pretending to validate it', () => {
    const id = asId<ProductId>('00000000-0000-4000-8000-000000000001')
    expect(id).toBe('00000000-0000-4000-8000-000000000001')
  })
})

describe('Result', () => {
  it('narrows with the type guards', () => {
    const good = ok(1)
    const bad = err('nope')
    expect(isOk(good)).toBe(true)
    expect(isErr(good)).toBe(false)
    expect(isOk(bad)).toBe(false)
    expect(isErr(bad)).toBe(true)
  })

  it('maps the success case and passes failures through untouched', () => {
    expect(mapOk(ok(2), (value) => value * 3)).toEqual(ok(6))
    expect(mapOk(err('boom'), (value: number) => value * 3)).toEqual(err('boom'))
    expect(flatMapOk(ok(2), (value) => ok(value + 1))).toEqual(ok(3))
    expect(flatMapOk(err('boom'), (value: number) => ok(value + 1))).toEqual(err('boom'))
  })

  it('collects a list, stopping at the first failure', () => {
    expect(collect([ok(1), ok(2)])).toEqual(ok([1, 2]))
    expect(collect([ok(1), err('bad line'), ok(3)])).toEqual(err('bad line'))
  })

  it('throws only when a caller unwraps a failure', () => {
    expect(unwrap(ok('value'))).toBe('value')
    expect(() => unwrap(err({ code: 'NOT_FOUND' }))).toThrow(UnwrapError)
  })
})

describe('DomainError', () => {
  it('builds the shapes every adapter relies on', () => {
    expect(notFound('Product', 'abc')).toMatchObject({
      code: 'NOT_FOUND',
      details: { entity: 'Product', id: 'abc' },
    })
    expect(validationFailed('bad').code).toBe('VALIDATION_FAILED')
    expect(domainError('FORBIDDEN', 'no').details).toEqual({})
  })

  it('recognises its own errors and nothing else', () => {
    expect(isDomainError(notFound('Product', 'abc'))).toBe(true)
    expect(isDomainError({ code: 'SOMETHING_ELSE' })).toBe(false)
    expect(isDomainError(null)).toBe(false)
    expect(isDomainError('NOT_FOUND')).toBe(false)
  })
})
