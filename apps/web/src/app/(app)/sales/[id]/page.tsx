import { USE_CASES, formatMoney, outstandingAmount, sumMoney } from '@ledgerhand/domain'
import { ArrowLeft, CheckCircle2, FileCheck2, XCircle } from 'lucide-react'
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
import { formatCurrency, formatDate, formatDueness } from '@/lib/format'
import { can, query, requireSession } from '@/server/context'
import {
  presentFiscalDocument,
  presentSalesOrder,
  presentTitle,
  salesOrderTone,
  titleTone,
} from '@/server/present'

export const metadata: Metadata = { title: 'Sales order' }
export const dynamic = 'force-dynamic'

export default async function SalesOrderPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>
}): Promise<React.JSX.Element> {
  const session = await requireSession()
  const { id } = await params

  const data = await query(async (context) => {
    const found = await USE_CASES.get_sales_order.execute({ orderId: id }, context)
    if (!found.ok) return null

    const today = await USE_CASES.get_current_context.execute({}, context)
    const businessDate = today.ok ? today.value.today : ''

    return {
      order: presentSalesOrder(found.value.order, found.value.customer?.name ?? 'Unknown customer'),
      receivables: found.value.receivables.map((title) =>
        presentTitle(title, found.value.customer?.name ?? '', businessDate),
      ),
      document:
        found.value.fiscalDocument === null
          ? null
          : presentFiscalDocument(found.value.fiscalDocument),
      businessDate,
      receivableTotal: formatMoney(sumMoney(found.value.receivables.map(outstandingAmount))),
    }
  })

  if (data === null) notFound()
  const { order } = data

  const canConfirm = can(session, 'sales:write') && order.status === 'draft'
  const canInvoice = can(session, 'sales:invoice') && order.status === 'confirmed'
  const canCancel =
    can(session, 'sales:cancel') && order.status !== 'cancelled' && order.status !== 'invoiced'
  const canReverse = can(session, 'sales:cancel') && order.status === 'invoiced'

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href="/sales">
              <ArrowLeft className="size-3.5" /> Sales orders
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-mono text-xl font-semibold tracking-tight">{order.number}</h1>
            <Badge tone={salesOrderTone(order.status)} className="capitalize">
              {order.status}
            </Badge>
            {data.document !== null ? (
              <Badge tone={data.document.status === 'issued' ? 'primary' : 'neutral'}>
                {data.document.status === 'issued' ? 'Invoice' : 'Voided'} {data.document.label}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {order.customerName} &middot; issued {formatDate(order.issuedOn)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canConfirm ? (
            <ConfirmOperation
              operation="confirm_sales_order"
              input={{ orderId: order.id }}
              title="Confirm this order"
              confirmLabel="Confirm and reserve stock"
              destructive={false}
              successMessage={`${order.number} confirmed.`}
              trigger={
                <Button variant="primary">
                  <CheckCircle2 /> Confirm
                </Button>
              }
            />
          ) : null}

          {canInvoice ? (
            <ConfirmOperation
              operation="invoice_sales_order"
              input={{ orderId: order.id }}
              title="Invoice this order"
              confirmLabel="Issue the invoice"
              successMessage={`${order.number} invoiced.`}
              trigger={
                <Button variant="primary">
                  <FileCheck2 /> Invoice
                </Button>
              }
            />
          ) : null}

          {canCancel ? (
            <ConfirmOperation
              operation="cancel_sales_order"
              input={{ orderId: order.id }}
              title="Cancel this order"
              confirmLabel="Cancel order"
              reasonField={{ key: 'reason', label: 'Reason', hint: 'Optional for a draft.' }}
              successMessage={`${order.number} cancelled.`}
              trigger={
                <Button variant="outlineDestructive">
                  <XCircle /> Cancel
                </Button>
              }
            />
          ) : null}

          {canReverse ? (
            <ConfirmOperation
              operation="cancel_sales_order"
              input={{ orderId: order.id }}
              title="Reverse this invoice"
              confirmLabel="Reverse the invoice"
              reasonField={{
                key: 'reason',
                label: 'Why is it being reversed?',
                hint: 'Required. Somebody will have to explain the gap in the fiscal series.',
              }}
              successMessage={`${order.number} reversed.`}
              trigger={
                <Button variant="outlineDestructive">
                  <XCircle /> Reverse
                </Button>
              }
            />
          ) : null}
        </div>
      </div>

      {order.cancellationReason !== null ? (
        <div className="rounded-lg border border-danger/30 bg-danger-subtle px-4 py-3 text-sm text-danger-foreground">
          <span className="font-medium">Cancelled.</span> {order.cancellationReason}
        </div>
      ) : null}

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
                    <TH numeric>Qty</TH>
                    <TH numeric>Unit price</TH>
                    <TH numeric>Discount</TH>
                    <TH numeric>Total</TH>
                  </TR>
                </THead>
                <TBody>
                  {order.items.map((item) => (
                    <TR key={item.id}>
                      <TD className="font-mono text-xs">{item.sku}</TD>
                      <TD className="max-w-64 truncate">{item.description}</TD>
                      <TD numeric>{item.quantity}</TD>
                      <TD numeric className="text-muted-foreground">
                        {formatCurrency(item.unitPrice)}
                      </TD>
                      <TD numeric className="text-muted-foreground">
                        {item.discount === '0.00' ? '—' : formatCurrency(item.discount)}
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

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="grid grid-cols-2 gap-4">
                <DetailItem label="Customer">{order.customerName}</DetailItem>
                <DetailItem label="Issued on">{formatDate(order.issuedOn)}</DetailItem>
                <DetailItem label="Instalments">{order.instalments}</DetailItem>
                <DetailItem label="Lines">{order.itemCount}</DetailItem>
                {order.notes !== null ? (
                  <DetailItem label="Notes" className="col-span-2">
                    {order.notes}
                  </DetailItem>
                ) : null}
              </dl>
            </CardBody>
          </Card>

          {data.receivables.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Receivables</CardTitle>
                <span className="tabular text-xs text-muted-foreground">
                  {formatCurrency(data.receivableTotal)} outstanding
                </span>
              </CardHeader>
              <ul className="divide-hairline">
                {data.receivables.map((title) => (
                  <li key={title.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {title.instalments > 1
                          ? `Instalment ${String(title.instalment)}/${String(title.instalments)}`
                          : 'Single instalment'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        due {formatDate(title.dueDate)} &middot;{' '}
                        {formatDueness(title.dueDate, data.businessDate)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular text-sm font-medium">{formatCurrency(title.amount)}</p>
                      <Badge tone={titleTone(title)} className="mt-0.5 capitalize">
                        {title.overdue ? 'overdue' : title.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  )
}
