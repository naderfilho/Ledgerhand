import { z } from 'zod'
import { businessDateSchema, type BusinessDate } from '../kit/business-date.js'
import { today, type ExecutionContext } from '../context/execution-context.js'
import { domainEvent } from '../events/domain-event.js'
import { domainError, notFound, type DomainError } from '../kit/errors.js'
import {
  asId,
  type CashSessionId,
  type PayableId,
  type ReceivableId,
  type SettlementId,
} from '../kit/ids.js'
import {
  formatMoney,
  nonNegativeMoneySchema,
  positiveMoneySchema,
  ZERO_MONEY,
} from '../kit/money.js'
import { err, ok, type Result } from '../kit/result.js'
import {
  closeCashSession as closeCashSessionState,
  expectedClosingBalance,
  registerCashFlow,
  rejectReopen,
  requireOpenSession,
  type CashSession,
} from '../model/cash.js'
import {
  applySettlement,
  outstandingAmount,
  reverseSettlement as reverseSettlementState,
  SETTLEMENT_METHODS,
  TITLE_STATUSES,
  type Payable,
  type Receivable,
  type Settlement,
  type Title,
} from '../model/finance.js'
import { defineUseCase } from './definition.js'

/**
 * Every settlement lands in the cash session of the day it is dated. That is
 * what gives `close_daily_cash` something to close, and it is also what makes
 * a closed day immutable: with no open session, a settlement dated to that day
 * is refused instead of quietly rewriting a reported balance.
 */
async function openSessionFor(
  context: ExecutionContext,
  businessDate: BusinessDate,
): Promise<Result<CashSession, DomainError>> {
  const session = await context.uow.cash.findByDate(businessDate)
  return requireOpenSession(session, businessDate)
}

const settleInputSchema = z.object({
  amount: positiveMoneySchema.optional(),
  method: z.enum(SETTLEMENT_METHODS).default('bank_transfer'),
  settledOn: businessDateSchema.optional(),
  note: z.string().trim().max(500).nullish(),
})

async function settleTitle<T extends Title>(
  context: ExecutionContext,
  title: T,
  input: z.output<typeof settleInputSchema>,
  direction: 'inflow' | 'outflow',
): Promise<Result<{ title: T; settlement: Settlement; session: CashSession }, DomainError>> {
  const settledOn = input.settledOn ?? today(context)
  const session = await openSessionFor(context, settledOn)
  if (!session.ok) return session

  const amount = input.amount ?? outstandingAmount(title)
  const applied = applySettlement(title, amount, context.now)
  if (!applied.ok) return applied

  const settlement: Settlement = {
    id: asId<SettlementId>(context.uow.ids.next()),
    tenantId: context.tenantId,
    titleKind: title.kind,
    titleId: title.id,
    amount,
    settledOn,
    method: input.method,
    note: input.note ?? null,
    reversedAt: null,
    reversalReason: null,
    createdAt: context.now,
  }

  const updatedSession = registerCashFlow(
    session.value,
    direction === 'inflow' ? amount : ZERO_MONEY,
    direction === 'outflow' ? amount : ZERO_MONEY,
  )

  await context.uow.finance.appendSettlement(settlement)
  await context.uow.cash.save(updatedSession)

  return ok({ title: applied.value.title, settlement, session: updatedSession })
}

export const settleReceivable = defineUseCase({
  name: 'settle_receivable',
  title: 'Settle receivable',
  summary:
    'Records a payment received against a receivable and posts it to the day cash session, which must be open. The amount defaults to the full outstanding balance; partial payments are allowed, paying more than is owed is not. Classified destructive because it moves money and can only be undone with reverse_settlement, which stays on the audit trail.',
  capability: 'finance:settle',
  risk: 'destructive',
  inputSchema: settleInputSchema.extend({ receivableId: z.uuid() }),
  execute: async (input, context) => {
    const receivable = await context.uow.finance.findReceivable(
      asId<ReceivableId>(input.receivableId),
    )
    if (receivable === null) return err(notFound('Receivable', input.receivableId))

    const settled = await settleTitle(context, receivable, input, 'inflow')
    if (!settled.ok) return settled

    await context.uow.finance.saveReceivable(settled.value.title)
    context.uow.events.record(
      domainEvent('receivable.settled', 'receivable', settled.value.title.id, {
        receivableId: settled.value.title.id,
        settlementId: settled.value.settlement.id,
        amount: formatMoney(settled.value.settlement.amount),
        outstandingAfter: formatMoney(outstandingAmount(settled.value.title)),
        method: settled.value.settlement.method,
        settledOn: settled.value.settlement.settledOn,
      }),
    )

    return ok(settled.value)
  },
  preview: async (input, context) => {
    const receivable = await context.uow.finance.findReceivable(
      asId<ReceivableId>(input.receivableId),
    )
    if (receivable === null) return err(notFound('Receivable', input.receivableId))
    const customer = await context.uow.customers.findById(receivable.customerId)
    const amount = input.amount ?? outstandingAmount(receivable)
    const remaining = (outstandingAmount(receivable) - amount) as typeof amount
    return ok(
      `Receive ${formatMoney(amount)} from ${customer?.name ?? 'unknown customer'} against "${receivable.description}" (due ${receivable.dueDate}, ${formatMoney(outstandingAmount(receivable))} outstanding) by ${input.method}. ${remaining === 0n ? 'The title will be settled in full.' : `${formatMoney(remaining)} would remain outstanding.`}`,
    )
  },
})

