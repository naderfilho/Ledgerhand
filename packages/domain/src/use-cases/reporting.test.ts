import { ZERO_MONEY } from '../kit/index.js'
import { beforeEach, describe, expect, it } from 'vitest'
import { formatMoney } from '../kit/money.js'
import { unwrap } from '../kit/result.js'
import { cancelFiscalDocument, fiscalDocumentLabel, formatFiscalNumber } from '../model/fiscal.js'
import {
  aCustomer,
  anOpenCashSession,
  aProduct,
  aReceivable,
  brl,
  cost,
  createTestHarness,
  price,
  qty,
  someDate,
  type TestHarness,
} from '../testing/index.js'
import { USE_CASES } from './registry.js'

let harness: TestHarness

beforeEach(() => {
  harness = createTestHarness()
})

const context = (): TestHarness['context'] => harness.context

describe('get_current_context', () => {
  it('tells the caller what today is, so a model never has to guess', async () => {
    const result = unwrap(await USE_CASES.get_current_context.execute({}, context()))

    expect(result.today).toBe('2026-03-16')
    expect(result.timeZone).toBe('America/Sao_Paulo')
    expect(result.currency).toBe('BRL')
    expect(result.role).toBe('admin')
    expect(result.cashSessionStatus).toBe('not_opened')
  })

  it('reports whether the day is already open', async () => {
    anOpenCashSession(harness)
    const result = unwrap(await USE_CASES.get_current_context.execute({}, context()))
    expect(result.cashSessionStatus).toBe('open')
  })

  it('names the agent when one is acting on a user behalf', async () => {
    const agentHarness = createTestHarness({
      actor: {
        kind: 'agent',
        userId: harness.context.userId,
        agentRunId: '33333333-3333-4333-8333-333333333333' as never,
      },
    })
    const result = unwrap(await USE_CASES.get_current_context.execute({}, agentHarness.context))
    expect(result.actor).toBe('agent')
  })
})

describe('report_stock_position', () => {
  it('values the whole inventory and flags what is under its minimum', async () => {
    aProduct(harness, { sku: 'A-1', onHand: qty(10), averageCost: cost(5), minimumStock: qty(2) })
    aProduct(harness, { sku: 'B-1', onHand: qty(1), averageCost: cost(20), minimumStock: qty(5) })

    const report = unwrap(
      await USE_CASES.report_stock_position.execute(
        { belowMinimumOnly: false, limit: 200 },
        context(),
      ),
    )

    expect(report.productCount).toBe(2)
    expect(formatMoney(report.totalValue)).toBe('70.00')
    expect(report.rows.filter((row) => row.belowMinimum)).toHaveLength(1)
  })

  it('narrows to what needs buying when asked', async () => {
    aProduct(harness, { sku: 'A-2', onHand: qty(10), averageCost: cost(5), minimumStock: qty(2) })
    aProduct(harness, { sku: 'B-2', onHand: qty(1), averageCost: cost(20), minimumStock: qty(5) })

    const report = unwrap(
      await USE_CASES.report_stock_position.execute(
        { belowMinimumOnly: true, limit: 200 },
        context(),
      ),
    )

    expect(report.rows).toHaveLength(1)
    expect(report.rows[0]?.product.sku).toBe('B-2')
  })
})

describe('report_overdue_titles', () => {
  it('separates what is owed to us from what we owe, with both totals', async () => {
    const customer = aCustomer(harness)
    aReceivable(harness, {
      customerId: customer.id,
      amount: brl('150.00'),
      dueDate: someDate('2026-03-01'),
    })
    aReceivable(harness, {
      customerId: customer.id,
      amount: brl('90.00'),
      dueDate: someDate('2026-03-10'),
    })
    // Not yet due: must not appear.
    aReceivable(harness, {
      customerId: customer.id,
      amount: brl('500.00'),
      dueDate: someDate('2026-04-01'),
    })

    const report = unwrap(await USE_CASES.report_overdue_titles.execute({ limit: 100 }, context()))

    expect(report.asOf).toBe('2026-03-16')
    expect(report.receivables).toHaveLength(2)
    expect(formatMoney(report.totalReceivable)).toBe('240.00')
    expect(formatMoney(report.totalPayable)).toBe('0.00')
  })

  it('counts only what is still outstanding on a partly paid title', async () => {
    const customer = aCustomer(harness)
    aReceivable(harness, {
      customerId: customer.id,
      amount: brl('100.00'),
      settledAmount: brl('30.00'),
      dueDate: someDate('2026-03-01'),
    })

    const report = unwrap(await USE_CASES.report_overdue_titles.execute({ limit: 100 }, context()))
    expect(formatMoney(report.totalReceivable)).toBe('70.00')
  })
})

