import { USE_CASES, formatMoney, formatQuantity, formatUnitValue } from '@ledgerhand/domain'
import { PackageSearch } from 'lucide-react'
import type { Metadata } from 'next'
import type * as React from 'react'
import { FilterTabs } from '@/components/app/search-field'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, PageHeader } from '@/components/ui/misc'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatCurrency, formatDateTime } from '@/lib/format'
import { query, requireSession } from '@/server/context'

export const metadata: Metadata = { title: 'Stock movements' }
export const dynamic = 'force-dynamic'

const KIND_TONE: Record<string, BadgeTone> = {
  entry: 'positive',
  exit: 'danger',
  adjustment: 'warning',
}

const REASON_LABEL: Record<string, string> = {
  purchase_receipt: 'Purchase receipt',
  sales_invoice: 'Sales invoice',
  sales_cancellation: 'Sales reversal',
  manual_entry: 'Manual entry',
  manual_exit: 'Manual exit',
  inventory_count: 'Inventory count',
  loss: 'Loss',
  opening_balance: 'Opening balance',
}

export default async function MovementsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<React.JSX.Element> {
  const session = await requireSession()
  const params = await searchParams
  const kind = typeof params['kind'] === 'string' ? params['kind'] : ''

  const rows = await query(async (context) => {
    const listed = await USE_CASES.list_stock_movements.execute({ limit: 200, offset: 0 }, context)
    if (!listed.ok) return []

    const products = await USE_CASES.list_products.execute(
      { activeOnly: false, page: { limit: 500, offset: 0 } },
      context,
    )
    const names = new Map(
      (products.ok ? products.value.rows : []).map((product) => [product.id, product]),
    )

    return listed.value.rows
      .filter((movement) => kind === '' || movement.kind === kind)
      .map((movement) => {
        const product = names.get(movement.productId)
        return {
          id: movement.id,
          sku: product?.sku ?? '—',
          name: product?.name ?? 'Unknown product',
          kind: movement.kind,
          reason: movement.reason,
          quantity: formatQuantity(movement.quantity),
          unitCost: formatUnitValue(movement.unitCost),
          totalCost: formatMoney(movement.totalCost),
          onHandAfter: formatQuantity(movement.onHandAfter),
          occurredAt: movement.occurredAt.toISOString(),
          note: movement.note,
        }
      })
  })

  return (
    <>
      <PageHeader
        title="Stock movements"
        description="Append-only. A mistake is corrected by another movement, never by an edit."
      />

      <Card>
        <CardHeader>
          <CardTitle>
            {rows.length} movement{rows.length === 1 ? '' : 's'}
          </CardTitle>
          <FilterTabs
            paramName="kind"
            options={[
              { value: '', label: 'All' },
              { value: 'entry', label: 'Entries' },
              { value: 'exit', label: 'Exits' },
              { value: 'adjustment', label: 'Adjustments' },
            ]}
          />
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState
              icon={<PackageSearch className="size-5" />}
              title="No movements recorded"
              description="Stock changes appear here the moment they happen."
            />
          ) : (
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>When</TH>
                    <TH>Product</TH>
                    <TH>Kind</TH>
                    <TH>Reason</TH>
                    <TH numeric>Quantity</TH>
                    <TH numeric>Value</TH>
                    <TH numeric>On hand after</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((row) => (
                    <TR key={row.id}>
                      <TD className="text-xs whitespace-nowrap text-muted-foreground">
                        {formatDateTime(row.occurredAt, session.timeZone)}
                      </TD>
                      <TD className="max-w-56">
                        <span className="block truncate font-medium">{row.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{row.sku}</span>
                      </TD>
                      <TD>
                        <Badge tone={KIND_TONE[row.kind] ?? 'neutral'} className="capitalize">
                          {row.kind}
                        </Badge>
                      </TD>
                      <TD className="text-muted-foreground">
                        {REASON_LABEL[row.reason] ?? row.reason}
                        {row.note !== null ? (
                          <span className="block max-w-56 truncate text-xs">{row.note}</span>
                        ) : null}
                      </TD>
                      <TD
                        numeric
                        className={
                          row.quantity.startsWith('-') ? 'text-danger' : 'text-positive-foreground'
                        }
                      >
                        {row.quantity}
                      </TD>
                      <TD numeric className="text-muted-foreground">
                        {formatCurrency(row.totalCost)}
                      </TD>
                      <TD numeric>{row.onHandAfter}</TD>
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