export const settlePayable = defineUseCase({
  name: 'settle_payable',
  title: 'Settle payable',
  summary:
    'Records a payment made against a payable and posts it to the day cash session, which must be open. The amount defaults to the full outstanding balance. Classified destructive because it moves money out.',
  capability: 'finance:settle',
  risk: 'destructive',
  inputSchema: settleInputSchema.extend({ payableId: z.uuid() }),
  execute: async (input, context) => {
    const payable = await context.uow.finance.findPayable(asId<PayableId>(input.payableId))
    if (payable === null) return err(notFound('Payable', input.payableId))

    const settled = await settleTitle(context, payable, input, 'outflow')
    if (!settled.ok) return settled

    await context.uow.finance.savePayable(settled.value.title)
    context.uow.events.record(
      domainEvent('payable.settled', 'payable', settled.value.title.id, {
        payableId: settled.value.title.id,
        settlementId: settled.value.settlement.id,
        amount: formatMoney(settled.value.settlement.amount),
        outstandingAfter: formatMoney(outstandingAmount(settled.value.title)),
        method: settled.value.settlement.method,
        settledOn: settled.value.settlement.settledOn,
      }),
    )

    return ok(settled.value)
  },
  preview: async (input, context) => {
    const payable = await context.uow.finance.findPayable(asId<PayableId>(input.payableId))
    if (payable === null) return err(notFound('Payable', input.payableId))
    const supplier = await context.uow.suppliers.findById(payable.supplierId)
    const amount = input.amount ?? outstandingAmount(payable)
    return ok(
      `Pay ${formatMoney(amount)} to ${supplier?.name ?? 'unknown supplier'} against "${payable.description}" (due ${payable.dueDate}) by ${input.method}. Cash for ${input.settledOn ?? 'today'} decreases by that amount.`,
    )
  },
})

export const reverseSettlement = defineUseCase({
  name: 'reverse_settlement',
  title: 'Reverse settlement',
  summary:
    'Backs a payment out of a title -- a bounced cheque, a duplicated entry. The original settlement is kept and marked reversed rather than deleted. Refused when the cash session of the settlement date is already closed, because a reported closing balance may not be rewritten; post a correction to the current day instead.',
  capability: 'finance:reverse',
  risk: 'destructive',
  inputSchema: z.object({
    settlementId: z.uuid(),
    reason: z.string().trim().min(3, 'Explain why the settlement is being reversed.').max(500),
  }),
  execute: async (input, context) => {
    const settlement = await context.uow.finance.findSettlement(
      asId<SettlementId>(input.settlementId),
    )
    if (settlement === null) return err(notFound('Settlement', input.settlementId))

    const session = await openSessionFor(context, settlement.settledOn)
    if (!session.ok) return session

    if (settlement.titleKind === 'receivable') {
      const title = await context.uow.finance.findReceivable(asId<ReceivableId>(settlement.titleId))
      if (title === null) return err(notFound('Receivable', settlement.titleId))
      const reversed = reverseSettlementState(title, settlement, input.reason, context.now)
      if (!reversed.ok) return reversed
      await context.uow.finance.saveReceivable(reversed.value.title)
      await context.uow.finance.saveSettlement(reversed.value.settlement)
      await context.uow.cash.save(registerCashFlow(session.value, ZERO_MONEY, settlement.amount))
    } else {
      const title = await context.uow.finance.findPayable(asId<PayableId>(settlement.titleId))
      if (title === null) return err(notFound('Payable', settlement.titleId))
      const reversed = reverseSettlementState(title, settlement, input.reason, context.now)
      if (!reversed.ok) return reversed
      await context.uow.finance.savePayable(reversed.value.title)
      await context.uow.finance.saveSettlement(reversed.value.settlement)
      await context.uow.cash.save(registerCashFlow(session.value, settlement.amount, ZERO_MONEY))
    }

    context.uow.events.record(
      domainEvent('settlement.reversed', settlement.titleKind, settlement.titleId, {
        settlementId: settlement.id,
        titleKind: settlement.titleKind,
        titleId: settlement.titleId,
        amount: formatMoney(settlement.amount),
        reason: input.reason,
      }),
    )

    return ok({ settlementId: settlement.id, reversed: true })
  },
  preview: async (input, context) => {
    const settlement = await context.uow.finance.findSettlement(
      asId<SettlementId>(input.settlementId),
    )
    if (settlement === null) return err(notFound('Settlement', input.settlementId))
    return ok(
      `Reverse the ${formatMoney(settlement.amount)} ${settlement.titleKind} settlement recorded on ${settlement.settledOn} by ${settlement.method}. The title returns to its outstanding balance and cash for that day is corrected. Reason on record: "${input.reason}".`,
    )
  },
})