describe('report_sales_by_period and report_cash_flow', () => {
  it('aggregates invoiced orders and defaults the range to the last 30 days', async () => {
    const customer = aCustomer(harness)
    const product = aProduct(harness, {
      onHand: qty(50),
      averageCost: cost(10),
      salePrice: price(25),
    })
    const order = unwrap(
      await USE_CASES.create_sales_order.execute(
        {
          customerId: customer.id,
          instalments: 1,
          items: [{ productId: product.id, quantity: qty(4) }],
        },
        context(),
      ),
    )
    unwrap(await USE_CASES.confirm_sales_order.execute({ orderId: order.id }, context()))
    unwrap(
      await USE_CASES.invoice_sales_order.execute({ orderId: order.id, series: 'A' }, context()),
    )

    const report = unwrap(
      await USE_CASES.report_sales_by_period.execute({ granularity: 'day' }, context()),
    )

    expect(report.from).toBe('2026-02-14')
    expect(report.to).toBe('2026-03-16')
    expect(report.rows).toHaveLength(1)
    expect(report.rows[0]?.orderCount).toBe(1)
    expect(formatMoney(report.rows[0]?.net ?? ZERO_MONEY)).toBe('100.00')
  })

  it('rejects a range that runs backwards', async () => {
    const bad = await USE_CASES.report_cash_flow.descriptor.run(
      { from: '2026-03-20', to: '2026-03-01' },
      context(),
    )
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error.message).toContain('must not be after')
  })

  it('lists one row per day of cash, open or closed', async () => {
    anOpenCashSession(harness, {
      businessDate: someDate('2026-03-15'),
      openingBalance: brl('10.00'),
    })
    unwrap(
      await USE_CASES.close_daily_cash.execute({ businessDate: someDate('2026-03-15') }, context()),
    )
    anOpenCashSession(harness, {
      businessDate: someDate('2026-03-16'),
      openingBalance: brl('10.00'),
    })

    const report = unwrap(
      await USE_CASES.report_cash_flow.execute(
        { from: someDate('2026-03-01'), to: someDate('2026-03-31') },
        context(),
      ),
    )

    expect(report.rows).toHaveLength(2)
    expect(report.rows[0]?.status).toBe('closed')
    expect(report.rows[1]?.status).toBe('open')
  })
})

describe('fiscal document helpers', () => {
  it('pads the sequential number to six digits', () => {
    expect(formatFiscalNumber(1)).toBe('000001')
    expect(formatFiscalNumber(123456)).toBe('123456')
  })

  it('labels a document by series and number', async () => {
    const customer = aCustomer(harness)
    const product = aProduct(harness, {
      onHand: qty(5),
      averageCost: cost(1),
      salePrice: price(10),
    })
    const order = unwrap(
      await USE_CASES.create_sales_order.execute(
        {
          customerId: customer.id,
          instalments: 1,
          items: [{ productId: product.id, quantity: qty(1) }],
        },
        context(),
      ),
    )
    unwrap(await USE_CASES.confirm_sales_order.execute({ orderId: order.id }, context()))
    const invoiced = unwrap(
      await USE_CASES.invoice_sales_order.execute({ orderId: order.id, series: 'A' }, context()),
    )

    expect(fiscalDocumentLabel(invoiced.document)).toBe('A-000001')

    const cancelled = cancelFiscalDocument(invoiced.document, 'Wrong customer', harness.context.now)
    expect(cancelled.ok && cancelled.value.status).toBe('cancelled')
    if (cancelled.ok) {
      expect(cancelFiscalDocument(cancelled.value, 'Again', harness.context.now).ok).toBe(false)
    }
  })
})
