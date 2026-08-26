import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { fileURLToPath } from 'node:url'
import postgres, { type Sql } from 'postgres'

/**
 * ---------------------------------------------------------------------------
 * Migration
 * ---------------------------------------------------------------------------
 * Applies pending migrations as the schema owner. The application role has no
 * DDL rights and never runs this.
 */

/**
 * The role passwords in migrations 0001 and 0002 are development defaults, and
 * they are printed in this repository. Behind a Postgres that answers only to
 * localhost that is harmless. In front of a managed instance whose pooler
 * answers to the internet it is a published credential for a role that reads
 * and writes every tenant's data, and row level security does not save it: the
 * tenant is chosen by whoever holds the connection, with `set_config`, not
 * granted to them.
 *
 * A deployment therefore sets these two variables, and the roles finish the
 * migration with a password that is nowhere in this repository. Unset, the
 * local defaults stand, which is what `docker compose up` expects.
 */
const ROLE_PASSWORDS = [
  ['ledgerhand_app', 'DATABASE_APP_PASSWORD'],
  ['ledgerhand_auth', 'DATABASE_AUTH_PASSWORD'],
] as const

/**
 * `ALTER ROLE` takes no parameter placeholder, so the value is inspected
 * rather than escaped: a password outside this alphabet is refused instead of
 * quoted, which is the version of this that cannot be got wrong.
 */
const SAFE_PASSWORD = /^[A-Za-z0-9._~-]{16,}$/

async function rotateRolePasswords(sql: Sql): Promise<void> {
  for (const [role, variable] of ROLE_PASSWORDS) {
    const password = process.env[variable]
    if (password === undefined || password === '') continue

    if (!SAFE_PASSWORD.test(password)) {
      throw new Error(
        `${variable} must be at least 16 characters, using only A-Z a-z 0-9 . _ ~ and -`,
      )
    }

    await sql.unsafe(`ALTER ROLE ${role} PASSWORD '${password}'`)
    console.log(`Password for ${role} taken from ${variable}.`)
  }
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_ADMIN_URL']
  if (url === undefined || url === '') {
    throw new Error('DATABASE_ADMIN_URL is not set. Copy .env.example to .env first.')
  }

  const folder = fileURLToPath(new URL('../../drizzle', import.meta.url))
  const sql = postgres(url, { max: 1, onnotice: () => undefined })

  try {
    console.log(`Applying migrations from ${folder}`)
    await migrate(drizzle(sql), { migrationsFolder: folder })
    await rotateRolePasswords(sql)
    console.log('Migrations applied.')
  } finally {
    await sql.end({ timeout: 5 })
  }
}

await main()
