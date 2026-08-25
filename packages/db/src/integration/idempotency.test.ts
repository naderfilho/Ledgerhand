import {
  runOperation,
  type JsonValue,
  type OperationDependencies,
  type OperationOutcome,
} from '@ledgerhand/domain'
import { and, eq, sql } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { idempotencyRecords, stockMovements } from '../schema/index.js'
import { withScope, type Transaction } from '../unit-of-work.js'
import {
  createTenant,
  FIXED_NOW,
  postgresIsAvailable,
  SKIP_MESSAGE,
  startIntegration,
  type IntegrationContext,
  type IntegrationTenant,
} from './harness.js'

/**
 * Idempotency, against a real transaction.
 *
 * The domain tests prove the protocol with an in-memory store. What only
 * Postgres can show is the part that matters operationally: the record and the
 * effect commit together, so a retry cannot find one without the other, and
 * the unique index refuses a second record for the same key.
 */

const available = await postgresIsAvailable()

describe.skipIf(!available)('idempotent operations through the SQL store', () => {
  let context: IntegrationContext
  let tenant: IntegrationTenant

  const sha256 = (canonical: string): string =>
    createHash('sha256').update(canonical, 'utf8').digest('hex')

  const call = async (
    name: string,
    input: unknown,
    idempotencyKey: string | null = null,
  ): Promise<OperationOutcome> =>
    await withScope(
      context.app.db,
      tenant.session,
      async (scope) => {
        const dependencies: OperationDependencies = {
          idempotency: scope.idempotency,
          hash: sha256,
        }
        return await runOperation({ name, input, idempotencyKey }, scope.context, dependencies)
      },
      { now: FIXED_NOW },
    )

  /**
   * Reads a table outside any use case. Row level security applies to the
   * application role, so the tenant has to be set for the query to see
   * anything -- which is itself the behaviour ADR 0004 promises.
   */
  const rowsOf = async <T>(query: (tx: Transaction) => Promise<T>): Promise<T> =>
    await context.app.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${tenant.tenantId}, true)`)
      return await query(tx)
    })

  const valueOf = (outcome: OperationOutcome): JsonValue => {
    if (!outcome.ok) throw new Error(`${outcome.error.code}: ${outcome.error.message}`)
    return outcome.value
  }

  beforeAll(async () => {
    if (!available) {
      console.warn(SKIP_MESSAGE)
      return
    }
    context = startIntegration()
    tenant = await createTenant(context, 'Idempotency Ltda')
  })

  afterAll(async () => {
    await context.close()
  })

  it('performs the operation once however many times it is retried', async () => {
    const product = valueOf(
      await call('create_product', { sku: 'IDEM-01', name: 'Widget', salePrice: '49.90' }),
    ) as { id: string }

    const entry = {
      productId: product.id,
      quantity: '10',
      unitCost: '3.00',
    }

    const first = await call('register_stock_entry', entry, 'entry-1')
    const second = await call('register_stock_entry', entry, 'entry-1')
    const third = await call('register_stock_entry', entry, 'entry-1')

    expect(first.ok && first.replayed).toBe(false)
    expect(second.ok && second.replayed).toBe(true)
    expect(third.ok && third.replayed).toBe(true)
    // Deep equality rather than string equality: the response comes back out
    // of `jsonb`, which does not preserve the order the keys went in with. The
    // values are identical, which is what a caller retrying actually needs.
    expect(valueOf(second)).toEqual(valueOf(first))

    const movements = await rowsOf(
      async (tx) =>
        await tx
          .select()
          .from(stockMovements)
          .where(
            and(
              eq(stockMovements.tenantId, tenant.tenantId),
              eq(stockMovements.productId, product.id),
            ),
          ),
    )
    expect(movements).toHaveLength(1)

    const stored = await rowsOf(
      async (tx) =>
        await tx
          .select()
          .from(idempotencyRecords)
          .where(
            and(
              eq(idempotencyRecords.tenantId, tenant.tenantId),
              eq(idempotencyRecords.key, 'entry-1'),
            ),
          ),
    )
    expect(stored).toHaveLength(1)
    expect(stored[0]?.operation).toBe('register_stock_entry')
  })

  it('refuses the same key with different arguments', async () => {
    const product = valueOf(
      await call('create_product', { sku: 'IDEM-02', name: 'Other widget', salePrice: '19.90' }),
    ) as { id: string }

    await call(
      'register_stock_entry',
      { productId: product.id, quantity: '5', unitCost: '1.00' },
      'entry-2',
    )
    const clash = await call(
      'register_stock_entry',
      { productId: product.id, quantity: '500', unitCost: '1.00' },
      'entry-2',
    )

    expect(clash.ok).toBe(false)
    if (!clash.ok) expect(clash.error.code).toBe('IDEMPOTENCY_KEY_REUSED')
  })

  it('leaves no record behind when the operation is refused', async () => {
    const refused = await call(
      'register_stock_entry',
      { productId: '00000000-0000-4000-8000-000000000000', quantity: '1', unitCost: '1.00' },
      'entry-3',
    )

    expect(refused.ok).toBe(false)
    const stored = await rowsOf(
      async (tx) =>
        await tx
          .select()
          .from(idempotencyRecords)
          .where(
            and(
              eq(idempotencyRecords.tenantId, tenant.tenantId),
              eq(idempotencyRecords.key, 'entry-3'),
            ),
          ),
    )
    expect(stored).toHaveLength(0)
  })
})
