import { beforeEach, describe, expect, it } from 'vitest'
import { formatMoney, moneyFromCents } from '../kit/money.js'
import { unwrap } from '../kit/result.js'
import {
  aCustomer,
  anOpenCashSession,
  aReceivable,
  brl,
  createTestHarness,
  someDate,
  type TestHarness,
} from '../testing/index.js'
import { USE_CASES } from './registry.js'

let harness: TestHarness

beforeEach(() => {
  harness = createTestHarness()
})

const context = (): TestHarness['context'] => harness.context

describe('settle_receivable', () => {
  it('refuses to post to a day that was never opened, and says what to do', async () => {
    const customer = aCustomer(harness)
    const receivable = aReceivable(harness, { customerId: customer.id, amount: brl('100.00') })

    const settled = await USE_CASES.settle_receivable.execute(
      { receivableId: receivable.id, method: 'pix' },
      context(),
    )

    expect(settled.ok).toBe(false)
    if (!settled.ok) {
      expect(settled.error.code).toBe('CASH_SESSION_NOT_OPEN')
      expect(settled.error.message).toContain('Open the day')
    }
  })

  it('settles the full outstanding balance by default and books the inflow', async () => {
    const session = anOpenCashSession(harness, { openingBalance: brl('50.00') })
    const customer = aCustomer(harness)
    const receivable = aReceivable(harness, { customerId: customer.id, amount: brl('320.00') })

    const settled = unwrap(
      await USE_CASES.settle_receivable.execute(
        { receivableId: receivable.id, method: 'pix' },
        context(),
      ),
    )

    expect(settled.title.status).toBe('settled')
    expect(formatMoney(settled.session.inflow)).toBe('320.00')
    expect(harness.db.cashSessions.get(session.id)?.inflow).toBe(brl('320.00'))
    expect(harness.events.typesRecorded()).toContain('receivable.settled')
  })

  it('accepts a partial payment and keeps the rest outstanding', async () => {
    anOpenCashSession(harness)
    const customer = aCustomer(harness)
    const receivable = aReceivable(harness, { customerId: customer.id, amount: brl('100.00') })

    const settled = unwrap(
      await USE_CASES.settle_receivable.execute(
        { receivableId: receivable.id, amount: brl('40.00'), method: 'cash' },
        context(),
      ),
    )

    expect(settled.title.status).toBe('partially_settled')
    expect(formatMoney(harness.outstandingOf(settled.title))).toBe('60.00')
  })

  it('refuses to receive more than is owed, quoting the outstanding figure', async () => {
    anOpenCashSession(harness)
    const customer = aCustomer(harness)
    const receivable = aReceivable(harness, { customerId: customer.id, amount: brl('100.00') })

    const settled = await USE_CASES.settle_receivable.execute(
      { receivableId: receivable.id, amount: brl('150.00'), method: 'cash' },
      context(),
    )

    expect(settled.ok).toBe(false)
    if (!settled.ok) {
      expect(settled.error.code).toBe('OVER_SETTLEMENT')
      expect(settled.error.details).toMatchObject({ outstanding: '100.00' })
    }
  })

  it('refuses to settle a title twice', async () => {
    anOpenCashSession(harness)
    const customer = aCustomer(harness)
    const receivable = aReceivable(harness, { customerId: customer.id, amount: brl('80.00') })

    unwrap(
      await USE_CASES.settle_receivable.execute(
        { receivableId: receivable.id, method: 'cash' },
        context(),
      ),
    )
    const again = await USE_CASES.settle_receivable.execute(
      { receivableId: receivable.id, method: 'cash' },
      context(),
    )

    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.error.code).toBe('TITLE_ALREADY_SETTLED')
  })
})

describe('reverse_settlement', () => {
  it('restores the outstanding balance and keeps the original settlement on file', async () => {
    anOpenCashSession(harness)
    const customer = aCustomer(harness)
    const receivable = aReceivable(harness, { customerId: customer.id, amount: brl('200.00') })
    const settled = unwrap(
      await USE_CASES.settle_receivable.execute(
        { receivableId: receivable.id, method: 'cheque' },
        context(),
      ),
    )

    unwrap(
      await USE_CASES.reverse_settlement.execute(
        { settlementId: settled.settlement.id, reason: 'Cheque bounced' },
        context(),
      ),
    )

    const title = harness.db.receivables.get(receivable.id)
    expect(title?.status).toBe('open')
    expect(formatMoney(title?.settledAmount ?? moneyFromCents(0n))).toBe('0.00')

    const stored = harness.db.settlements.get(settled.settlement.id)
    expect(stored?.reversedAt).not.toBeNull()
    expect(stored?.reversalReason).toBe('Cheque bounced')
    expect(harness.events.typesRecorded()).toContain('settlement.reversed')
  })

  it('refuses to rewrite a day that has already been closed and reported', async () => {
    anOpenCashSession(harness)
    const customer = aCustomer(harness)
    const receivable = aReceivable(harness, { customerId: customer.id, amount: brl('90.00') })
    const settled = unwrap(
      await USE_CASES.settle_receivable.execute(
        { receivableId: receivable.id, method: 'cash' },
        context(),
      ),
    )
    unwrap(await USE_CASES.close_daily_cash.execute({}, context()))

    const reversed = await USE_CASES.reverse_settlement.execute(
      { settlementId: settled.settlement.id, reason: 'Posted to the wrong customer' },
      context(),
    )

    expect(reversed.ok).toBe(false)
    if (!reversed.ok) expect(reversed.error.code).toBe('CASH_SESSION_ALREADY_CLOSED')
  })
})

