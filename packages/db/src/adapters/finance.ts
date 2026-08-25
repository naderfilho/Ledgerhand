import {
  asId,
  type BusinessDate,
  type CashRepository,
  type CashSession,
  type CashSessionId,
  type CustomerId,
  type FinanceRepository,
  type FiscalDocument,
  type FiscalDocumentId,
  type FiscalRepository,
  type Paginated,
  type Payable,
  type PayableId,
  type PurchaseOrderId,
  type Receivable,
  type ReceivableId,
  type SalesOrderId,
  type Settlement,
  type SettlementId,
  type SupplierId,
  type TenantId,
  type TitleFilter,
  type UserId,
} from '@ledgerhand/domain'
import { and, asc, count, desc, eq, getTableColumns, isNull, lt, or, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'
import {
  cashSessions,
  fiscalDocuments,
  payables,
  receivables,
  settlements,
} from '../schema/index.js'
import type { Transaction } from '../unit-of-work.js'
import { limitOf, offsetOf, paginatedFrom, rowCount } from './shared.js'

type ReceivableRow = typeof receivables.$inferSelect
type PayableRow = typeof payables.$inferSelect
type SettlementRow = typeof settlements.$inferSelect
type CashRow = typeof cashSessions.$inferSelect
type FiscalRow = typeof fiscalDocuments.$inferSelect

function toReceivable(row: ReceivableRow): Receivable {
  return {
    id: asId<ReceivableId>(row.id),
    kind: 'receivable',
    tenantId: asId<TenantId>(row.tenantId),
    customerId: asId<CustomerId>(row.customerId),
    salesOrderId: asId<SalesOrderId>(row.salesOrderId),
    amount: row.amount,
    settledAmount: row.settledAmount,
    issuedOn: row.issuedOn,
    dueDate: row.dueDate,
    status: row.status,
    description: row.description,
    instalment: row.instalment,
    instalments: row.instalments,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toPayable(row: PayableRow): Payable {
  return {
    id: asId<PayableId>(row.id),
    kind: 'payable',
    tenantId: asId<TenantId>(row.tenantId),
    supplierId: asId<SupplierId>(row.supplierId),
    purchaseOrderId: asId<PurchaseOrderId>(row.purchaseOrderId),
    amount: row.amount,
    settledAmount: row.settledAmount,
    issuedOn: row.issuedOn,
    dueDate: row.dueDate,
    status: row.status,
    description: row.description,
    instalment: row.instalment,
    instalments: row.instalments,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toSettlement(row: SettlementRow): Settlement {
  return {
    id: asId<SettlementId>(row.id),
    tenantId: asId<TenantId>(row.tenantId),
    titleKind: row.titleKind,
    titleId: row.titleId,
    amount: row.amount,
    settledOn: row.settledOn,
    method: row.method,
    note: row.note,
    reversedAt: row.reversedAt,
    reversalReason: row.reversalReason,
    createdAt: row.createdAt,
  }
}

/**
 * Both title tables share a filter shape, so the predicate is built once over
 * the columns each table provides.
 */
function titleConditions(
  columns: { dueDate: PgColumn; status: PgColumn },
  filter: TitleFilter,
): SQL[] {
  const conditions: SQL[] = []
  if (filter.status !== undefined && filter.status.length > 0) {
    const statuses = filter.status.map((status) => eq(columns.status, status))
    const combined = statuses.length === 1 ? statuses[0] : or(...statuses)
    if (combined !== undefined) conditions.push(combined)
  }
  if (filter.dueOn !== undefined) conditions.push(eq(columns.dueDate, filter.dueOn))
  if (filter.dueBefore !== undefined) conditions.push(lt(columns.dueDate, filter.dueBefore))
  if (filter.overdueAsOf !== undefined) {
    conditions.push(lt(columns.dueDate, filter.overdueAsOf))
    const open = or(eq(columns.status, 'open'), eq(columns.status, 'partially_settled'))
    if (open !== undefined) conditions.push(open)
  }
  return conditions
}

export class SqlFinance implements FinanceRepository {
  constructor(
    private readonly tx: Transaction,
    private readonly tenantId: TenantId,
  ) {}

  async findReceivable(id: ReceivableId): Promise<Receivable | null> {
    const [row] = await this.tx
      .select()
      .from(receivables)
      .where(and(eq(receivables.tenantId, this.tenantId), eq(receivables.id, id)))
      .limit(1)
    return row === undefined ? null : toReceivable(row)
  }

  async findPayable(id: PayableId): Promise<Payable | null> {
    const [row] = await this.tx
      .select()
      .from(payables)
      .where(and(eq(payables.tenantId, this.tenantId), eq(payables.id, id)))
      .limit(1)
    return row === undefined ? null : toPayable(row)
  }

  async listReceivables(filter: TitleFilter): Promise<Paginated<Receivable>> {
    const rows = await this.tx
      .select({ ...getTableColumns(receivables), _rowCount: rowCount })
      .from(receivables)
      .where(
        and(
          eq(receivables.tenantId, this.tenantId),
          ...titleConditions({ dueDate: receivables.dueDate, status: receivables.status }, filter),
        ),
      )
      .orderBy(asc(receivables.dueDate), asc(receivables.instalment))
      .limit(limitOf(filter.page))
      .offset(offsetOf(filter.page))

    return paginatedFrom(rows, toReceivable)
  }

  async listPayables(filter: TitleFilter): Promise<Paginated<Payable>> {
    const rows = await this.tx
      .select({ ...getTableColumns(payables), _rowCount: rowCount })
      .from(payables)
      .where(
        and(
          eq(payables.tenantId, this.tenantId),
          ...titleConditions({ dueDate: payables.dueDate, status: payables.status }, filter),
        ),
      )
      .orderBy(asc(payables.dueDate))
      .limit(limitOf(filter.page))
      .offset(offsetOf(filter.page))

    return paginatedFrom(rows, toPayable)
  }

  async listReceivablesByOrder(orderId: SalesOrderId): Promise<readonly Receivable[]> {
    const rows = await this.tx
      .select()
      .from(receivables)
      .where(and(eq(receivables.tenantId, this.tenantId), eq(receivables.salesOrderId, orderId)))
      .orderBy(asc(receivables.instalment))
    return rows.map(toReceivable)
  }

  async saveReceivable(receivable: Receivable): Promise<void> {
    await this.tx
      .insert(receivables)
      .values({
        id: receivable.id,
        tenantId: receivable.tenantId,
        customerId: receivable.customerId,
        salesOrderId: receivable.salesOrderId,
        amount: receivable.amount,
        settledAmount: receivable.settledAmount,
        issuedOn: receivable.issuedOn,
        dueDate: receivable.dueDate,
        status: receivable.status,
        description: receivable.description,
        instalment: receivable.instalment,
        instalments: receivable.instalments,
        createdAt: receivable.createdAt,
        updatedAt: receivable.updatedAt,
      })
      .onConflictDoUpdate({
        target: receivables.id,
        set: {
          settledAmount: receivable.settledAmount,
          status: receivable.status,
          dueDate: receivable.dueDate,
          updatedAt: receivable.updatedAt,
        },
      })
  }

  async savePayable(payable: Payable): Promise<void> {
    await this.tx
      .insert(payables)
      .values({
        id: payable.id,
        tenantId: payable.tenantId,
        supplierId: payable.supplierId,
        purchaseOrderId: payable.purchaseOrderId,
        amount: payable.amount,
        settledAmount: payable.settledAmount,
        issuedOn: payable.issuedOn,
        dueDate: payable.dueDate,
        status: payable.status,
        description: payable.description,
        instalment: payable.instalment,
        instalments: payable.instalments,
        createdAt: payable.createdAt,
        updatedAt: payable.updatedAt,
      })
      .onConflictDoUpdate({
        target: payables.id,
        set: {
          settledAmount: payable.settledAmount,
          status: payable.status,
          dueDate: payable.dueDate,
          updatedAt: payable.updatedAt,
        },
      })
  }

  async findSettlement(id: SettlementId): Promise<Settlement | null> {
    const [row] = await this.tx
      .select()
      .from(settlements)
      .where(and(eq(settlements.tenantId, this.tenantId), eq(settlements.id, id)))
      .limit(1)
    return row === undefined ? null : toSettlement(row)
  }

  async appendSettlement(settlement: Settlement): Promise<void> {
    await this.tx.insert(settlements).values({
      id: settlement.id,
      tenantId: settlement.tenantId,
      titleKind: settlement.titleKind,
      titleId: settlement.titleId,
      amount: settlement.amount,
      settledOn: settlement.settledOn,
      method: settlement.method,
      note: settlement.note,
      reversedAt: settlement.reversedAt,
      reversalReason: settlement.reversalReason,
      createdAt: settlement.createdAt,
    })
  }

  /** Only the reversal fields are writable; the payment itself is history. */
  async saveSettlement(settlement: Settlement): Promise<void> {
    await this.tx
      .update(settlements)
      .set({ reversedAt: settlement.reversedAt, reversalReason: settlement.reversalReason })
      .where(and(eq(settlements.tenantId, this.tenantId), eq(settlements.id, settlement.id)))
  }

  async listSettlementsOn(businessDate: BusinessDate): Promise<readonly Settlement[]> {
    const rows = await this.tx
      .select()
      .from(settlements)
      .where(
        and(
          eq(settlements.tenantId, this.tenantId),
          eq(settlements.settledOn, businessDate),
          isNull(settlements.reversedAt),
        ),
      )
      .orderBy(desc(settlements.createdAt))
    return rows.map(toSettlement)
  }

  async countUnsettledDueOn(businessDate: BusinessDate): Promise<number> {
    const openStatuses = or(
      eq(receivables.status, 'open'),
      eq(receivables.status, 'partially_settled'),
    )
    const [receivableCount] = await this.tx
      .select({ value: count() })
      .from(receivables)
      .where(
        and(
          eq(receivables.tenantId, this.tenantId),
          eq(receivables.dueDate, businessDate),
          openStatuses,
        ),
      )

    const openPayables = or(eq(payables.status, 'open'), eq(payables.status, 'partially_settled'))
    const [payableCount] = await this.tx
      .select({ value: count() })
      .from(payables)
      .where(
        and(eq(payables.tenantId, this.tenantId), eq(payables.dueDate, businessDate), openPayables),
      )

    return (receivableCount?.value ?? 0) + (payableCount?.value ?? 0)
  }
}

function toCashSession(row: CashRow): CashSession {
  return {
    id: asId<CashSessionId>(row.id),
    tenantId: asId<TenantId>(row.tenantId),
    businessDate: row.businessDate,
    status: row.status,
    openingBalance: row.openingBalance,
    inflow: row.inflow,
    outflow: row.outflow,
    closingBalance: row.closingBalance,
    countedBalance: row.countedBalance,
    difference: row.difference,
    unsettledTitles: row.unsettledTitles,
    justification: row.justification,
    openedAt: row.openedAt,
    openedBy: asId<UserId>(row.openedBy),
    closedAt: row.closedAt,
    closedBy: row.closedBy === null ? null : asId<UserId>(row.closedBy),
  }
}

export class SqlCash implements CashRepository {
  constructor(
    private readonly tx: Transaction,
    private readonly tenantId: TenantId,
  ) {}

  async findByDate(businessDate: BusinessDate): Promise<CashSession | null> {
    const [row] = await this.tx
      .select()
      .from(cashSessions)
      .where(
        and(eq(cashSessions.tenantId, this.tenantId), eq(cashSessions.businessDate, businessDate)),
      )
      .limit(1)
    return row === undefined ? null : toCashSession(row)
  }

  async findById(id: CashSessionId): Promise<CashSession | null> {
    const [row] = await this.tx
      .select()
      .from(cashSessions)
      .where(and(eq(cashSessions.tenantId, this.tenantId), eq(cashSessions.id, id)))
      .limit(1)
    return row === undefined ? null : toCashSession(row)
  }

  async findLatestClosed(before: BusinessDate): Promise<CashSession | null> {
    const [row] = await this.tx
      .select()
      .from(cashSessions)
      .where(
        and(
          eq(cashSessions.tenantId, this.tenantId),
          eq(cashSessions.status, 'closed'),
          lt(cashSessions.businessDate, before),
        ),
      )
      .orderBy(desc(cashSessions.businessDate))
      .limit(1)
    return row === undefined ? null : toCashSession(row)
  }

  async save(session: CashSession): Promise<void> {
    await this.tx
      .insert(cashSessions)
      .values({
        id: session.id,
        tenantId: session.tenantId,
        businessDate: session.businessDate,
        status: session.status,
        openingBalance: session.openingBalance,
        inflow: session.inflow,
        outflow: session.outflow,
        closingBalance: session.closingBalance,
        countedBalance: session.countedBalance,
        difference: session.difference,
        unsettledTitles: session.unsettledTitles,
        justification: session.justification,
        openedAt: session.openedAt,
        openedBy: session.openedBy,
        closedAt: session.closedAt,
        closedBy: session.closedBy,
      })
      .onConflictDoUpdate({
        target: cashSessions.id,
        set: {
          status: session.status,
          inflow: session.inflow,
          outflow: session.outflow,
          closingBalance: session.closingBalance,
          countedBalance: session.countedBalance,
          difference: session.difference,
          unsettledTitles: session.unsettledTitles,
          justification: session.justification,
          closedAt: session.closedAt,
          closedBy: session.closedBy,
        },
      })
  }
}

function toFiscalDocument(row: FiscalRow): FiscalDocument {
  return {
    id: asId<FiscalDocumentId>(row.id),
    tenantId: asId<TenantId>(row.tenantId),
    series: row.series,
    number: row.number,
    salesOrderId: asId<SalesOrderId>(row.salesOrderId),
    customerId: asId<CustomerId>(row.customerId),
    total: row.total,
    status: row.status,
    issuedAt: row.issuedAt,
    cancelledAt: row.cancelledAt,
    cancellationReason: row.cancellationReason,
    pdfPath: row.pdfPath,
  }
}

export class SqlFiscal implements FiscalRepository {
  constructor(
    private readonly tx: Transaction,
    private readonly tenantId: TenantId,
  ) {}

  async findById(id: FiscalDocumentId): Promise<FiscalDocument | null> {
    const [row] = await this.tx
      .select()
      .from(fiscalDocuments)
      .where(and(eq(fiscalDocuments.tenantId, this.tenantId), eq(fiscalDocuments.id, id)))
      .limit(1)
    return row === undefined ? null : toFiscalDocument(row)
  }

  async findBySalesOrder(orderId: SalesOrderId): Promise<FiscalDocument | null> {
    const [row] = await this.tx
      .select()
      .from(fiscalDocuments)
      .where(
        and(eq(fiscalDocuments.tenantId, this.tenantId), eq(fiscalDocuments.salesOrderId, orderId)),
      )
      .limit(1)
    return row === undefined ? null : toFiscalDocument(row)
  }

  async save(document: FiscalDocument): Promise<void> {
    await this.tx
      .insert(fiscalDocuments)
      .values({
        id: document.id,
        tenantId: document.tenantId,
        series: document.series,
        number: document.number,
        salesOrderId: document.salesOrderId,
        customerId: document.customerId,
        total: document.total,
        status: document.status,
        issuedAt: document.issuedAt,
        cancelledAt: document.cancelledAt,
        cancellationReason: document.cancellationReason,
        pdfPath: document.pdfPath,
      })
      .onConflictDoUpdate({
        target: fiscalDocuments.id,
        set: {
          status: document.status,
          cancelledAt: document.cancelledAt,
          cancellationReason: document.cancellationReason,
          pdfPath: document.pdfPath,
        },
      })
  }
}
