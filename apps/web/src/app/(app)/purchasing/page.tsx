import { USE_CASES, formatMoney, sumMoney } from '@ledgerhand/domain'
import { ClipboardList } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import type * as React from 'react'
import { FilterTabs } from '@/components/app/search-field'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, PageHeader } from '@/components/ui/misc'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/format'
import { query, requireCapabilityOrRedirect } from '@/server/context'
import { presentPurchaseOrder, purchaseOrderTone } from '@/server/present'

export const metadata: Metadata = { title: 'Purchase orders' }
export const dynamic = 'force-dynamic'

const STATUSES = ['draft', 'placed', 'partially_received', 'received', 'cancelled'] as const
type Status = (typeof STATUSES)[number]

export default async function PurchasingPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<React.JSX.Element> {
  await requireCapabilityOrRedirect('purchase:read')
  const params = await searchParams
  const raw = typeof params['status'] === 'string' ? params['status'] : ''
  const status = (STATUSES as readonly string[]).includes(raw) ? (raw as Status) : null

  const data = await query(async (context) => {
    const [listed, suppliers] = await Promise.all([
      USE_CASES.list_purchase_orders.execute(
        { ...(status === null ? {} : { status: [status] }), limit: 100, offset: 0 },
        context,
      ),
      USE_CASES.list_suppliers.execute(
        { activeOnly: false, page: { limit: 200, offset: 0 } },
        context,
      ),
    ])

    if (!listed.ok) return { rows: [], total: 0, value: '0.00' }

    const names = new Map(
      (suppliers.ok ? suppliers.value.rows : []).map((supplier) => [supplier.id, supplier.name]),
    )

    return {
      rows: listed.value.rows.map((order) =>
        presentPurchaseOrder(order, names.get(order.supplierId) ?? 'Unknown supplier'),
      ),
      total: listed.value.total,
      value: formatMoney(sumMoney(listed.value.rows.map((order) => order.total))),
    }
  })

  return (
    <>
      <PageHeader
        title="Purchase orders"
        description="Place an order, then receive it. Receiving is what creates stock and the payable."
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
              { value: 'placed', label: 'Placed' },
              { value: 'partially_received', label: 'Partial' },
              { value: 'received', label: 'Received' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
          />
        </CardHeader>

        <CardContent>
          {data.rows.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="size-5" />}
              title="No purchase orders here"
              description="Nothing has been ordered in this state."
            />
          ) : (
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>Number</TH>
                    <TH>Supplier</TH>
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
                        <Link href={`/purchasing/${order.id}`} className="hover:underline">
                          {order.number}
                        </Link>
                      </TD>
                      <TD className="max-w-64">
                        <Link
                          href={`/purchasing/${order.id}`}
                          className="block truncate font-medium"
                        >
                          {order.supplierName}
                        </Link>
                      </TD>
                      <TD className="text-muted-foreground">{formatDate(order.issuedOn)}</TD>
                      <TD>
                        <Badge tone={purchaseOrderTone(order.status)} className="capitalize">
                          {order.status.replace('_', ' ')}
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
