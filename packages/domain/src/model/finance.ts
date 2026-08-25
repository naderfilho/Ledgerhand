import { compareBusinessDate, type BusinessDate } from '../kit/business-date.js'
import { domainError, type DomainError } from '../kit/errors.js'
import type {
  CustomerId,
  PayableId,
  PurchaseOrderId,
  ReceivableId,
  SalesOrderId,
  SettlementId,
  SupplierId,
  TenantId,
} from '../kit/ids.js'
import { addMoney, formatMoney, isZeroMoney, subMoney, type Money } from '../kit/money.js'
import { err, ok, type Result } from '../kit/result.js'

/**
 * ---------------------------------------------------------------------------
 * Accounts receivable and payable
 * ---------------------------------------------------------------------------
 * Titles are never created by hand: invoicing a sales order produces
 * receivables, receiving a purchase order produces a payable. That is what
 * makes `sum(receivables) === order.total` an invariant worth property-testing
 * rather than a coincidence.
 *
 * Settlements are append-only. Undoing one is a reversal that stays on the
 * record, because "the money came back" and "the payment never happened" are
 * different facts and an auditor needs to tell them apart.
 */
export const TITLE_KINDS = ['receivable', 'payable'] as const
export type TitleKind = (typeof TITLE_KINDS)[number]

export const TITLE_STATUSES = ['open', 'partially_settled', 'settled', 'cancelled'] as const
export type TitleStatus = (typeof TITLE_STATUSES)[number]

export const SETTLEMENT_METHODS = [
  'cash',
  'bank_transfer',
  'pix',
  'card',
  'cheque',
  'other',
] as const
export type SettlementMethod = (typeof SETTLEMENT_METHODS)[number]

export interface Settlement {
  readonly id: SettlementId
  readonly tenantId: TenantId
  readonly titleKind: TitleKind
  readonly titleId: string
  readonly amount: Money
  readonly settledOn: BusinessDate
  readonly method: SettlementMethod
  readonly note: string | null
  readonly reversedAt: Date | null
  readonly reversalReason: string | null
  readonly createdAt: Date
}

