import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres, { type Sql } from 'postgres'
import * as schema from './schema/index.js'

/**
 * ---------------------------------------------------------------------------
 * Connection
 * ---------------------------------------------------------------------------
 * Two connections, on purpose:
 *
 *   application  connects as `ledgerhand_app`, a role with no BYPASSRLS. Row
 *                level security decides what it can see, and the tenant is set
 *                per transaction.
 *   migration    connects as the owner. Used by `db:migrate` and `db:seed`
 *                only, never by the running application.
 *
 * Keeping them apart is what makes the RLS test meaningful: if the application
 * ran as the owner, every policy in the schema would be decorative.
 */

export type Database = PostgresJsDatabase<typeof schema>

export interface DatabaseHandle {
  readonly db: Database
  readonly sql: Sql
  readonly close: () => Promise<void>
}

export interface ConnectionOptions {
  readonly max?: number
  readonly connectTimeoutSeconds?: number
  readonly debug?: boolean
}

export function createDatabase(url: string, options: ConnectionOptions = {}): DatabaseHandle {
  const sql = postgres(url, {
    max: options.max ?? 10,
    connect_timeout: options.connectTimeoutSeconds ?? 10,
    // `numeric` must arrive as a string. Anything that parses it into a JS
    // number on the way in would defeat the entire fixed-point design.
    types: {
      bigint: postgres.BigInt,
    },
    ...(options.debug === true ? {} : { onnotice: (): void => undefined }),
  })

  return {
    db: drizzle(sql, { schema, logger: options.debug ?? false }),
    sql,
    close: async () => {
      await sql.end({ timeout: 5 })
    },
  }
}

export function databaseUrlFromEnv(variable = 'DATABASE_URL'): string {
  const url = process.env[variable]
  if (url === undefined || url.trim() === '') {
    throw new Error(
      `${variable} is not set. Copy .env.example to .env, or start the database with "docker compose up -d postgres".`,
    )
  }
  return url
}

export { schema }
