import {
  moneyFromCents,
  parseScaled,
  subMoney,
  sumMoney,
  ZERO_MONEY,
  type BusinessDate,
  type CashFlowRow,
  type Money,
  type ReportGranularity,
  type ReportingRepository,
  type SalesByPeriodRow,
  type TenantId,
} from '@ledgerhand/domain'
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm'
import { cashSessions, salesOrderItems, salesOrders } from '../schema/index.js'
import type { Transaction } from '../unit-of-work.js'

/**
 * Reports aggregate in SQL rather than in TypeScript. Summing four thousand
 * order lines in the application would mean loading four thousand order lines,
 * and `numeric` addition in Postgres is exact -- which is the whole reason the
 * money columns are `numeric` and not `bigint`.
 */

function toMoney(value: string | null): Money {
  if (value === null) return ZERO_MONEY
  const parsed = parseScaled(value, 2, 'Aggregated amount')
  if (!parsed.ok) throw new Error(`Report returned a value that is not an amount: ${value}`)
  return moneyFromCents(parsed.value)
}

const PERIOD_EXPRESSION: Record<ReportGranularity, string> = {
  day: 'YYYY-MM-DD',
  week: 'IYYY-"W"IW',
  month: 'YYYY-MM',
}

export class SqlReporting implements ReportingRepository {
  constructor(
    private readonly tx: Transaction,
    private readonly tenantId: TenantId,
  ) {}

  async salesByPeriod(args: {
    readonly from: BusinessDate
    readonly to: BusinessDate
    readonly granularity: ReportGranularity
  }): Promise<readonly SalesByPeriodRow[]> {
    // The format string comes from a closed map keyed by a validated enum, so
    // no caller-supplied text reaches the query.
    const format = PERIOD_EXPRESSION[args.granularity]
    const period = sql<string>`to_char(${salesOrders.issuedOn}, ${sql.raw(`'${format}'`)})`

    const rows = await this.tx
      .select({
        period,
        orderCount: sql<string>`count(distinct ${salesOrders.id})`,
        net: sql<string>`coalesce(sum(${salesOrderItems.total}), 0)`,
        discount: sql<string>`coalesce(sum(${salesOrderItems.discount}), 0)`,
        // Quantity carries three decimals and unit cost six, so the product
        // lands on nine. Rounded here, in SQL, to the two the money type takes.
        cost: sql<string>`coalesce(round(sum(${salesOrderItems.quantity} * coalesce(${salesOrderItems.unitCostAtInvoice}, 0)), 2), 0)`,
      })
      .from(salesOrders)
      .innerJoin(salesOrderItems, eq(salesOrderItems.orderId, salesOrders.id))
      .where(
        and(
          eq(salesOrders.tenantId, this.tenantId),
          eq(salesOrders.status, 'invoiced'),
          gte(salesOrders.issuedOn, args.from),
          lte(salesOrders.issuedOn, args.to),
        ),
      )
      .groupBy(period)
      .orderBy(asc(period))

    return rows.map((row) => {
      const net = toMoney(row.net)
      const discount = toMoney(row.discount)
      const cost = toMoney(row.cost)
      return {
        period: row.period,
        orderCount: Number(row.orderCount),
        gross: sumMoney([net, discount]),
        discount,
        net,
        cost,
        margin: subMoney(net, cost),
      }
    })
  }

  async cashFlow(args: {
    readonly from: BusinessDate
    readonly to: BusinessDate
  }): Promise<readonly CashFlowRow[]> {
    const rows = await this.tx
      .select({
        businessDate: cashSessions.businessDate,
        openingBalance: cashSessions.openingBalance,
        inflow: cashSessions.inflow,
        outflow: cashSessions.outflow,
        closingBalance: cashSessions.closingBalance,
        status: cashSessions.status,
      })
      .from(cashSessions)
      .where(
        and(
          eq(cashSessions.tenantId, this.tenantId),
          gte(cashSessions.businessDate, args.from),
          lte(cashSessions.businessDate, args.to),
        ),
      )
      .orderBy(asc(cashSessions.businessDate))

    return rows.map((row) => ({
      businessDate: row.businessDate,
      openingBalance: row.openingBalance,
      inflow: row.inflow,
      outflow: row.outflow,
      // An open day has no closing balance yet, so the expected one is shown.
      closingBalance:
        row.closingBalance ?? subMoney(sumMoney([row.openingBalance, row.inflow]), row.outflow),
      status: row.status,
    }))
  }
}
