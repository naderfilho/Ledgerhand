import { USE_CASES, addDays, formatMoney, ZERO_MONEY } from '@ledgerhand/domain'
import { Lock, Wallet } from 'lucide-react'
import type { Metadata } from 'next'
import type * as React from 'react'
import { ConfirmOperation } from '@/components/app/confirm-operation'
import { StatCard } from '@/components/app/stat-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, PageHeader } from '@/components/ui/misc'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/format'
import { can, query, requireCapabilityOrRedirect } from '@/server/context'

export const metadata: Metadata = { title: 'Daily cash' }
export const dynamic = 'force-dynamic'

export default async function CashPage(): Promise<React.JSX.Element> {
  const session = await requireCapabilityOrRedirect('finance:read')

  const data = await query(async (context) => {
    const today = await USE_CASES.get_current_context.execute({}, context)
    if (!today.ok) throw new Error(today.error.message)
    const businessDate = today.value.today

    const [position, flow] = await Promise.all([
      USE_CASES.get_cash_position.execute({}, context),
      USE_CASES.report_cash_flow.execute(
        { from: addDays(businessDate, -13), to: businessDate },
        context,
      ),
    ])

    const cashSession = position.ok ? position.value.session : null

    return {
      businessDate,
      status: cashSession?.status ?? 'not_opened',
      opening: formatMoney(cashSession?.openingBalance ?? ZERO_MONEY),
      inflow: formatMoney(cashSession?.inflow ?? ZERO_MONEY),
      outflow: formatMoney(cashSession?.outflow ?? ZERO_MONEY),
      expected: formatMoney(
        position.ok ? (position.value.expectedClosing ?? ZERO_MONEY) : ZERO_MONEY,
      ),
      unsettled: position.ok ? position.value.unsettledTitles : 0,
      justification: cashSession?.justification ?? null,
      history: (flow.ok ? flow.value.rows : []).map((row) => ({
        businessDate: row.businessDate,
        opening: formatMoney(row.openingBalance),
        inflow: formatMoney(row.inflow),
        outflow: formatMoney(row.outflow),
        closing: formatMoney(row.closingBalance),
        status: row.status,
      })),
    }
  })

  const canClose = can(session, 'finance:close-cash')
  const canOpen = can(session, 'finance:settle')

  return (
    <>
      <PageHeader
        title="Daily cash"
        description="One session per day. Closing it freezes the day, which is what makes the closing balance mean something."
        actions={
          data.status === 'not_opened' && canOpen ? (
            <ConfirmOperation
              operation="open_cash_session"
              input={{}}
              title="Open today's cash"
              confirmLabel="Open the day"
              destructive={false}
              successMessage="Cash opened."
              trigger={
                <Button variant="primary">
                  <Wallet /> Open the day
                </Button>
              }
            />
          ) : data.status === 'open' && canClose ? (
            <ConfirmOperation
              operation="close_daily_cash"
              input={{}}
              title="Close today's cash"
              confirmLabel="Close the day"
              successMessage="Cash closed."
              {...(data.unsettled > 0
                ? {
                    reasonField: {
                      key: 'justification',
                      label: 'Why are titles still unsettled?',
                      hint: 'Required while any title due today is still open.',
                    },
                  }
                : {})}
              trigger={
                <Button variant="primary">
                  <Lock /> Close the day
                </Button>
              }
            />
          ) : undefined
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Opening balance"
          value={formatCurrency(data.opening)}
          hint={formatDate(data.businessDate)}
        />
        <StatCard
          label="Received"
          value={formatCurrency(data.inflow)}
          tone="positive"
          hint="Settlements in"
        />
        <StatCard
          label="Paid out"
          value={formatCurrency(data.outflow)}
          tone="danger"
          hint="Settlements out"
        />
        <StatCard
          label={data.status === 'closed' ? 'Closing balance' : 'Expected closing'}
          value={formatCurrency(data.expected)}
          hint={
            data.status === 'closed'
              ? 'The day is frozen'
              : data.status === 'open'
                ? 'Still moving'
                : 'The day has not been opened'
          }
          tone={data.status === 'closed' ? 'neutral' : 'info'}
        />
      </section>

      {data.status === 'open' && data.unsettled > 0 ? (
        <div className="rounded-lg border border-warning/30 bg-warning-subtle px-4 py-3 text-sm text-warning-foreground">
          <span className="font-medium">
            {data.unsettled} title(s) due today are still unsettled.
          </span>{' '}
          The day can still be closed, but the domain will require a justification and record it
          against the session.
        </div>
      ) : null}

      {data.justification !== null ? (
        <div className="rounded-lg border border-border bg-surface-sunken px-4 py-3 text-sm">
          <span className="font-medium">Justification on record.</span> {data.justification}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Last fourteen days</CardTitle>
          <Badge tone={data.status === 'open' ? 'info' : 'neutral'} className="capitalize">
            today: {data.status.replace('_', ' ')}
          </Badge>
        </CardHeader>
        <CardContent>
          {data.history.length === 0 ? (
            <EmptyState
              icon={<Wallet className="size-5" />}
              title="No cash sessions yet"
              description="Open the day to start recording settlements against it."
            />
          ) : (
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>Day</TH>
                    <TH>Status</TH>
                    <TH numeric>Opening</TH>
                    <TH numeric>In</TH>
                    <TH numeric>Out</TH>
                    <TH numeric>Closing</TH>
                  </TR>
                </THead>
                <TBody>
                  {[...data.history].reverse().map((row) => (
                    <TR key={row.businessDate}>
                      <TD className="whitespace-nowrap">{formatDate(row.businessDate)}</TD>
                      <TD>
                        <Badge tone={row.status === 'open' ? 'info' : 'neutral'}>
                          {row.status}
                        </Badge>
                      </TD>
                      <TD numeric className="text-muted-foreground">
                        {formatCurrency(row.opening)}
                      </TD>
                      <TD numeric className="text-positive-foreground">
                        {formatCurrency(row.inflow)}
                      </TD>
                      <TD numeric className="text-danger-foreground">
                        {formatCurrency(row.outflow)}
                      </TD>
                      <TD numeric className="font-medium">
                        {formatCurrency(row.closing)}
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
