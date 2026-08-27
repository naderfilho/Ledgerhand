import { loadRepositoryEnvironment } from './environment.js'
import postgres from 'postgres'

/**
 * Drops and recreates the public schema. Development only -- it refuses to run
 * against anything that does not look like a local database, because "reset the
 * database" is the one command nobody wants to fire at the wrong host.
 */
async function main(): Promise<void> {
  loadRepositoryEnvironment()
  const url = process.env['DATABASE_ADMIN_URL']
  if (url === undefined || url === '') {
    throw new Error('DATABASE_ADMIN_URL is not set.')
  }

  const host = new URL(url).hostname
  const local = ['localhost', '127.0.0.1', 'postgres', 'db', 'host.docker.internal']
  if (!local.includes(host) && process.env['LEDGERHAND_ALLOW_REMOTE_RESET'] !== 'yes') {
    throw new Error(
      `Refusing to reset a database on "${host}". Set LEDGERHAND_ALLOW_REMOTE_RESET=yes if you really mean it.`,
    )
  }

  const sql = postgres(url, { max: 1, onnotice: () => undefined })
  try {
    await sql.unsafe('drop schema if exists drizzle cascade')
    await sql.unsafe('drop schema public cascade')
    await sql.unsafe('create schema public')
    await sql.unsafe('grant all on schema public to public')
    console.log(`Schema reset on ${host}. Run "pnpm db:migrate" next.`)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

await main()
