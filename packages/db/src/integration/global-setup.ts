import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

/**
 * Resets and migrates the test database exactly once per run.
 *
 * It lives here rather than in a `beforeAll` because dropping the schema is a
 * global act: two test files each doing it raced, and the loser reported
 * "schema public does not exist" from inside its own migration. Individual
 * files create their own tenants and never touch the schema.
 */
const ADMIN_URL =
  process.env['DATABASE_TEST_ADMIN_URL'] ??
  'postgres://postgres:postgres@localhost:5433/ledgerhand_test'

export async function setup(): Promise<void> {
  const probe = postgres(ADMIN_URL, { max: 1, connect_timeout: 2, onnotice: () => undefined })
  try {
    await probe`select 1`
  } catch {
    // No database: every integration test skips itself and says why.
    await probe.end({ timeout: 2 }).catch(() => undefined)
    return
  }

  try {
    await probe.unsafe('drop schema if exists drizzle cascade')
    await probe.unsafe('drop schema if exists public cascade')
    await probe.unsafe('create schema public')
    await probe.unsafe('grant all on schema public to public')
    await migrate(drizzle(probe), {
      migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
    })
  } finally {
    await probe.end({ timeout: 5 })
  }
}
