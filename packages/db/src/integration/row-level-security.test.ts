import { USE_CASES, unwrap } from '@ledgerhand/domain'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { products } from '../schema/index.js'
import { withUnitOfWork } from '../unit-of-work.js'
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
 * ---------------------------------------------------------------------------
 * Tenant isolation
 * ---------------------------------------------------------------------------
 * The claim "multi-tenant with row level security" is worth nothing without a
 * test that tries to break it. These do, from four directions:
 *
 *   1. reading another tenant's rows through the repositories
 *   2. reading them with raw SQL, bypassing the repositories entirely
 *   3. reading them with no tenant set at all
 *   4. writing a row belonging to another tenant
 *
 * All four run as `ledgerhand_app`, the role the application actually uses.
 */

const available = await postgresIsAvailable()

/**
 * Drizzle wraps driver errors, so the message that matters -- "permission
 * denied", "violates row-level security policy" -- is on the cause rather than
 * on the error itself. This walks the chain and returns everything, so an
 * assertion cannot pass merely because the wrapper said "Failed query".
 */
async function failureOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
  } catch (error: unknown) {
    const messages: string[] = []
    let current: unknown = error
    while (current instanceof Error) {
      messages.push(current.message)
      current = current.cause
    }
    return messages.join(' | ')
  }
  throw new Error('Expected the operation to be refused, but it succeeded.')
}

describe.skipIf(!available)('row level security', () => {
  let context: IntegrationContext
  let aurora: IntegrationTenant
  let northwind: IntegrationTenant

  beforeAll(async () => {
    context = await startIntegration()
    aurora = await createTenant(context, 'Aurora')
    northwind = await createTenant(context, 'Northwind')

    await withUnitOfWork(
      context.app.db,
      aurora.session,
      async (execution) => {
        unwrap(
          await USE_CASES.create_product.descriptor.run(
            { sku: 'AUR-1', name: 'Aurora widget', salePrice: '10.00' },
            execution,
          ),
        )
      },
      { now: FIXED_NOW },
    )

    await withUnitOfWork(
      context.app.db,
      northwind.session,
      async (execution) => {
        unwrap(
          await USE_CASES.create_product.descriptor.run(
            { sku: 'NWD-1', name: 'Northwind widget', salePrice: '20.00' },
            execution,
          ),
        )
      },
      { now: FIXED_NOW },
    )
  })

  afterAll(async () => {
    await context.close()
  })

  it('shows each tenant only its own catalogue', async () => {
    const auroraProducts = await withUnitOfWork(
      context.app.db,
      aurora.session,
      async (execution) =>
        unwrap(await USE_CASES.list_products.execute({ activeOnly: true }, execution)),
      { now: FIXED_NOW },
    )

    expect(auroraProducts.rows).toHaveLength(1)
    expect(auroraProducts.rows[0]?.sku).toBe('AUR-1')
  })

  it('hides another tenant row even from a direct lookup by its primary key', async () => {
    const northwindProduct = await withUnitOfWork(
      context.app.db,
      northwind.session,
      async (execution) =>
        unwrap(await USE_CASES.list_products.execute({ activeOnly: true }, execution)).rows[0],
      { now: FIXED_NOW },
    )
    expect(northwindProduct).toBeDefined()
    if (northwindProduct === undefined) return

    const seenByAurora = await withUnitOfWork(
      context.app.db,
      aurora.session,
      async (execution) => await execution.uow.products.findById(northwindProduct.id),
      { now: FIXED_NOW },
    )

    expect(seenByAurora).toBeNull()
  })

  /**
   * The important one. Everything above goes through repositories that also
   * filter by `tenant_id` in the WHERE clause, so they would pass even with no
   * policies at all. This query has no such filter: if it returns a row, the
   * isolation is coming from the application and not from the database.
   */
  it('refuses raw SQL that asks for every product in the table', async () => {
    const rows = await context.app.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${aurora.tenantId}, true)`)
      return await tx.select({ sku: products.sku }).from(products)
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]?.sku).toBe('AUR-1')
  })

  it('returns nothing at all when no tenant is set', async () => {
    const rows = await context.app.db.select({ sku: products.sku }).from(products)
    expect(rows).toEqual([])
  })

  it('refuses to insert a row belonging to another tenant', async () => {
    const failure = await failureOf(async () => {
      await context.app.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.tenant_id', ${aurora.tenantId}, true)`)
        await tx.execute(sql`
          insert into products (tenant_id, sku, name, sale_price)
          values (${northwind.tenantId}, 'SMUGGLED-1', 'Belongs to somebody else', 1)
        `)
      })
    })

    expect(failure).toMatch(/row-level security/i)
  })

  it('refuses to rewrite history: domain events and stock movements are append-only', async () => {
    const deleted = await failureOf(async () => {
      await context.app.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.tenant_id', ${aurora.tenantId}, true)`)
        await tx.execute(sql`delete from domain_events`)
      })
    })
    expect(deleted).toMatch(/permission denied/i)

    const edited = await failureOf(async () => {
      await context.app.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.tenant_id', ${aurora.tenantId}, true)`)
        await tx.execute(sql`update stock_movements set note = 'edited'`)
      })
    })
    expect(edited).toMatch(/permission denied/i)
  })

  it('does not leak the tenant setting between transactions on a pooled connection', async () => {
    await context.app.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${aurora.tenantId}, true)`)
      const rows = await tx.select({ sku: products.sku }).from(products)
      expect(rows).toHaveLength(1)
    })

    // A new transaction on the same pool must start with no tenant at all.
    const leaked = await context.app.db.select({ sku: products.sku }).from(products)
    expect(leaked).toEqual([])
  })
})

describe.skipIf(available)('row level security (skipped)', () => {
  it.skip(SKIP_MESSAGE, () => undefined)
})
