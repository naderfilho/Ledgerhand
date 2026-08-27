import postgres from 'postgres'

/**
 * ---------------------------------------------------------------------------
 * Emptying the business, without touching the schema
 * ---------------------------------------------------------------------------
 * `db:reset` drops and recreates the `public` schema, which is the right thing
 * on a local Postgres where the migration role owns everything. On a managed
 * instance it is not available: there the schema belongs to the platform --
 * `pg_database_owner` on Supabase -- and the role that runs migrations owns
 * the tables inside it and nothing else. `drop schema public` fails, and
 * arranging for it to succeed would mean handing the application's owner a
 * privilege it should never have.
 *
 * So this empties the tables instead. `TRUNCATE` needs ownership of the tables
 * and nothing more, which the migration role has by definition, and the schema,
 * the roles, the grants and the row level security policies all survive it --
 * which is also what makes it safe to run against a deployment: it removes
 * demo data, never structure.
 *
 * The remote guard is the same one `db:reset` uses, and for the same reason.
 */

const LOCAL_HOSTS = ['localhost', '127.0.0.1', 'postgres', 'db', 'host.docker.internal']

async function main(): Promise<void> {
  const url = process.env['DATABASE_ADMIN_URL']
  if (url === undefined || url === '') {
    throw new Error('DATABASE_ADMIN_URL is not set.')
  }

  const host = new URL(url).hostname
  if (!LOCAL_HOSTS.includes(host) && process.env['LEDGERHAND_ALLOW_REMOTE_RESET'] !== 'yes') {
    throw new Error(
      `Refusing to empty a database on "${host}". Set LEDGERHAND_ALLOW_REMOTE_RESET=yes if you really mean it.`,
    )
  }

  const sql = postgres(url, { max: 1, onnotice: () => undefined })
  try {
    const tables = await sql<{ name: string }[]>`
      select tablename as name
      from pg_tables
      where schemaname = 'public'
      order by tablename
    `

    if (tables.length === 0) {
      console.log('Nothing to empty: no tables in public. Run "pnpm db:migrate" first.')
      return
    }

    // TRUNCATE takes no parameter placeholder, so the names are inspected
    // rather than escaped -- the same choice migrate.ts makes for the role
    // passwords, and for the same reason: a name outside this alphabet is
    // refused instead of quoted.
    const strange = tables.filter((table) => !/^[a-z_][a-z0-9_]*$/.test(table.name))
    if (strange.length > 0) {
      throw new Error(
        `Refusing to truncate unexpected table names: ${strange.map((t) => t.name).join(', ')}`,
      )
    }

    // One statement, so the foreign keys between them never see a half-empty
    // database. CASCADE covers anything the list misses; RESTART IDENTITY puts
    // the sequences back, which matters because the fiscal counter is one.
    const list = tables.map((table) => `public."${table.name}"`)
    await sql.unsafe(`TRUNCATE TABLE ${list.join(', ')} RESTART IDENTITY CASCADE`)

    console.log(`Emptied ${String(tables.length)} tables on ${host}. Run "pnpm db:seed" next.`)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

await main()
