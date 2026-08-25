import { z } from 'zod'
import {
  addDays,
  businessDateSchema,
  compareBusinessDate,
  type BusinessDate,
} from '../kit/business-date.js'
import { today } from '../context/execution-context.js'
import { formatMoney, sumMoney, type Money } from '../kit/money.js'
import { ok } from '../kit/result.js'
import { outstandingAmount, type Title } from '../model/finance.js'
import { availableQuantity, emptyBalance, stockValue } from '../model/stock.js'
import { defineUseCase } from './definition.js'
import {
  presentCashFlowRow,
  presentEvent,
  presentPage,
  presentSalesPeriodRow,
  presentStockLine,
  presentTitle,
} from '../views/index.js'

const rangeFields = {
  from: businessDateSchema.optional(),
  to: businessDateSchema.optional(),
}

const orderedRange = (value: {
  from?: BusinessDate | undefined
  to?: BusinessDate | undefined
}): boolean =>
  value.from === undefined ||
  value.to === undefined ||
  compareBusinessDate(value.from, value.to) <= 0

const RANGE_MESSAGE = { message: 'The start of the range must not be after its end.' }

/**
 * Composed with `z.object(...)` rather than `.and(...)`: an intersection turns
 * into `allOf` in JSON Schema, which leaves the tool definition without a
 * top-level `"type": "object"` and confuses MCP clients. There is a test that
 * asserts every tool schema is a plain object for exactly this reason.
 */
const rangeSchema = z.object(rangeFields).refine(orderedRange, RANGE_MESSAGE)

export const reportSalesByPeriod = defineUseCase({
  name: 'report_sales_by_period',
  title: 'Sales by period',
  summary:
    'Aggregates invoiced sales between two dates by day, week or month: order count, gross value, discounts, net revenue, cost of goods sold and margin. Defaults to the last 30 days grouped by day.',
  capability: 'reports:read',
  risk: 'read',
  inputSchema: z
    .object({ ...rangeFields, granularity: z.enum(['day', 'week', 'month']).default('day') })
    .refine(orderedRange, RANGE_MESSAGE),
  execute: async (input, context) => {
    const to = input.to ?? today(context)
    const from = input.from ?? addDays(to, -30)
    const rows = await context.uow.reporting.salesByPeriod({
      from,
      to,
      granularity: input.granularity,
    })
    return ok({ from, to, granularity: input.granularity, rows })
  },
  present: ({ from, to, granularity, rows }) => ({
    from,
    to,
    granularity,
    rows: rows.map(presentSalesPeriodRow),
  }),
})

export const reportCashFlow = defineUseCase({
  name: 'report_cash_flow',
  title: 'Cash flow',
  summary:
    'Returns one row per business day between two dates with the opening balance, money in, money out, closing balance and whether the day is still open. Defaults to the last 30 days.',
  capability: 'reports:read',
  risk: 'read',
  inputSchema: rangeSchema,
  execute: async (input, context) => {
    const to = input.to ?? today(context)
    const from = input.from ?? addDays(to, -30)
    const rows = await context.uow.reporting.cashFlow({ from, to })
    return ok({ from, to, rows })
  },
  present: ({ from, to, rows }) => ({ from, to, rows: rows.map(presentCashFlowRow) }),
})

export const reportStockPosition = defineUseCase({
  name: 'report_stock_position',
  title: 'Stock position',
  summary:
    'Full inventory valuation: quantity on hand, reserved, available to promise, average cost and total value for every active product, plus the totals.',
  capability: 'reports:read',
  risk: 'read',
  inputSchema: z.object({
    search: z.string().trim().max(120).optional(),
    belowMinimumOnly: z.boolean().default(false),
    limit: z.number().int().min(1).max(500).default(200),
  }),
  execute: async (input, context) => {
    const listed = await context.uow.products.list({
      ...(input.search === undefined ? {} : { search: input.search }),
      activeOnly: true,
      page: { limit: input.limit, offset: 0 },
    })
    const balances = await context.uow.stock.getBalances(listed.rows.map((row) => row.id))

    const rows = listed.rows
      .map((product) => {
        const balance = balances.get(product.id) ?? emptyBalance(product.id, context.now)
        return {
          product,
          onHand: balance.onHand,
          reserved: balance.reserved,
          available: availableQuantity(balance),
          averageCost: balance.averageCost,
          value: stockValue(balance),
          belowMinimum: balance.onHand < product.minimumStock,
        }
      })
      .filter((row) => !input.belowMinimumOnly || row.belowMinimum)

    const totalValue = sumMoney(rows.map((row) => row.value))
    return ok({ rows, totalValue, productCount: rows.length })
  },
  present: ({ rows, totalValue, productCount }) => ({
    productCount,
    totalValue: formatMoney(totalValue),
    rows: rows.map((row) => presentStockLine(row.product, row)),
  }),
})