describe('close_daily_cash', () => {
  it('refuses to close over unsettled titles without a justification', async () => {
    anOpenCashSession(harness)
    const customer = aCustomer(harness)
    aReceivable(harness, { customerId: customer.id, amount: brl('75.00'), dueDate: harness.today })

    const closed = await USE_CASES.close_daily_cash.execute({}, context())

    expect(closed.ok).toBe(false)
    if (!closed.ok) {
      expect(closed.error.code).toBe('OPEN_TITLES_REQUIRE_JUSTIFICATION')
      expect(closed.error.message).toContain('1 title(s)')
    }
  })

  it('closes with a justification and records both the count and the reason', async () => {
    anOpenCashSession(harness, { openingBalance: brl('100.00') })
    const customer = aCustomer(harness)
    aReceivable(harness, { customerId: customer.id, amount: brl('75.00'), dueDate: harness.today })

    const closed = unwrap(
      await USE_CASES.close_daily_cash.execute(
        { justification: 'Customer promised payment for tomorrow morning' },
        context(),
      ),
    )

    expect(closed.status).toBe('closed')
    expect(closed.unsettledTitles).toBe(1)
    expect(closed.justification).toBe('Customer promised payment for tomorrow morning')
    expect(formatMoney(closed.closingBalance ?? moneyFromCents(0n))).toBe('100.00')
  })

  it('reports the difference against a physical count', async () => {
    anOpenCashSession(harness, { openingBalance: brl('100.00') })

    const closed = unwrap(
      await USE_CASES.close_daily_cash.execute({ countedBalance: brl('98.50') }, context()),
    )

    expect(formatMoney(closed.difference ?? moneyFromCents(0n))).toBe('-1.50')
  })

  it('freezes the day: no settlement can be posted to it afterwards', async () => {
    anOpenCashSession(harness)
    const customer = aCustomer(harness)
    const receivable = aReceivable(harness, {
      customerId: customer.id,
      amount: brl('60.00'),
      dueDate: someDate('2026-04-30'),
    })
    unwrap(await USE_CASES.close_daily_cash.execute({}, context()))

    const settled = await USE_CASES.settle_receivable.execute(
      { receivableId: receivable.id, method: 'cash' },
      context(),
    )

    expect(settled.ok).toBe(false)
    if (!settled.ok) expect(settled.error.code).toBe('CASH_SESSION_ALREADY_CLOSED')
  })

  it('refuses to close the same day twice', async () => {
    anOpenCashSession(harness)
    unwrap(await USE_CASES.close_daily_cash.execute({}, context()))
    const again = await USE_CASES.close_daily_cash.execute({}, context())
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.error.code).toBe('CASH_SESSION_ALREADY_CLOSED')
  })

  it('previews the closing figures, including the warning about open titles', async () => {
    anOpenCashSession(harness, { openingBalance: brl('250.00') })
    const customer = aCustomer(harness)
    aReceivable(harness, { customerId: customer.id, amount: brl('75.00'), dueDate: harness.today })

    const preview = await USE_CASES.close_daily_cash.descriptor.preview?.({}, context())
    expect(preview?.ok).toBe(true)
    if (preview?.ok !== true) return
    expect(preview.value).toContain('opening 250.00')
    expect(preview.value).toContain('1 title(s) due today are still unsettled')
    expect(preview.value).toContain('a justification is required')
  })
})

describe('open_cash_session', () => {
  it('carries the opening balance over from the last day that was closed', async () => {
    anOpenCashSession(harness, {
      businessDate: someDate('2026-03-15'),
      openingBalance: brl('40.00'),
    })
    unwrap(
      await USE_CASES.close_daily_cash.execute({ businessDate: someDate('2026-03-15') }, context()),
    )

    const opened = unwrap(await USE_CASES.open_cash_session.execute({}, context()))
    expect(formatMoney(opened.openingBalance)).toBe('40.00')
  })

  it('refuses to open a day twice', async () => {
    anOpenCashSession(harness)
    const opened = await USE_CASES.open_cash_session.execute({}, context())
    expect(opened.ok).toBe(false)
    if (!opened.ok) expect(opened.error.code).toBe('CASH_SESSION_ALREADY_OPEN')
  })

  it('refuses to reopen a closed day', async () => {
    anOpenCashSession(harness)
    unwrap(await USE_CASES.close_daily_cash.execute({}, context()))
    const reopened = await USE_CASES.open_cash_session.execute({}, context())
    expect(reopened.ok).toBe(false)
    if (!reopened.ok) expect(reopened.error.code).toBe('CASH_SESSION_ALREADY_CLOSED')
  })
})
