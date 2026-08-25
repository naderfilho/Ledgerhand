import { USE_CASES, addDays, formatMoney, sumMoney } from '@ledgerhand/domain'
import type { Metadata } from 'next'
import type * as React from 'react'
import { SalesTrend } from '@/components/app/sales-trend'
import { StatCard } from '@/components/app/stat-card'
import { Card, CardBody, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, PageHeader } from '@/components/ui/misc'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/format'
import { query, requireCapabilityOrRedirect } from '@/server/context'

export const metadata: Metadata = { title: 'Reports' }
export const dynamic = 'force-dynamic'

export default async function ReportsPage(): Promise<React.JSX.Element> {
  await requireCapabilityOrRedirect('reports:read')

  const data = await query(async (context) => {
    const today = await USE_CASES.get_current_context.execute({}, context)
    if (!today.ok) throw new Error(today.error.message)
    const businessDate = today.value.today
    const from = addDays(businessDate, -89)

    const [daily, monthly, stock, overdue] = await Promise.all([
      USE_CASES.report_sales_by_period.execute(
        { from: addDays(businessDate, -29), to: businessDate, granularity: 'day' },
        context,
      ),
      USE_CASES.report_sales_by_period.execute(
        { from, to: businessDate, granularity: 'month' },
        context,
      ),
      USE_CASES.report_stock_position.execute({ belowMinimumOnly: false, limit: 500 }, context),
      USE_CASES.report_overdue_titles.execute({ limit: 200 }, context),
    ])

    const dailyRows = daily.ok ? daily.value.rows : []
    const monthlyRows = monthly.ok ? monthly.value.rows : []

    return {
      businessDate,
      from,
      trend: dailyRows.map((row) => ({ period: row.period, net: formatMoney(row.net) })),
      revenue30: formatMoney(sumMoney(dailyRows.map((row) => row.net))),
      months: monthlyRows.map((row) => ({
        period: row.period,
        orders: row.orderCount,
        gross: formatMoney(row.gross),
        discount: formatMoney(row.discount),
        net: formatMoney(row.net),
        cost: formatMoney(row.cost),
        margin: formatMoney(row.margin),
      })),
      revenue90: formatMoney(sumMoney(monthlyRows.map((row) => row.net))),
      margin90: formatMoney(sumMoney(monthlyRows.map((row) => row.margin))),
      inventoryValue: stock.ok ? formatMoney(stock.value.totalValue) : '0.00',
      overdueReceivable: overdue.ok ? formatMoney(overdue.value.totalReceivable) : '0.00',
      overduePayable: overdue.ok ? formatMoney(overdue.value.totalPayable) : '0.00',
      topValue: (stock.ok ? [...stock.value.rows] : [])
        .sort((a, b) => (b.value > a.value ? 1 : b.value < a.value ? -1 : 0))
        .slice(0, 8)
        .map((row) => ({
          sku: row.product.sku,
          name: row.product.name,
          value: formatMoney(row.value),
        })),
    }
  })

  return (
    <>
      <PageHeader
        title="Reports"
        description={`Aggregated in SQL over the period ${formatDate(data.from)} to ${formatDate(data.businessDate)}.`}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue, 90 days"
          value={formatCurrency(data.revenue90)}
          hint="Invoiced, net of discounts"
        />
        <StatCard
          label="Margin, 90 days"
          value={formatCurrency(data.margin90)}
          hint="Net minus cost of goods sold"
          tone="positive"
        />
        <StatCard
          label="Inventory value"
          value={formatCurrency(data.inventoryValue)}
          hint="At weighted average cost"
        />
        <StatCard
          label="Overdue"
          value={formatCurrency(data.overdueReceivable)}
          hint={`${formatCurrency(data.overduePayable)} owed to suppliers`}
          tone="danger"
        />
      </section>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Sales by day</CardTitle>
            <p className="text-xs text-muted-foreground">Last 30 days, invoiced orders only</p>
          </div>
          <span className="tabular text-sm font-semibold">{formatCurrency(data.revenue30)}</span>
        </CardHeader>
        <CardBody className="pt-2">
          {data.trend.length === 0 ? (
            <EmptyState title="No invoiced sales in this window" />
          ) : (
            <SalesTrend points={data.trend} />
          )}
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sales by month</CardTitle>
          </CardHeader>
          <CardContent>
            {data.months.length === 0 ? (
              <EmptyState title="Nothing invoiced in the last 90 days" />
            ) : (
              <TableWrapper>
                <Table>
                  <THead>
                    <TR>
                      <TH>Month</TH>
                      <TH numeric>Orders</TH>
                      <TH numeric>Net</TH>
                      <TH numeric>Cost</TH>
                      <TH numeric>Margin</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.months.map((row) => (
                      <TR key={row.period}>
                        <TD className="font-medium">{row.period}</TD>
                        <TD numeric className="text-muted-foreground">
                          {row.orders}
                        </TD>
                        <TD numeric>{formatCurrency(row.net)}</TD>
                        <TD numeric className="text-muted-foreground">
                          {formatCurrency(row.cost)}
                        </TD>
                        <TD numeric className="font-medium text-positive-foreground">
                          {formatCurrency(row.margin)}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrapper>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Most valuable stock</CardTitle>
          </CardHeader>
          <CardContent>
            {data.topValue.length === 0 ? (
              <EmptyState title="No stock on hand" />
            ) : (
              <TableWrapper>
                <Table>
                  <THead>
                    <TR>
                      <TH>SKU</TH>
                      <TH>Product</TH>
                      <TH numeric>Value</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.topValue.map((row) => (
                      <TR key={row.sku}>
                        <TD className="font-mono text-xs">{row.sku}</TD>
                        <TD className="max-w-64 truncate">{row.name}</TD>
                        <TD numeric className="font-medium">
                          {formatCurrency(row.value)}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrapper>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
