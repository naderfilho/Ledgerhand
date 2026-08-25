import {
  addDays,
  asId,
  businessDateIn,
  isErr,
  quantityFromThousandths,
  skuSchema,
  unitCostFromMillionths,
  unitPriceFromMillionths,
  USE_CASES,
  type AgentRunId,
  type BusinessDate,
  type ExecutionContext,
  type Quantity,
  type Result,
  type Sku,
  type UnitCost,
  type UnitPrice,
  type UserId,
} from '@ledgerhand/domain'
import { sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { createDatabase } from '../client.js'
import { hashPassword } from '../password.js'
import { tenants, users } from '../schema/index.js'
import { systemSession, withUnitOfWork, type Session } from '../unit-of-work.js'
import {
  SEED_CUSTOMERS,
  SEED_PRODUCTS,
  SEED_SUPPLIERS,
  SEED_USERS,
  SUPPLIER_FOR_PREFIX,
} from './seed-data.js'

/**
 * ---------------------------------------------------------------------------
 * Seed
 * ---------------------------------------------------------------------------
 * Ninety days of trading, built by calling the real use cases rather than by
 * inserting rows. It is slower than a pile of INSERTs and worth it twice over:
 * the demo data cannot violate an invariant, and running the seed is itself an
 * end-to-end test of the domain against Postgres.
 *
 * Everything is deterministic. The same command produces the same database,
 * which is what lets a screenshot, an eval fixture and a bug report all refer
 * to the same numbers.
 */

const TIME_ZONE = 'America/Sao_Paulo'
const DAYS_OF_HISTORY = 90
/** How many days before today purchasing stops, leaving a visible backlog. */
const REPLENISHMENT_FREEZE_DAYS = 20

/** Deterministic PRNG (mulberry32). No Math.random anywhere in this repo. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

const random = createRandom(20_260_316)
const pick = <T>(items: readonly T[]): T => {
  const item = items[Math.floor(random() * items.length)]
  if (item === undefined) throw new Error('pick() on an empty list')
  return item
}
const between = (min: number, max: number): number => min + Math.floor(random() * (max - min + 1))

function expect<T>(result: Result<T, { message: string }>, what: string): T {
  if (isErr(result)) throw new Error(`Seed failed while ${what}: ${result.error.message}`)
  return result.value
}

/** Business rejections that are fine to skip -- a day with no stock, say. */
function attempt<T>(result: Result<T, unknown>): T | null {
  return isErr(result) ? null : result.value
}

/**
 * The seed works in plain numbers for readability and converts once, here, at
 * the boundary. Rounding is explicit rather than incidental.
 */
const parseQuantity = (value: number): Quantity =>
  quantityFromThousandths(BigInt(Math.round(value * 1_000)))

const parseCost = (value: number): UnitCost =>
  unitCostFromMillionths(BigInt(Math.round(value * 1_000_000)))

const parsePrice = (value: number): UnitPrice =>
  unitPriceFromMillionths(BigInt(Math.round(value * 1_000_000)))

const parseSku = (value: string): Sku => skuSchema.parse(value)

interface SeededTenant {
  readonly id: string
  readonly session: Session
  readonly userIds: ReadonlyMap<string, string>
}

async function createTenant(
  database: ReturnType<typeof createDatabase>,
  name: string,
  slug: string,
  password: string,
  people: readonly { email: string; name: string; role: SeededRole }[],
): Promise<SeededTenant> {
  const tenantId = randomUUID()
  const userIds = new Map<string, string>()

  await database.db.transaction(async (tx) => {
    // The policy on `tenants` checks `id`, so the setting has to be the id of
    // the row about to be inserted.
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`)
    await tx
      .insert(tenants)
      .values({ id: tenantId, name, slug, timeZone: TIME_ZONE, currency: 'BRL' })

    for (const person of people) {
      const id = randomUUID()
      userIds.set(person.role, id)
      await tx.insert(users).values({
        id,
        tenantId,
        email: person.email,
        name: person.name,
        passwordHash: await hashPassword(password),
        role: person.role,
      })
    }
  })

  const adminId = userIds.get('admin')
  if (adminId === undefined) throw new Error('Every tenant needs an administrator')

  return { id: tenantId, session: systemSession(tenantId, adminId), userIds }
}

type SeededRole = (typeof SEED_USERS)[number]['role']

async function main(): Promise<void> {
  const url = process.env['DATABASE_ADMIN_URL']
  if (url === undefined || url === '') {
    throw new Error('DATABASE_ADMIN_URL is not set. Copy .env.example to .env first.')
  }
  const password = process.env['SEED_PASSWORD'] ?? 'ledgerhand'
  const database = createDatabase(url, { max: 4 })

  try {
    const [existing] = await database.db.select({ count: sql<string>`count(*)` }).from(tenants)
    if (Number(existing?.count ?? 0) > 0) {
      console.log('Database already contains tenants. Run "pnpm db:reset" first.')
      return
    }

    console.log('Creating tenants and users...')
    const aurora = await createTenant(
      database,
      'Aurora Trading Co.',
      'aurora',
      password,
      SEED_USERS.map((user) => ({ email: user.email, name: user.name, role: user.role })),
    )

    // A second tenant with its own data. It exists so the row level security
    // test has something to fail to read, and so the demo is honestly
    // multi-tenant rather than multi-tenant-shaped.
    const northwind = await createTenant(
      database,
      'Northwind Supplies Ltd',
      'northwind',
      password,
      [{ email: 'admin@northwind.dev', name: 'Frank Oliveira', role: 'admin' }],
    )

    const today = businessDateIn(new Date(), TIME_ZONE)
    const start = addDays(today, -DAYS_OF_HISTORY)

    await seedCatalogue(database, aurora, start)
    await seedHistory(database, aurora, start, today)
    await seedAgentRun(database, aurora, today)
    await seedNorthwind(database, northwind, today)

    console.log('')
    console.log('Seed complete.')
    console.log(`  Tenant   Aurora Trading Co. (${String(SEED_PRODUCTS.length)} products)`)
    console.log(`  Sign in  ${SEED_USERS[0]?.email ?? ''} / ${password}`)
    console.log('  Roles    admin, sales, finance, stock, readonly (same password)')
  } finally {
    await database.close()
  }
}

async function seedCatalogue(
  database: ReturnType<typeof createDatabase>,
  tenant: SeededTenant,
  openingDate: BusinessDate,
): Promise<void> {
  console.log('Creating suppliers, customers and products...')

  await withUnitOfWork(
    database.db,
    tenant.session,
    async (context) => {
      for (const supplier of SEED_SUPPLIERS) {
        expect(
          await USE_CASES.create_supplier.execute(
            {
              name: supplier.name,
              taxId: supplier.taxId,
              email: supplier.email,
              paymentTermDays: supplier.paymentTermDays,
            },
            context,
          ),
          'creating a supplier',
        )
      }

      for (const customer of SEED_CUSTOMERS) {
        expect(
          await USE_CASES.create_customer.execute(
            {
              name: customer.name,
              taxId: customer.taxId,
              email: customer.email,
              paymentTermDays: customer.paymentTermDays,
            },
            context,
          ),
          'creating a customer',
        )
      }

      for (const product of SEED_PRODUCTS) {
        expect(
          await USE_CASES.create_product.execute(
            {
              sku: parseSku(product.sku),
              name: product.name,
              unit: product.unit,
              salePrice: parsePrice(product.cost * (1 + product.margin)),
              minimumStock: parseQuantity(product.minimumStock),
            },
            context,
          ),
          'creating a product',
        )
      }
    },
    { now: instantFor(openingDate) },
  )

  console.log('Registering opening stock...')
  await withUnitOfWork(
    database.db,
    tenant.session,
    async (context) => {
      for (const seeded of SEED_PRODUCTS) {
        const product = expect(
          await USE_CASES.get_product.execute({ sku: parseSku(seeded.sku) }, context),
          'loading a product',
        )
        expect(
          await USE_CASES.register_stock_entry.execute(
            {
              productId: product.product.id,
              quantity: parseQuantity(seeded.openingStock),
              unitCost: parseCost(seeded.cost),
              reason: 'opening_balance',
            },
            context,
          ),
          'registering opening stock',
        )
      }
    },
    { now: instantFor(openingDate) },
  )
}

/** Midday in the tenant timezone, so the business date is never ambiguous. */
function instantFor(date: BusinessDate): Date {
  return new Date(`${date}T15:00:00.000Z`)
}

async function seedHistory(
  database: ReturnType<typeof createDatabase>,
  tenant: SeededTenant,
  start: BusinessDate,
  today: BusinessDate,
): Promise<void> {
  console.log(`Simulating ${String(DAYS_OF_HISTORY)} days of trading...`)

  for (let offset = 1; offset <= DAYS_OF_HISTORY; offset += 1) {
    const day = addDays(start, offset)
    const isToday = day === today
    // Purchasing deliberately stops before the end of the window, so the demo
    // opens with a real replenishment backlog instead of a tidy warehouse.
    const buying = offset <= DAYS_OF_HISTORY - REPLENISHMENT_FREEZE_DAYS
    await withUnitOfWork(
      database.db,
      tenant.session,
      async (context) => {
        await runBusinessDay(context, day, isToday, buying)
      },
      { now: instantFor(day) },
    )
  }
}

async function runBusinessDay(
  context: ExecutionContext,
  day: BusinessDate,
  isToday: boolean,
  buying: boolean,
): Promise<void> {
  const weekday = new Date(`${day}T12:00:00.000Z`).getUTCDay()
  const trading = weekday !== 0

  attempt(await USE_CASES.open_cash_session.execute({ businessDate: day }, context))
  if (!trading) {
    if (!isToday) attempt(await USE_CASES.close_daily_cash.execute({ businessDate: day }, context))
    return
  }

  const customers = expect(
    await USE_CASES.list_customers.execute(
      { activeOnly: true, page: { limit: 50, offset: 0 } },
      context,
    ),
    'listing customers',
  )
  const products = expect(
    await USE_CASES.list_products.execute(
      { activeOnly: true, page: { limit: 100, offset: 0 } },
      context,
    ),
    'listing products',
  )

  for (let index = 0; index < between(2, 5); index += 1) {
    const customer = pick(customers.rows)
    const lines = Array.from({ length: between(1, 4) }, () => {
      const product = pick(products.rows)
      return { productId: product.id, quantity: parseQuantity(between(2, 18)) }
    })

    const order = attempt(
      await USE_CASES.create_sales_order.execute(
        {
          customerId: customer.id,
          instalments: random() < 0.25 ? 2 : 1,
          issuedOn: day,
          items: lines,
        },
        context,
      ),
    )
    if (order === null) continue

    const confirmed = attempt(
      await USE_CASES.confirm_sales_order.execute({ orderId: order.id }, context),
    )
    if (confirmed === null) continue

    // A few orders stay confirmed rather than invoiced, so the demo has work
    // waiting on the desk when it opens.
    if (random() < 0.85) {
      attempt(
        await USE_CASES.invoice_sales_order.execute({ orderId: order.id, series: 'A' }, context),
      )
    }
  }

  // Replenishment roughly once a week, while purchasing is running.
  if (buying && random() < 0.25) {
    await replenish(context, day)
  }

  await settleWhatIsDue(context, day)

  if (!isToday) {
    attempt(
      await USE_CASES.close_daily_cash.execute(
        {
          businessDate: day,
          justification: 'Remaining titles agreed with the customer for the following day.',
        },
        context,
      ),
    )
  }
}

async function replenish(context: ExecutionContext, day: BusinessDate): Promise<void> {
  const alerts = expect(
    await USE_CASES.list_products_below_minimum.execute({}, context),
    'listing products below minimum',
  )
  if (alerts.length === 0) return

  const suppliers = expect(
    await USE_CASES.list_suppliers.execute(
      { activeOnly: true, page: { limit: 20, offset: 0 } },
      context,
    ),
    'listing suppliers',
  )

  const byPrefix = new Map<string, typeof alerts>()
  for (const alert of alerts) {
    const prefix = alert.sku.slice(0, 3)
    byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), alert])
  }

  for (const [prefix, group] of byPrefix) {
    const supplierIndex = SUPPLIER_FOR_PREFIX[prefix] ?? 0
    const supplier = suppliers.rows[supplierIndex] ?? suppliers.rows[0]
    if (supplier === undefined) continue

    const items = group.slice(0, 5).map((alert) => {
      const seeded = SEED_PRODUCTS.find((candidate) => candidate.sku === alert.sku)
      return {
        productId: alert.productId,
        quantity: parseQuantity(Number(alert.shortfall) / 1000 + between(20, 80)),
        unitCost: parseCost((seeded?.cost ?? 10) * (0.95 + random() * 0.15)),
      }
    })

    const order = attempt(
      await USE_CASES.create_purchase_order.execute(
        { supplierId: supplier.id, issuedOn: day, items },
        context,
      ),
    )
    if (order === null) continue
    attempt(await USE_CASES.place_purchase_order.execute({ orderId: order.id }, context))
    attempt(await USE_CASES.receive_purchase_order.execute({ orderId: order.id }, context))
  }
}

async function settleWhatIsDue(context: ExecutionContext, day: BusinessDate): Promise<void> {
  const receivables = expect(
    await USE_CASES.list_receivables.execute(
      { dueOn: day, overdueOnly: false, limit: 100, offset: 0 },
      context,
    ),
    'listing receivables',
  )

  for (const { title } of receivables.rows) {
    if (title.status === 'settled' || title.status === 'cancelled') continue
    // One in six customers pays late; those become the overdue list.
    if (random() < 0.17) continue
    attempt(
      await USE_CASES.settle_receivable.execute(
        {
          receivableId: title.id,
          method: random() < 0.6 ? 'pix' : 'bank_transfer',
          settledOn: day,
        },
        context,
      ),
    )
  }

  const payables = expect(
    await USE_CASES.list_payables.execute(
      { dueOn: day, overdueOnly: false, limit: 100, offset: 0 },
      context,
    ),
    'listing payables',
  )

  for (const { title } of payables.rows) {
    if (title.status === 'settled' || title.status === 'cancelled') continue
    if (random() < 0.08) continue
    attempt(
      await USE_CASES.settle_payable.execute(
        { payableId: title.id, method: 'bank_transfer', settledOn: day },
        context,
      ),
    )
  }
}

/**
 * One agent run, so the audit trail has something to show before anyone has
 * run the agent.
 *
 * It does what the replenishment scenario expects of it: reads what is below
 * minimum and drafts the orders, leaving them for a person to place. The
 * actor is an agent borrowing the stock user's identity and role -- which is
 * exactly how a real run reaches the database -- so the events carry both the
 * run id and the person accountable for it.
 */
async function seedAgentRun(
  database: ReturnType<typeof createDatabase>,
  tenant: SeededTenant,
  today: BusinessDate,
): Promise<void> {
  const stockUserId = tenant.userIds.get('stock')
  if (stockUserId === undefined) return

  console.log('Recording one agent run against the audit trail...')
  const agentRunId = '3f6d9c22-2b4e-4a0f-9a1a-7c8f5b2d1e40'
  const session: Session = {
    ...systemSession(tenant.id, stockUserId),
    role: 'stock',
    actor: {
      kind: 'agent',
      userId: asId<UserId>(stockUserId),
      agentRunId: asId<AgentRunId>(agentRunId),
    },
  }

  await withUnitOfWork(
    database.db,
    session,
    async (context) => {
      const alerts = expect(
        await USE_CASES.list_products_below_minimum.execute({}, context),
        'listing products below minimum',
      )
      const suppliers = expect(
        await USE_CASES.list_suppliers.execute(
          { activeOnly: true, page: { limit: 20, offset: 0 } },
          context,
        ),
        'listing suppliers',
      )

      const byPrefix = new Map<string, typeof alerts>()
      for (const alert of alerts.slice(0, 6)) {
        const prefix = alert.sku.slice(0, 3)
        byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), alert])
      }

      for (const [prefix, group] of byPrefix) {
        const supplier = suppliers.rows[SUPPLIER_FOR_PREFIX[prefix] ?? 0] ?? suppliers.rows[0]
        if (supplier === undefined) continue

        attempt(
          await USE_CASES.create_purchase_order.execute(
            {
              supplierId: supplier.id,
              issuedOn: today,
              notes: 'Drafted by the agent from the products below minimum.',
              items: group.map((alert) => {
                const seeded = SEED_PRODUCTS.find((candidate) => candidate.sku === alert.sku)
                return {
                  productId: alert.productId,
                  quantity: parseQuantity(Number(alert.shortfall) / 1000 + 10),
                  unitCost: parseCost(seeded?.cost ?? 10),
                }
              }),
            },
            context,
          ),
        )
      }
    },
    { now: instantFor(today) },
  )
}

async function seedNorthwind(
  database: ReturnType<typeof createDatabase>,
  tenant: SeededTenant,
  today: BusinessDate,
): Promise<void> {
  console.log('Creating the second tenant used by the isolation tests...')
  await withUnitOfWork(
    database.db,
    tenant.session,
    async (context) => {
      expect(
        await USE_CASES.create_product.execute(
          {
            sku: parseSku('NWD-0001'),
            name: 'Northwind widget',
            unit: 'unit',
            salePrice: parsePrice(10),
            minimumStock: parseQuantity(1),
          },
          context,
        ),
        'creating the Northwind product',
      )
    },
    { now: instantFor(today) },
  )
}

await main()
