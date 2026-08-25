import { USE_CASES, formatMoney, sumMoney } from '@ledgerhand/domain'
import { Plus, ShoppingCart } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import type * as React from 'react'
import { FilterTabs } from '@/components/app/search-field'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, PageHeader } from '@/components/ui/misc'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/format'
import { can, query, requireSession } from '@/server/context'
import { presentSalesOrder, salesOrderTone } from '@/server/present'

export const metadata: Metadata = { title: 'Sales orders' }
export const dynamic = 'force-dynamic'

const STATUSES = ['draft', 'confirmed', 'invoiced', 'cancelled'] as const
type Status = (typeof STATUSES)[number]

function parseStatus(value: unknown): Status | null {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value)
    ? (value as Status)
    : null
}

export default async function SalesPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<React.JSX.Element> {
  const session = await requireSession()
  const params = await searchParams
  const status = parseStatus(params['status'])

  const data = await query(async (context) => {
    const [listed, customers] = await Promise.all([
      USE_CASES.list_sales_orders.execute(
        { ...(status === null ? {} : { status: [status] }), limit: 100, offset: 0 },
        context,
      ),
      USE_CASES.list_customers.execute(
        { activeOnly: false, page: { limit: 500, offset: 0 } },
        context,
      ),
    ])

    const counts = await Promise.all(
      STATUSES.map(async (candidate) => {
        const result = await USE_CASES.list_sales_orders.execute(
          { status: [candidate], limit: 1, offset: 0 },
          context,
        )
        return [candidate, result.ok ? result.value.total : 0] as const
      }),
    )

    if (!listed.ok) return { rows: [], total: 0, value: '0.00', counts: Object.fromEntries(counts) }

    const names = new Map(
      (customers.ok ? customers.value.rows : []).map((customer) => [customer.id, customer.name]),
    )

    return {
      rows: listed.value.rows.map((order) =>
        presentSalesOrder(order, names.get(order.customerId) ?? 'Unknown customer'),
      ),
      total: listed.value.total,
      value: formatMoney(sumMoney(listed.value.rows.map((order) => order.total))),
      counts: Object.fromEntries(counts) as Record<Status, number>,
    }
  })

  const canCreate = can(session, 'sales:write')

  return (
    <>
      <PageHeader
        title="Sales orders"
        description="Draft, confirm to reserve the stock, invoice to ship it and raise the receivables."
        actions={
          canCreate ? (
            <Button variant="primary" asChild>
              <Link href="/sales/new">
                <Plus /> New order
              </Link>
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>
            {data.total} order{data.total === 1 ? '' : 's'} &middot;{' '}
            <span className="font-normal text-muted-foreground">{formatCurrency(data.value)}</span>
          </CardTitle>
          <FilterTabs
            paramName="status"
            options={[
              { value: '', label: 'All' },
              { value: 'draft', label: 'Draft', count: data.counts['draft'] },
              { value: 'confirmed', label: 'Confirmed', count: data.counts['confirmed'] },
              { value: 'invoiced', label: 'Invoiced', count: data.counts['invoiced'] },
              { value: 'cancelled', label: 'Cancelled', count: data.counts['cancelled'] },
            ]}
          />
        </CardHeader>

        <CardContent>
          {data.rows.length === 0 ? (
            <EmptyState
              icon={<ShoppingCart className="size-5" />}
              title={status === null ? 'No sales orders yet' : `No ${status} orders`}
              description="A draft order reserves nothing, so it always succeeds. Confirming it is where stock is checked."
              action={
                canCreate ? (
                  <Button variant="primary" asChild>
                    <Link href="/sales/new">
                      <Plus /> New order
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>Number</TH>
                    <TH>Customer</TH>
                    <TH>Issued</TH>
                    <TH>Status</TH>
                    <TH numeric>Lines</TH>
                    <TH numeric>Total</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.rows.map((order) => (
                    <TR key={order.id} interactive>
                      <TD className="font-mono text-xs">
                        <Link href={`/sales/${order.id}`} className="hover:underline">
                          {order.number}
                        </Link>
                      </TD>
                      <TD className="max-w-64">
                        <Link href={`/sales/${order.id}`} className="block truncate font-medium">
                          {order.customerName}
                        </Link>
                      </TD>
                      <TD className="text-muted-foreground">{formatDate(order.issuedOn)}</TD>
                      <TD>
                        <Badge tone={salesOrderTone(order.status)} className="capitalize">
                          {order.status}
                        </Badge>
                      </TD>
                      <TD numeric className="text-muted-foreground">
                        {order.itemCount}
                      </TD>
                      <TD numeric className="font-medium">
                        {formatCurrency(order.total)}
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
