import { beforeEach, describe, expect, it } from 'vitest'
import { canonicalJson } from '../kit/json.js'
import type { IdempotencyRecord, IdempotencyStore } from '../ports/services.js'
import { aProduct, createTestHarness, price, type TestHarness } from '../testing/index.js'
import { runOperation, previewOperation, type OperationDependencies } from './operations.js'

/**
 * The idempotency contract, exercised without a database: the same key twice
 * must not move stock twice, and the same key with different arguments must be
 * refused rather than silently answered with the first result.
 */
class MemoryIdempotency implements IdempotencyStore {
  readonly saved: IdempotencyRecord[] = []

  find(key: string, operation: string): Promise<IdempotencyRecord | null> {
    const found = this.saved.find((record) => record.key === key && record.operation === operation)
    return Promise.resolve(found ?? null)
  }

  save(record: IdempotencyRecord): Promise<void> {
    this.saved.push(record)
    return Promise.resolve()
  }
}

let harness: TestHarness
let idempotency: MemoryIdempotency
let dependencies: OperationDependencies

beforeEach(() => {
  harness = createTestHarness()
  idempotency = new MemoryIdempotency()
  // A trivial hash keeps the test about the protocol rather than about sha256.
  dependencies = { idempotency, hash: (canonical) => `h:${canonical}` }
})

describe('canonicalJson', () => {
  it('is insensitive to key order and to undefined members', () => {
    expect(canonicalJson({ b: 1, a: [2, 'x'] })).toBe(canonicalJson({ a: [2, 'x'], b: 1 }))
    expect(canonicalJson({ a: 1, note: undefined })).toBe(canonicalJson({ a: 1 }))
  })

  it('distinguishes values that only look alike', () => {
    expect(canonicalJson({ amount: '10.00' })).not.toBe(canonicalJson({ amount: 10 }))
  })
})

describe('runOperation', () => {
  it('refuses an operation that is not in the registry', async () => {
    const outcome = await runOperation(
      { name: 'drop_database', input: {} },
      harness.context,
      dependencies,
    )

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error.code).toBe('NOT_FOUND')
  })

  it('presents the result as JSON rather than as domain objects', async () => {
    const product = aProduct(harness, { sku: 'WID-01', salePrice: price(49.9) })

    const outcome = await runOperation(
      { name: 'get_product', input: { productId: product.id } },
      harness.context,
      dependencies,
    )

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.value).toMatchObject({ product: { sku: 'WID-01', salePrice: '49.90' } })
    expect(JSON.stringify(outcome.value)).toContain('49.90')
  })

  it('replays a repeated key instead of writing twice', async () => {
    const product = aProduct(harness, { sku: 'WID-01' })
    const request = {
      name: 'register_stock_entry',
      input: { productId: product.id, quantity: '10', unitCost: '3.00' },
      idempotencyKey: 'entry-1',
    }

    const first = await runOperation(request, harness.context, dependencies)
    const second = await runOperation(request, harness.context, dependencies)

    expect(first.ok && first.replayed).toBe(false)
    expect(second.ok && second.replayed).toBe(true)
    expect(first.ok && second.ok && JSON.stringify(second.value)).toBe(
      first.ok ? JSON.stringify(first.value) : '',
    )
    expect(idempotency.saved).toHaveLength(1)
    expect(harness.db.movements).toHaveLength(1)
  })

  it('refuses a key reused with different arguments', async () => {
    const product = aProduct(harness, { sku: 'WID-01' })
    const base = { name: 'register_stock_entry', idempotencyKey: 'entry-1' }

    await runOperation(
      { ...base, input: { productId: product.id, quantity: '10', unitCost: '3.00' } },
      harness.context,
      dependencies,
    )
    const clash = await runOperation(
      { ...base, input: { productId: product.id, quantity: '999', unitCost: '3.00' } },
      harness.context,
      dependencies,
    )

    expect(clash.ok).toBe(false)
    if (!clash.ok) expect(clash.error.code).toBe('IDEMPOTENCY_KEY_REUSED')
    expect(harness.db.movements).toHaveLength(1)
  })

  it('does not pin a refusal to the key, so the caller can correct the input', async () => {
    const product = aProduct(harness, { sku: 'WID-01' })
    const rejected = await runOperation(
      {
        name: 'register_stock_entry',
        input: { productId: product.id, quantity: '-5', unitCost: '3.00' },
        idempotencyKey: 'entry-2',
      },
      harness.context,
      dependencies,
    )

    expect(rejected.ok).toBe(false)
    expect(idempotency.saved).toHaveLength(0)
  })

  it('ignores the key on reads, which must never answer from a cache', async () => {
    const product = aProduct(harness, { sku: 'WID-01' })
    const request = { name: 'get_product', input: { productId: product.id }, idempotencyKey: 'r-1' }

    await runOperation(request, harness.context, dependencies)
    const second = await runOperation(request, harness.context, dependencies)

    expect(second.ok && second.replayed).toBe(false)
    expect(idempotency.saved).toHaveLength(0)
  })

  it('still enforces the capability of the role that asked', async () => {
    const readonly = harness.withOverrides({ role: 'readonly' })
    const outcome = await runOperation(
      { name: 'create_product', input: { sku: 'X-1', name: 'X', unit: 'unit', salePrice: '1.00' } },
      readonly.context,
      dependencies,
    )

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error.code).toBe('FORBIDDEN')
  })

  it('refuses on the capability before it critiques the arguments', async () => {
    const readonly = harness.withOverrides({ role: 'readonly' })
    const outcome = await runOperation(
      { name: 'create_product', input: { sku: '' } },
      readonly.context,
      dependencies,
    )

    // Both are wrong. Reporting the validation error first would tell a caller
    // the shape of an operation it is not allowed to see.
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error.code).toBe('FORBIDDEN')
  })
})

describe('previewOperation', () => {
  it('describes a destructive operation in a sentence written by the domain', async () => {
    const product = aProduct(harness, { sku: 'WID-01', name: 'Widget' })
    await runOperation(
      {
        name: 'register_stock_entry',
        input: { productId: product.id, quantity: '10', unitCost: '3.00' },
      },
      harness.context,
      dependencies,
    )

    const preview = await previewOperation(
      { name: 'register_stock_exit', input: { productId: product.id, quantity: '4' } },
      harness.context,
    )

    expect(preview.ok).toBe(true)
    if (preview.ok) expect(preview.value).toContain('WID-01')
  })

  it('returns null for an operation with nothing to warn about', async () => {
    const preview = await previewOperation({ name: 'list_products', input: {} }, harness.context)

    expect(preview.ok && preview.value).toBeNull()
  })
})
