import { USE_CASES, formatMoney, formatQuantity, formatUnitValue } from '@ledgerhand/domain'
import { Boxes } from 'lucide-react'
import type { Metadata } from 'next'
import type * as React from 'react'
import { FilterTabs, SearchField } from '@/components/app/search-field'
import { StatCard } from '@/components/app/stat-card'
import { StockRowActions } from '@/components/stock/stock-actions'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, PageHeader } from '@/components/ui/misc'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatCurrency } from '@/lib/format'
import { can, query, requireSession } from '@/server/context'

export const metadata: Metadata = { title: 'Stock' }
export const dynamic = 'force-dynamic'

export default async function StockPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<React.JSX.Element> {
  const session = await requireSession()
  const params = await searchParams
  const search = typeof params['q'] === 'string' && params['q'] !== '' ? params['q'] : undefined
  const belowOnly = params['below'] === '1'

  const data = await query(async (context) => {
    const report = await USE_CASES.report_stock_position.execute(
      {
        ...(search === undefined ? {} : { search }),
        belowMinimumOnly: belowOnly,
        limit: 500,
      },
      context,
    )
    const alerts = await USE_CASES.list_products_below_minimum.execute({}, context)

    if (!report.ok) {
      return { rows: [], totalValue: '0.00', productCount: 0, alertCount: 0 }
    }

    return {
      rows: report.value.rows.map((row) => ({
        productId: row.product.id,
        sku: row.product.sku,
        name: row.product.name,
        unit: row.product.unit,
        onHand: formatQuantity(row.onHand),
        reserved: formatQuantity(row.reserved),
        available: formatQuantity(row.available),
        averageCost: formatUnitValue(row.averageCost),
        value: formatMoney(row.value),
        minimumStock: formatQuantity(row.product.minimumStock),
        belowMinimum: row.belowMinimum,
      })),
      totalValue: formatMoney(report.value.totalValue),
      productCount: report.value.productCount,
      alertCount: alerts.ok ? alerts.value.length : 0,
    }
  })

  const canWrite = can(session, 'stock:write')
  const canAdjust = can(session, 'stock:adjust')

  return (
    <>
      <PageHeader
        title="Stock position"
        description="What is on hand, what is promised to confirmed orders, and what is left to sell."
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Inventory value"
          value={formatCurrency(data.totalValue)}
          hint="At weighted average cost"
        />
        <StatCard
          label="Products shown"
          value={String(data.productCount)}
          hint="Active catalogue"
        />
        <StatCard
          label="Below minimum"
          value={String(data.alertCount)}
          hint="Needing replenishment"
          tone={data.alertCount > 0 ? 'warning' : 'positive'}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Position</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <FilterTabs
              paramName="below"
              options={[
                { value: '', label: 'All' },
                { value: '1', label: 'Below minimum', count: data.alertCount },
              ]}
            />
            <SearchField placeholder="Search SKU or name…" />
          </div>
        </CardHeader>

        <CardContent>
          {data.rows.length === 0 ? (
            <EmptyState
              icon={<Boxes className="size-5" />}
              title={belowOnly ? 'Everything is above its minimum' : 'Nothing to show'}
              description={
                belowOnly
                  ? 'No product needs replenishing right now.'
                  : 'Register a stock entry or receive a purchase order.'
              }
            />
          ) : (
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>SKU</TH>
                    <TH>Product</TH>
                    <TH numeric>On hand</TH>
                    <TH numeric>Reserved</TH>
                    <TH numeric>Available</TH>
                    <TH numeric>Avg. cost</TH>
                    <TH numeric>Value</TH>
                    <TH className="w-10" />
                  </TR>
                </THead>
                <TBody>
                  {data.rows.map((row) => (
                    <TR key={row.productId}>
                      <TD className="font-mono text-xs">{row.sku}</TD>
                      <TD className="max-w-64">
                        <span className="block truncate font-medium">{row.name}</span>
                        {row.belowMinimum ? (
                          <Badge tone="warning" className="mt-0.5">
                            below {row.minimumStock}
                          </Badge>
                        ) : null}
                      </TD>
                      <TD numeric className={row.belowMinimum ? 'text-warning-foreground' : ''}>
                        {row.onHand}
                      </TD>
                      <TD numeric className="text-muted-foreground">
                        {row.reserved === '0' ? '—' : row.reserved}
                      </TD>
                      <TD numeric className="font-medium">
                        {row.available}
                      </TD>
                      <TD numeric className="text-muted-foreground">
                        {formatCurrency(row.averageCost)}
                      </TD>
                      <TD numeric>{formatCurrency(row.value)}</TD>
                      <TD>
                        <StockRowActions
                          productId={row.productId}
                          sku={row.sku}
                          name={row.name}
                          unit={row.unit}
                          canWrite={canWrite}
                          canAdjust={canAdjust}
                        />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          )}
        </CardContent>
      </Card>
    </>
  )
}
