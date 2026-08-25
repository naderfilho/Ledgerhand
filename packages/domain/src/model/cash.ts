import type { BusinessDate } from '../kit/business-date.js'
import { domainError, type DomainError } from '../kit/errors.js'
import type { CashSessionId, TenantId, UserId } from '../kit/ids.js'
import { addMoney, formatMoney, subMoney, type Money } from '../kit/money.js'
import { err, ok, type Result } from '../kit/result.js'

/**
 * ---------------------------------------------------------------------------
 * Daily cash
 * ---------------------------------------------------------------------------
 * One session per tenant per business day. Closing it freezes the day: after
 * the close, settlements dated that day are refused, which is what makes the
 * closing balance mean anything.
 *
 * The rule the brief singles out lives in `closeCashSession`: a day with
 * unsettled titles may still be closed, but only with a justification on the
 * record. Blocking the close outright would just teach users to post fake
 * settlements, which is worse than an honest note explaining the gap.
 */
export const CASH_SESSION_STATUSES = ['open', 'closed'] as const
export type CashSessionStatus = (typeof CASH_SESSION_STATUSES)[number]

export interface CashSession {
  readonly id: CashSessionId
  readonly tenantId: TenantId
  readonly businessDate: BusinessDate
  readonly status: CashSessionStatus
  readonly openingBalance: Money
  readonly inflow: Money
  readonly outflow: Money
  /** Set on close: opening + inflow - outflow. */
  readonly closingBalance: Money | null
  /** What was physically counted, when the operator reports it. */
  readonly countedBalance: Money | null
  readonly difference: Money | null
  readonly unsettledTitles: number
  readonly justification: string | null
  readonly openedAt: Date
  readonly openedBy: UserId
  readonly closedAt: Date | null
  readonly closedBy: UserId | null
}

export function expectedClosingBalance(session: CashSession): Money {
  return subMoney(addMoney(session.openingBalance, session.inflow), session.outflow)
}

export interface CloseCashInput {
  /** Titles dated this business day that are still open. */
  readonly unsettledTitles: number
  readonly justification: string | null
  readonly countedBalance: Money | null
  readonly closedBy: UserId
}

/**
 * A day may only be opened once. Reopening a closed day is refused outright:
 * the closing balance has already been reported, and the correct remedy is an
 * adjustment on the following day.
 */
export function rejectReopen(session: CashSession): DomainError {
  return session.status === 'closed'
    ? domainError(
        'CASH_SESSION_ALREADY_CLOSED',
        `Cash for ${session.businessDate} has already been closed and cannot be reopened. Post a correction to the current day instead.`,
        { businessDate: session.businessDate },
      )
    : domainError(
        'CASH_SESSION_ALREADY_OPEN',
        `Cash for ${session.businessDate} is already open with an opening balance of ${formatMoney(session.openingBalance)}.`,
        { businessDate: session.businessDate },
      )
}

export function closeCashSession(
  session: CashSession,
  input: CloseCashInput,
  at: Date,
): Result<CashSession, DomainError> {
  if (session.status === 'closed') {
    return err(
      domainError(
        'CASH_SESSION_ALREADY_CLOSED',
        `Cash for ${session.businessDate} was already closed at ${session.closedAt?.toISOString() ?? 'an earlier time'}.`,
        { businessDate: session.businessDate },
      ),
    )
  }

  const justification = input.justification?.trim() ?? ''
  if (input.unsettledTitles > 0 && justification.length === 0) {
    return err(
      domainError(
        'OPEN_TITLES_REQUIRE_JUSTIFICATION',
        `${String(input.unsettledTitles)} title(s) due on ${session.businessDate} are still unsettled. Settle them, or close the day with a justification explaining why they were not received.`,
        { businessDate: session.businessDate, unsettledTitles: input.unsettledTitles },
      ),
    )
  }

  const closingBalance = expectedClosingBalance(session)
  const difference =
    input.countedBalance === null ? null : subMoney(input.countedBalance, closingBalance)

  return ok({
    ...session,
    status: 'closed',
    closingBalance,
    countedBalance: input.countedBalance,
    difference,
    unsettledTitles: input.unsettledTitles,
    justification: justification.length > 0 ? justification : null,
    closedAt: at,
    closedBy: input.closedBy,
  })
}

export function requireOpenSession(
  session: CashSession | null,
  businessDate: BusinessDate,
): Result<CashSession, DomainError> {
  if (session === null) {
    return err(
      domainError(
        'CASH_SESSION_NOT_OPEN',
        `No cash session is open for ${businessDate}. Open the day before registering movements.`,
        { businessDate },
      ),
    )
  }
  if (session.status === 'closed') {
    return err(
      domainError(
        'CASH_SESSION_ALREADY_CLOSED',
        `Cash for ${businessDate} is closed. Movements can no longer be posted to that day.`,
        { businessDate },
      ),
    )
  }
  return ok(session)
}

/** Applies a settlement to the running totals of an open day. */
export function registerCashFlow(session: CashSession, inflow: Money, outflow: Money): CashSession {
  return {
    ...session,
    inflow: addMoney(session.inflow, inflow),
    outflow: addMoney(session.outflow, outflow),
  }
}
