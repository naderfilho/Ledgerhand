import { USE_CASES } from '@ledgerhand/domain'
import { ArrowLeft, PackageCheck, Send, XCircle } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type * as React from 'react'
import { ConfirmOperation } from '@/components/app/confirm-operation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DetailItem } from '@/components/ui/misc'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/format'
import { can, query, requireCapabilityOrRedirect } from '@/server/context'
import { presentPurchaseOrder, purchaseOrderTone } from '@/server/present'

export const metadata: Metadata = { title: 'Purchase order' }
export const dynamic = 'force-dynamic'

export default async function PurchaseOrderPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>
}): Promise<React.JSX.Element> {
  const session = await requireCapabilityOrRedirect('purchase:read')
  const { id } = await params

  const order = await query(async (context) => {
    const found = await USE_CASES.get_purchase_order.execute({ orderId: id }, context)
    if (!found.ok) return null
    return presentPurchaseOrder(found.value.order, found.value.supplier?.name ?? 'Unknown supplier')
  })

  if (order === null) notFound()

  const canWrite = can(session, 'purchase:write')
  const canCancel = can(session, 'purchase:cancel')
  const receivable = order.status === 'placed' || order.status === 'partially_received'

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href="/purchasing">
              <ArrowLeft className="size-3.5" /> Purchase orders
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-mono text-xl font-semibold tracking-tight">{order.number}</h1>
            <Badge tone={purchaseOrderTone(order.status)} className="capitalize">
              {order.status.replace('_', ' ')}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {order.supplierName} &middot; issued {formatDate(order.issuedOn)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canWrite && order.status === 'draft' ? (
            <ConfirmOperation
              operation="place_purchase_order"
              input={{ orderId: order.id }}
              title="Place this order"
              confirmLabel="Place the order"
              destructive={false}
              successMessage={`${order.number} placed.`}
              trigger={
                <Button variant="primary">
                  <Send /> Place
                </Button>
              }
            />
          ) : null}

          {canWrite && receivable ? (
            <ConfirmOperation
              operation="receive_purchase_order"
              input={{ orderId: order.id }}
              title="Receive everything outstanding"
              confirmLabel="Receive the delivery"
              destructive={false}
              successMessage={`${order.number} received.`}
              trigger={
                <Button variant="primary">
                  <PackageCheck /> Receive all
                </Button>
              }
            />
          ) : null}

          {canCancel && (order.status === 'draft' || order.status === 'placed') ? (
            <ConfirmOperation
              operation="cancel_purchase_order"
              input={{ orderId: order.id }}
              title="Cancel this order"
              confirmLabel="Cancel order"
              reasonField={{ key: 'reason', label: 'Reason', hint: 'Required.' }}
              successMessage={`${order.number} cancelled.`}
              trigger={
                <Button variant="outlineDestructive">
                  <XCircle /> Cancel
                </Button>
              }
            />
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
            <span className="tabular text-sm font-semibold">{formatCurrency(order.total)}</span>
          </CardHeader>
          <CardContent>
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>SKU</TH>
                    <TH>Description</TH>
                    <TH numeric>Ordered</TH>
                    <TH numeric>Received</TH>
                    <TH numeric>Outstanding</TH>
                    <TH numeric>Unit cost</TH>
                    <TH numeric>Total</TH>
                  </TR>
                </THead>
                <TBody>
                  {order.items.map((item) => (
                    <TR key={item.id}>
                      <TD className="font-mono text-xs">{item.sku}</TD>
                      <TD className="max-w-56 truncate">{item.description}</TD>
                      <TD numeric>{item.quantity}</TD>
                      <TD numeric className="text-positive-foreground">
                        {item.receivedQuantity}
                      </TD>
                      <TD
                        numeric
                        className={item.outstanding === '0' ? 'text-muted-foreground' : ''}
                      >
                        {item.outstanding}
                      </TD>
                      <TD numeric className="text-muted-foreground">
                        {formatCurrency(item.unitCost)}
                      </TD>
                      <TD numeric className="font-medium">
                        {formatCurrency(item.total)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-2 gap-4">
              <DetailItem label="Supplier">{order.supplierName}</DetailItem>
              <DetailItem label="Issued on">{formatDate(order.issuedOn)}</DetailItem>
              <DetailItem label="Expected">
                {order.expectedOn === null ? '—' : formatDate(order.expectedOn)}
              </DetailItem>
              <DetailItem label="Lines">{order.itemCount}</DetailItem>
              {order.notes !== null ? (
                <DetailItem label="Notes" className="col-span-2">
                  {order.notes}
                </DetailItem>
              ) : null}
            </dl>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
