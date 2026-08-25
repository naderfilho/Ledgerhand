import { asId, type TenantId, type UserId } from '@ledgerhand/domain'
import { sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { createDatabase, type DatabaseHandle } from '../client.js'
import { tenants, users } from '../schema/index.js'
import { systemSession, type Session } from '../unit-of-work.js'

/**
 * ---------------------------------------------------------------------------
 * Integration harness
 * ---------------------------------------------------------------------------
 * These tests run against a real Postgres, because the things they check --
 * row level security, `SELECT ... FOR UPDATE`, gap-free numbering, `numeric`
 * round-tripping -- do not exist in a fake. Start it with:
 *
 *     docker compose -f docker/compose.yml up -d postgres-test
 *
 * When it is not running the suite skips with a message rather than failing,
 * so `pnpm test` stays useful on a machine without Docker. CI always provides
 * the service, so nothing is skipped where it matters.
 */

const ADMIN_URL =
  process.env['DATABASE_TEST_ADMIN_URL'] ??
  'postgres://postgres:postgres@localhost:5433/ledgerhand_test'

/** The application role: no ownership, no BYPASSRLS. */
const APP_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgres://ledgerhand_app:ledgerhand_app@localhost:5433/ledgerhand_test'

export async function postgresIsAvailable(): Promise<boolean> {
  const probe = postgres(ADMIN_URL, {
    max: 1,
    connect_timeout: 2,
    onnotice: () => undefined,
    idle_timeout: 1,
  })
  try {
    await probe`select 1`
    return true
  } catch {
    return false
  } finally {
    await probe.end({ timeout: 2 }).catch(() => undefined)
  }
}

export const SKIP_MESSAGE =
  'Postgres is not reachable on localhost:5433. Start it with "docker compose -f docker/compose.yml up -d postgres-test".'

export interface IntegrationTenant {
  readonly tenantId: TenantId
  readonly userId: UserId
  readonly session: Session
}

export interface IntegrationContext {
  /** Connected as the application role, so RLS applies. */
  readonly app: DatabaseHandle
  /** Connected as the owner, for setup that predates a tenant context. */
  readonly admin: DatabaseHandle
  readonly close: () => Promise<void>
}

/**
 * The schema is prepared once per run by the global setup, so opening the two
 * pools is synchronous -- there is nothing to await here.
 */
export function startIntegration(): IntegrationContext {
  const app = createDatabase(APP_URL, { max: 4 })
  const admin = createDatabase(ADMIN_URL, { max: 2 })
  return {
    app,
    admin,
    close: async () => {
      await app.close()
      await admin.close()
    },
  }
}

/**
 * Creates a tenant and its administrator. Written through the owner connection
 * with the tenant setting in place, because a tenant has to exist before
 * anything can be scoped to it.
 */
export async function createTenant(
  context: IntegrationContext,
  name: string,
): Promise<IntegrationTenant> {
  const tenantId = randomUUID()
  const userId = randomUUID()

  await context.admin.db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`)
    await tx.insert(tenants).values({
      id: tenantId,
      name,
      slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${tenantId.slice(0, 8)}`,
      timeZone: 'America/Sao_Paulo',
      currency: 'BRL',
    })
    await tx.insert(users).values({
      id: userId,
      tenantId,
      email: `admin-${tenantId.slice(0, 8)}@example.test`,
      name: 'Integration administrator',
      passwordHash: 'not-a-real-hash',
      role: 'admin',
    })
  })

  return {
    tenantId: asId<TenantId>(tenantId),
    userId: asId<UserId>(userId),
    session: systemSession(tenantId, userId),
  }
}

/** A fixed instant so business dates and due dates are reproducible. */
export const FIXED_NOW = new Date('2026-03-16T15:00:00.000Z')