export const listReceivables = defineUseCase({
  name: 'list_receivables',
  title: 'List receivables',
  summary:
    'Lists amounts owed by customers. Filter by status, by due date, or pass overdueOnly to get everything past due as of today -- the usual starting point for a collections run.',
  capability: 'finance:read',
  risk: 'read',
  inputSchema: z.object({
    status: z.array(z.enum(TITLE_STATUSES)).optional(),
    dueOn: businessDateSchema.optional(),
    dueBefore: businessDateSchema.optional(),
    overdueOnly: z.boolean().default(false),
    limit: z.number().int().min(1).max(200).default(50),
    offset: z.number().int().min(0).default(0),
  }),
  execute: async (input, context) =>
    ok(
      await context.uow.finance.listReceivables({
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.dueOn === undefined ? {} : { dueOn: input.dueOn }),
        ...(input.dueBefore === undefined ? {} : { dueBefore: input.dueBefore }),
        ...(input.overdueOnly ? { overdueAsOf: today(context) } : {}),
        page: { limit: input.limit, offset: input.offset },
      }),
    ),
})

export const listPayables = defineUseCase({
  name: 'list_payables',
  title: 'List payables',
  summary:
    'Lists amounts owed to suppliers. Filter by status, by due date, or pass overdueOnly to get everything past due as of today.',
  capability: 'finance:read',
  risk: 'read',
  inputSchema: z.object({
    status: z.array(z.enum(TITLE_STATUSES)).optional(),
    dueOn: businessDateSchema.optional(),
    dueBefore: businessDateSchema.optional(),
    overdueOnly: z.boolean().default(false),
    limit: z.number().int().min(1).max(200).default(50),
    offset: z.number().int().min(0).default(0),
  }),
  execute: async (input, context) =>
    ok(
      await context.uow.finance.listPayables({
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.dueOn === undefined ? {} : { dueOn: input.dueOn }),
        ...(input.dueBefore === undefined ? {} : { dueBefore: input.dueBefore }),
        ...(input.overdueOnly ? { overdueAsOf: today(context) } : {}),
        page: { limit: input.limit, offset: input.offset },
      }),
    ),
})

export const openCashSession = defineUseCase({
  name: 'open_cash_session',
  title: 'Open cash session',
  summary:
    'Opens the cash session for a business day so settlements can be posted to it. The opening balance defaults to the closing balance of the last day that was closed. A day can only be opened once and a closed day is never reopened.',
  capability: 'finance:settle',
  risk: 'write',
  inputSchema: z.object({
    businessDate: businessDateSchema.optional(),
    openingBalance: nonNegativeMoneySchema.optional(),
  }),
  execute: async (input, context) => {
    const businessDate = input.businessDate ?? today(context)
    const existing = await context.uow.cash.findByDate(businessDate)
    if (existing !== null) return err(rejectReopen(existing))

    const previous = await context.uow.cash.findLatestClosed(businessDate)
    const session: CashSession = {
      id: asId<CashSessionId>(context.uow.ids.next()),
      tenantId: context.tenantId,
      businessDate,
      status: 'open',
      openingBalance: input.openingBalance ?? previous?.closingBalance ?? ZERO_MONEY,
      inflow: ZERO_MONEY,
      outflow: ZERO_MONEY,
      closingBalance: null,
      countedBalance: null,
      difference: null,
      unsettledTitles: 0,
      justification: null,
      openedAt: context.now,
      openedBy: context.userId,
      closedAt: null,
      closedBy: null,
    }

    await context.uow.cash.save(session)
    context.uow.events.record(
      domainEvent('cash_session.opened', 'cash_session', session.id, {
        sessionId: session.id,
        businessDate: session.businessDate,
        openingBalance: formatMoney(session.openingBalance),
      }),
    )

    return ok(session)
  },
})

