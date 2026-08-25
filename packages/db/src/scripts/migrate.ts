import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

/**
 * Applies pending migrations as the schema owner. The application role has no
 * DDL rights and never runs this.
 */
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
    console.log('Migrations applied.')
  } finally {
    await sql.end({ timeout: 5 })
  }
}

await main()