interface TitleFields {
  readonly tenantId: TenantId
  readonly amount: Money
  readonly settledAmount: Money
  readonly issuedOn: BusinessDate
  readonly dueDate: BusinessDate
  readonly status: TitleStatus
  readonly description: string
  /** Which instalment of how many, for titles split at invoicing time. */
  readonly instalment: number
  readonly instalments: number
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface Receivable extends TitleFields {
  readonly id: ReceivableId
  readonly kind: 'receivable'
  readonly customerId: CustomerId
  readonly salesOrderId: SalesOrderId
}

export interface Payable extends TitleFields {
  readonly id: PayableId
  readonly kind: 'payable'
  readonly supplierId: SupplierId
  readonly purchaseOrderId: PurchaseOrderId
}

export type Title = Receivable | Payable

export function outstandingAmount(title: Title): Money {
  return subMoney(title.amount, title.settledAmount)
}

export function isSettled(title: Title): boolean {
  return title.status === 'settled'
}

export function isOverdue(title: Title, today: BusinessDate): boolean {
  return (
    title.status !== 'settled' &&
    title.status !== 'cancelled' &&
    compareBusinessDate(title.dueDate, today) < 0
  )
}

function statusAfter(amount: Money, settledAmount: Money): TitleStatus {
  if (settledAmount >= amount) return 'settled'
  return isZeroMoney(settledAmount) ? 'open' : 'partially_settled'
}

export interface SettlementOutcome<T extends Title> {
  readonly title: T
  readonly outstanding: Money
  readonly fullySettled: boolean
}

/**
 * Records a payment against a title. Partial settlement is normal; paying more
 * than is owed is not, and is refused with the exact figure so the caller (or
 * the model) can retry with the right amount.
 */
export function applySettlement<T extends Title>(
  title: T,
  amount: Money,
  at: Date,
): Result<SettlementOutcome<T>, DomainError> {
  // Status is checked before the amount so that settling an already-settled
  // title reports why, rather than complaining that the defaulted amount --
  // the outstanding balance, which is zero -- is not positive.
  if (title.status === 'cancelled') {
    return err(
      domainError(
        'INVALID_STATE_TRANSITION',
        `Title ${title.id} has been cancelled and cannot be settled.`,
        { titleId: title.id, status: title.status },
      ),
    )
  }
  if (title.status === 'settled') {
    return err(
      domainError(
        'TITLE_ALREADY_SETTLED',
        `Title ${title.id} is already settled in full (${formatMoney(title.amount)}).`,
        { titleId: title.id, amount: formatMoney(title.amount) },
      ),
    )
  }

  if (amount <= 0n) {
    return err(
      domainError('VALIDATION_FAILED', 'Settlement amount must be greater than zero.', {
        titleId: title.id,
      }),
    )
  }

  const outstanding = outstandingAmount(title)
  if (amount > outstanding) {
    return err(
      domainError(
        'OVER_SETTLEMENT',
        `Cannot settle ${formatMoney(amount)}: only ${formatMoney(outstanding)} is outstanding on this title.`,
        {
          titleId: title.id,
          requested: formatMoney(amount),
          outstanding: formatMoney(outstanding),
        },
      ),
    )
  }

  const settledAmount = addMoney(title.settledAmount, amount)
  const updated = {
    ...title,
    settledAmount,
    status: statusAfter(title.amount, settledAmount),
    updatedAt: at,
  }

  return ok({
    title: updated,
    outstanding: subMoney(title.amount, settledAmount),
    fullySettled: settledAmount >= title.amount,
  })
}

/**
 * Backs a settlement out of a title. The settlement row itself is kept and
 * marked reversed -- deleting it would erase the fact that somebody made a
 * mistake, which is the one thing an audit trail exists to preserve.
 */
export function reverseSettlement<T extends Title>(
  title: T,
  settlement: Settlement,
  reason: string,
  at: Date,
): Result<{ title: T; settlement: Settlement }, DomainError> {
  if (settlement.reversedAt !== null) {
    return err(
      domainError(
        'SETTLEMENT_ALREADY_REVERSED',
        `Settlement ${settlement.id} was already reversed on ${settlement.reversedAt.toISOString()}.`,
        { settlementId: settlement.id },
      ),
    )
  }
  if (settlement.titleId !== title.id) {
    return err(
      domainError(
        'VALIDATION_FAILED',
        `Settlement ${settlement.id} does not belong to title ${title.id}.`,
        { settlementId: settlement.id, titleId: title.id },
      ),
    )
  }
  const trimmed = reason.trim()
  if (trimmed.length === 0) {
    return err(
      domainError(
        'VALIDATION_FAILED',
        'Reversing a settlement requires a reason for the audit trail.',
        { settlementId: settlement.id },
      ),
    )
  }

  const settledAmount = subMoney(title.settledAmount, settlement.amount)
  if (settledAmount < 0n) {
    return err(
      domainError(
        'VALIDATION_FAILED',
        `Reversing ${formatMoney(settlement.amount)} would leave the title with a negative settled amount.`,
        { settlementId: settlement.id, titleId: title.id },
      ),
    )
  }

  return ok({
    title: {
      ...title,
      settledAmount,
      status: statusAfter(title.amount, settledAmount),
      updatedAt: at,
    },
    settlement: { ...settlement, reversedAt: at, reversalReason: trimmed },
  })
}

export function describeTitle(title: Title): string {
  const instalment =
    title.instalments > 1 ? ` (${String(title.instalment)}/${String(title.instalments)})` : ''
  return `${title.description}${instalment} - ${formatMoney(outstandingAmount(title))} due ${title.dueDate}`
}