export const closeDailyCash = defineUseCase({
  name: 'close_daily_cash',
  title: 'Close daily cash',
  summary:
    'Closes the cash session for a business day and freezes it: after closing, no settlement can be posted to that date. If any title due that day is still unsettled, a justification is required -- the close is not blocked, but the reason goes on the record. Classified destructive because a closed day cannot be reopened.',
  capability: 'finance:close-cash',
  risk: 'destructive',
  inputSchema: z.object({
    businessDate: businessDateSchema.optional(),
    justification: z.string().trim().max(1000).nullish(),
    countedBalance: nonNegativeMoneySchema.nullish(),
  }),
  execute: async (input, context) => {
    const businessDate = input.businessDate ?? today(context)
    const session = await openSessionFor(context, businessDate)
    if (!session.ok) return session

    const unsettledTitles = await context.uow.finance.countUnsettledDueOn(businessDate)
    const closed = closeCashSessionState(
      session.value,
      {
        unsettledTitles,
        justification: input.justification ?? null,
        countedBalance: input.countedBalance ?? null,
        closedBy: context.userId,
      },
      context.now,
    )
    if (!closed.ok) return closed

    await context.uow.cash.save(closed.value)
    context.uow.events.record(
      domainEvent('cash_session.closed', 'cash_session', closed.value.id, {
        sessionId: closed.value.id,
        businessDate: closed.value.businessDate,
        openingBalance: formatMoney(closed.value.openingBalance),
        inflow: formatMoney(closed.value.inflow),
        outflow: formatMoney(closed.value.outflow),
        closingBalance: formatMoney(closed.value.closingBalance ?? ZERO_MONEY),
        unsettledTitles,
        justification: closed.value.justification,
      }),
    )

    return ok(closed.value)
  },
  preview: async (input, context) => {
    const businessDate = input.businessDate ?? today(context)
    const session = await context.uow.cash.findByDate(businessDate)
    if (session === null) {
      return err(
        domainError('CASH_SESSION_NOT_OPEN', `No cash session is open for ${businessDate}.`, {
          businessDate,
        }),
      )
    }
    const unsettled = await context.uow.finance.countUnsettledDueOn(businessDate)
    const closing = formatMoney(expectedClosingBalance(session))
    const warning =
      unsettled > 0
        ? ` ${String(unsettled)} title(s) due today are still unsettled and will be recorded as such${input.justification === undefined || input.justification === null ? ' -- a justification is required' : ` with the justification "${input.justification}"`}.`
        : ''
    return ok(
      `Close cash for ${businessDate}: opening ${formatMoney(session.openingBalance)}, in ${formatMoney(session.inflow)}, out ${formatMoney(session.outflow)}, closing ${closing}. The day is frozen afterwards and cannot be reopened.${warning}`,
    )
  },
})

export const getCashPosition = defineUseCase({
  name: 'get_cash_position',
  title: 'Get cash position',
  summary:
    'Returns the cash session for a business day: opening balance, money in, money out, expected closing balance, whether it is still open, and how many titles due that day remain unsettled.',
  capability: 'finance:read',
  risk: 'read',
  inputSchema: z.object({ businessDate: businessDateSchema.optional() }),
  execute: async (input, context) => {
    const businessDate = input.businessDate ?? today(context)
    const session = await context.uow.cash.findByDate(businessDate)
    const unsettledTitles = await context.uow.finance.countUnsettledDueOn(businessDate)
    return ok({
      businessDate,
      session,
      expectedClosing: session === null ? null : expectedClosingBalance(session),
      unsettledTitles,
    })
  },
})

export type FinanceTitle = Receivable | Payable
