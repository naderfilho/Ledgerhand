import {
  formatMoney,
  formatQuantity,
  formatUnitValue,
  sumMoney,
  ZERO_QUANTITY,
  ZERO_UNIT_COST,
  unwrap,
  USE_CASES,
  type ExecutionContext,
} from '@ledgerhand/domain'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { domainEvents, fiscalDocuments } from '../schema/index.js'
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
 * The domain is covered by fast in-memory tests. What these check is the part
 * the in-memory store cannot: that the SQL adapters preserve the exact same
 * values and the same behaviour a real transaction imposes.
 */

const available = await postgresIsAvailable()

describe.skipIf(!available)('persistence through the SQL adapters', () => {
  let context: IntegrationContext
  let tenant: IntegrationTenant

  const run = async <T>(handler: (execution: ExecutionContext) => Promise<T>): Promise<T> =>
    await withUnitOfWork(context.app.db, tenant.session, handler, { now: FIXED_NOW })

  beforeAll(async () => {
    context = await startIntegration()
    tenant = await createTenant(context, 'Persistence')
  })

  afterAll(async () => {
    await context.close()
  })

  it('round-trips money, quantity and per-unit values without losing a digit', async () => {
    const product = await run(async (execution) =>
      unwrap(
        await USE_CASES.create_product.descriptor.run(
          {
            sku: 'ROUND-1',
            name: 'Rounding probe',
            unit: 'kg',
            salePrice: '19.999999',
            minimumStock: '0.001',
          },
          execution,
        ),
      ),
    )

    const reloaded = await run(async (execution) =>
      unwrap(
        await USE_CASES.get_product.execute(
          { productId: (product as { id: string }).id },
          execution,
        ),
      ),
    )

    expect(formatUnitValue(reloaded.product.salePrice)).toBe('19.999999')
    expect(formatQuantity(reloaded.product.minimumStock)).toBe('0.001')
  })

  it('keeps the weighted average cost identical to the in-memory calculation', async () => {
    const productId = await run(async (execution) => {
      const created = unwrap(
        await USE_CASES.create_product.descriptor.run(
          { sku: 'WAC-1', name: 'Average probe', salePrice: '30.00' },
          execution,
        ),
      ) as { id: string }

      unwrap(
        await USE_CASES.register_stock_entry.descriptor.run(
          { productId: created.id, quantity: 3, unitCost: '10.00' },
          execution,
        ),
      )
      return created.id
    })

    await run(async (execution) => {
      unwrap(
        await USE_CASES.register_stock_entry.descriptor.run(
          { productId, quantity: 7, unitCost: '17.50' },
          execution,
        ),
      )
    })

    const position = await run(async (execution) =>
      unwrap(await USE_CASES.get_stock_position.execute({ productId, limit: 1 }, execution)),
    )

    // (3 * 10.00 + 7 * 17.50) / 10 = 15.25
    expect(formatQuantity(position[0]?.balance.onHand ?? ZERO_QUANTITY)).toBe('10')
    expect(formatUnitValue(position[0]?.balance.averageCost ?? ZERO_UNIT_COST)).toBe('15.25')
  })

  it('runs the full sell-invoice-settle flow and leaves the books balanced', async () => {
    const setup = await run(async (execution) => {
      const customer = unwrap(
        await USE_CASES.create_customer.descriptor.run(
          { name: 'Flow customer', paymentTermDays: 30 },
          execution,
        ),
      ) as { id: string }
      const product = unwrap(
        await USE_CASES.create_product.descriptor.run(
          { sku: 'FLOW-1', name: 'Flow product', salePrice: '25.00' },
          execution,
        ),
      ) as { id: string }
      unwrap(
        await USE_CASES.register_stock_entry.descriptor.run(
          { productId: product.id, quantity: 100, unitCost: '12.00' },
          execution,
        ),
      )
      return { customerId: customer.id, productId: product.id }
    })

    const order = (await run(async (execution) =>
      unwrap(
        await USE_CASES.create_sales_order.descriptor.run(
          {
            customerId: setup.customerId,
            instalments: 3,
            items: [{ productId: setup.productId, quantity: 7 }],
          },
          execution,
        ),
      ),
    )) as { id: string; number: string }

    await run(async (execution) => {
      unwrap(await USE_CASES.confirm_sales_order.execute({ orderId: order.id }, execution))
    })

    const invoiced = await run(async (execution) =>
      unwrap(
        await USE_CASES.invoice_sales_order.execute({ orderId: order.id, series: 'A' }, execution),
      ),
    )

    // Sum of the instalments equals the order total, through the database.
    expect(sumMoney(invoiced.receivables.map((title) => title.amount))).toBe(invoiced.order.total)
    expect(formatMoney(invoiced.order.total)).toBe('175.00')
    expect(invoiced.receivables).toHaveLength(3)
    expect(invoiced.receivables.map((title) => formatMoney(title.amount))).toEqual([
      '58.34',
      '58.33',
      '58.33',
    ])

    const stock = await run(async (execution) =>
      unwrap(
        await USE_CASES.get_stock_position.execute(
          { productId: setup.productId, limit: 1 },
          execution,
        ),
      ),
    )
    expect(formatQuantity(stock[0]?.balance.onHand ?? ZERO_QUANTITY)).toBe('93')
    expect(formatQuantity(stock[0]?.balance.reserved ?? ZERO_QUANTITY)).toBe('0')

    const settled = await run(async (execution) => {
      unwrap(await USE_CASES.open_cash_session.execute({}, execution))
      const first = invoiced.receivables[0]
      if (first === undefined) throw new Error('expected a receivable')
      return unwrap(
        await USE_CASES.settle_receivable.execute(
          { receivableId: first.id, method: 'pix' },
          execution,
        ),
      )
    })

    expect(formatMoney(settled.session.inflow)).toBe('58.34')
  })

  it('writes the domain events in the same transaction as the change', async () => {
    const rows = await context.admin.db
      .select({ type: domainEvents.type })
      .from(domainEvents)
      .where(eq(domainEvents.tenantId, tenant.tenantId))

    const types = rows.map((row) => row.type)
    expect(types).toContain('sales_order.invoiced')
    expect(types).toContain('receivable.created')
    expect(types).toContain('stock.entry_registered')
    expect(types).toContain('receivable.settled')
  })

  it('rolls the whole transaction back when the handler throws', async () => {
    const before = await context.admin.db
      .select({ value: sql<string>`count(*)` })
      .from(domainEvents)
      .where(eq(domainEvents.tenantId, tenant.tenantId))

    await expect(
      run(async (execution) => {
        unwrap(
          await USE_CASES.create_product.descriptor.run(
            { sku: 'ROLLBACK-1', name: 'Never committed', salePrice: '1.00' },
            execution,
          ),
        )
        throw new Error('deliberate failure after a successful write')
      }),
    ).rejects.toThrow('deliberate failure')

    const after = await context.admin.db
      .select({ value: sql<string>`count(*)` })
      .from(domainEvents)
      .where(eq(domainEvents.tenantId, tenant.tenantId))

    expect(after[0]?.value).toBe(before[0]?.value)

    const found = await run(
      async (execution) =>
        unwrap(
          await USE_CASES.list_products.execute(
            { search: 'ROLLBACK-1', activeOnly: true },
            execution,
          ),
        ).rows,
    )
    expect(found).toHaveLength(0)
  })

  /**
   * Fiscal numbering is the reason the sequence is a locked row rather than a
   * Postgres SEQUENCE: a rolled back invoice must not burn a number.
   */
  it('never issues a duplicate fiscal number and never leaves a gap', async () => {
    const setup = await run(async (execution) => {
      const customer = unwrap(
        await USE_CASES.create_customer.descriptor.run({ name: 'Series customer' }, execution),
      ) as { id: string }
      const product = unwrap(
        await USE_CASES.create_product.descriptor.run(
          { sku: 'SERIES-1', name: 'Series product', salePrice: '5.00' },
          execution,
        ),
      ) as { id: string }
      unwrap(
        await USE_CASES.register_stock_entry.descriptor.run(
          { productId: product.id, quantity: 50, unitCost: '2.00' },
          execution,
        ),
      )
      return { customerId: customer.id, productId: product.id }
    })

    for (let index = 0; index < 3; index += 1) {
      await run(async (execution) => {
        const created = unwrap(
          await USE_CASES.create_sales_order.descriptor.run(
            {
              customerId: setup.customerId,
              items: [{ productId: setup.productId, quantity: 1 }],
            },
            execution,
          ),
        ) as { id: string }
        unwrap(await USE_CASES.confirm_sales_order.execute({ orderId: created.id }, execution))
        unwrap(
          await USE_CASES.invoice_sales_order.execute(
            { orderId: created.id, series: 'B' },
            execution,
          ),
        )
      })
    }

    const issued = await context.admin.db
      .select({ number: fiscalDocuments.number })
      .from(fiscalDocuments)
      .where(eq(fiscalDocuments.series, 'B'))

    expect(issued.map((row) => row.number).sort()).toEqual(['000001', '000002', '000003'])
  })
})

describe.skipIf(available)('persistence (skipped)', () => {
  it.skip(SKIP_MESSAGE, () => undefined)
})