export const reportOverdueTitles = defineUseCase({
  name: 'report_overdue_titles',
  title: 'Overdue titles',
  summary:
    'Everything past due as of a given date (today by default), receivables and payables side by side, with the total overdue on each side.',
  capability: 'reports:read',
  risk: 'read',
  inputSchema: z.object({
    asOf: businessDateSchema.optional(),
    limit: z.number().int().min(1).max(200).default(100),
  }),
  execute: async (input, context) => {
    const asOf = input.asOf ?? today(context)
    const page = { limit: input.limit, offset: 0 }
    const [receivables, payables] = await Promise.all([
      context.uow.finance.listReceivables({ overdueAsOf: asOf, page }),
      context.uow.finance.listPayables({ overdueAsOf: asOf, page }),
    ])

    const totalOutstanding = (titles: readonly Title[]): Money =>
      sumMoney(titles.map(outstandingAmount))

    return ok({
      asOf,
      receivables: receivables.rows,
      payables: payables.rows,
      totalReceivable: totalOutstanding(receivables.rows),
      totalPayable: totalOutstanding(payables.rows),
    })
  },
  present: ({ asOf, receivables, payables, totalReceivable, totalPayable }) => ({
    asOf,
    receivables: receivables.map((title) => presentTitle(title, null, asOf)),
    payables: payables.map((title) => presentTitle(title, null, asOf)),
    totalReceivable: formatMoney(totalReceivable),
    totalPayable: formatMoney(totalPayable),
  }),
})

export const getCurrentContext = defineUseCase({
  name: 'get_current_context',
  title: 'Get current context',
  summary:
    'Returns who the caller is, which role they hold, the tenant timezone, the currency, and what today is in that timezone. Call this first when a request mentions "today", "this month" or "yesterday" instead of guessing the date.',
  capability: 'catalog:read',
  risk: 'read',
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const businessDate = today(context)
    const session = await context.uow.cash.findByDate(businessDate)
    return ok({
      tenantId: context.tenantId,
      userId: context.userId,
      role: context.role,
      actor: context.actor.kind,
      timeZone: context.timeZone,
      currency: context.currency,
      today: businessDate,
      cashSessionStatus: session?.status ?? 'not_opened',
    })
  },
  present: (value) => value,
})

export const listDomainEvents = defineUseCase({
  name: 'list_domain_events',
  title: 'List domain events',
  summary:
    'Returns the audit trail: every recorded fact, newest first, with the actor behind it. Filter by aggregate to follow one order through its whole life, or by agentRunId to see everything a single agent run changed.',
  capability: 'audit:read',
  risk: 'read',
  inputSchema: z.object({
    types: z.array(z.string().max(64)).max(20).optional(),
    aggregateType: z.string().max(32).optional(),
    aggregateId: z.uuid().optional(),
    agentRunId: z.uuid().optional(),
    actorKind: z.enum(['user', 'agent', 'system']).optional(),
    limit: z.number().int().min(1).max(200).default(100),
    offset: z.number().int().min(0).default(0),
  }),
  execute: async (input, context) =>
    ok(
      await context.uow.audit.listEvents({
        ...(input.types === undefined ? {} : { types: input.types }),
        ...(input.aggregateType === undefined ? {} : { aggregateType: input.aggregateType }),
        ...(input.aggregateId === undefined ? {} : { aggregateId: input.aggregateId }),
        ...(input.agentRunId === undefined ? {} : { agentRunId: input.agentRunId }),
        ...(input.actorKind === undefined ? {} : { actorKind: input.actorKind }),
        page: { limit: input.limit, offset: input.offset },
      }),
    ),
  present: (page) => presentPage(page, presentEvent),
})
