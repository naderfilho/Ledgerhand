import {
  addDays,
  formatMoney,
  formatQuantity,
  outstandingAmount,
  sumMoney,
  USE_CASES,
  ZERO_MONEY,
  type ExecutionContext,
} from '@ledgerhand/domain'
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  PackageX,
  Receipt,
  ShoppingCart,
  Wallet,
} from 'lucide-react'
import Link from 'next/link'
import type * as React from 'react'
import { NeuralBrain } from '@/components/app/neural-brain'
import { SalesTrend } from '@/components/app/sales-trend'
import { StatCard } from '@/components/app/stat-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/misc'
import { formatCurrency, formatDate, formatDueness } from '@/lib/format'
import { can, query, requireSession } from '@/server/context'
import { currentTranslator } from '@/server/locale'

export const dynamic = 'force-dynamic'

export default async function DashboardPage(): Promise<React.JSX.Element> {
  const session = await requireSession()
  const { t } = await currentTranslator()

  const data = await query(async (context: ExecutionContext) => {
    const currentContext = await USE_CASES.get_current_context.execute({}, context)
    if (!currentContext.ok) throw new Error(currentContext.error.message)
    const businessDate = currentContext.value.today

    const [cash, overdue, alerts, pendingOrders, trend] = await Promise.all([
      USE_CASES.get_cash_position.execute({}, context),
      USE_CASES.report_overdue_titles.execute({ limit: 100 }, context),
      USE_CASES.list_products_below_minimum.execute({}, context),
      USE_CASES.list_sales_orders.execute(
        { status: ['confirmed'], limit: 100, offset: 0 },
        context,
      ),
      USE_CASES.report_sales_by_period.execute(
        { from: addDays(businessDate, -29), to: businessDate, granularity: 'day' },
        context,
      ),
    ])

    const cashValue = cash.ok ? cash.value : null
    const overdueValue = overdue.ok ? overdue.value : null
    const alertRows = alerts.ok ? alerts.value : []
    const pending = pendingOrders.ok ? pendingOrders.value : { rows: [], total: 0 }
    const trendRows = trend.ok ? trend.value.rows : []

    return {
      businessDate,
      cash:
        cashValue === null
          ? null
          : {
              status: cashValue.session?.status ?? 'not_opened',
              opening: formatMoney(cashValue.session?.openingBalance ?? ZERO_MONEY),
              inflow: formatMoney(cashValue.session?.inflow ?? ZERO_MONEY),
              outflow: formatMoney(cashValue.session?.outflow ?? ZERO_MONEY),
              expected: formatMoney(cashValue.expectedClosing ?? ZERO_MONEY),
              unsettled: cashValue.unsettledTitles,
            },
      overdue:
        overdueValue === null
          ? null
          : {
              total: formatMoney(overdueValue.totalReceivable),
              count: overdueValue.receivables.length,
              payableTotal: formatMoney(overdueValue.totalPayable),
              payableCount: overdueValue.payables.length,
              worst: overdueValue.receivables.slice(0, 5).map(({ title, partyName }) => ({
                id: title.id,
                description: title.description,
                customer: partyName ?? 'Unknown customer',
                outstanding: formatMoney(outstandingAmount(title)),
                dueDate: title.dueDate,
              })),
            },
      alerts: alertRows.slice(0, 6).map((alert) => ({
        productId: alert.productId,
        sku: alert.sku,
        name: alert.name,
        onHand: formatQuantity(alert.onHand),
        minimum: formatQuantity(alert.minimumStock),
        shortfall: formatQuantity(alert.shortfall),
      })),
      alertCount: alertRows.length,
      pendingCount: pending.total,
      pendingValue: formatMoney(sumMoney(pending.rows.map(({ order }) => order.total))),
      trend: trendRows.map((row) => ({ period: row.period, net: formatMoney(row.net) })),
      revenue30: formatMoney(sumMoney(trendRows.map((row) => row.net))),
    }
  })

  const canSeeFinance = can(session, 'finance:read')
  const canSeeStock = can(session, 'stock:read')
  const canSeeSales = can(session, 'sales:read')

  return (
    <>
      {/* The first screen anybody sees, so it carries the claim as well as the
       * numbers. The field behind it is ambient rather than informative: what
       * it says is that the application is attached to something working, and
       * the link says where to go and watch that happen. */}
      <header className="relative overflow-hidden rounded-2xl border border-border bg-surface p-6 sm:p-8">
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl space-y-3">
            <p className="text-[0.6875rem] font-medium tracking-[0.14em] text-muted-foreground uppercase">
              {data.businessDate === '' ? null : formatDate(data.businessDate)}
            </p>
            <h1 className="font-display text-2xl leading-tight font-semibold tracking-tight text-balance sm:text-3xl">
              {t('Good to see you')}, {session.name.split(' ')[0]}
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              {t(
                'Here is what this company needs from you today. An agent can do part of it too, under rules this system enforces rather than asks for.',
              ).replace('this company', session.tenantName)}
            </p>
            <Link
              href="/agent"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition hover:text-primary-hover"
            >
              {t('Watch the agent work')}
              <ArrowUpRight className="size-4" />
            </Link>
          </div>
          <NeuralBrain
            state="idle"
            size={200}
            pointCount={320}
            className="hidden shrink-0 opacity-80 lg:block"
          />
          {data.cash !== null ? (
            <Badge tone={data.cash.status === 'open' ? 'info' : 'neutral'}>
              Cash {data.cash.status === 'not_opened' ? 'not opened' : data.cash.status}
            </Badge>
          ) : null}
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('Revenue, last 30 days')}
          value={formatCurrency(data.revenue30)}
          hint="Invoiced sales only"
          icon={<ArrowUpRight className="size-4" />}
          tone="positive"
          {...(canSeeSales ? { href: '/sales' } : {})}
        />
        {canSeeFinance && data.overdue !== null ? (
          <StatCard
            label={t('Overdue receivables')}
            value={formatCurrency(data.overdue.total)}
            hint={`${String(data.overdue.count)} title(s) past due`}
            icon={<Receipt className="size-4" />}
            tone={data.overdue.count > 0 ? 'danger' : 'positive'}
            href="/finance/receivables"
          />
        ) : null}
        {canSeeSales ? (
          <StatCard
            label={t('Awaiting invoicing')}
            value={String(data.pendingCount)}
            hint={`${formatCurrency(data.pendingValue)} confirmed, not yet invoiced`}
            icon={<ShoppingCart className="size-4" />}
            tone={data.pendingCount > 0 ? 'warning' : 'neutral'}
            href="/sales?status=confirmed"
          />
        ) : null}
        {canSeeStock ? (
          <StatCard
            label={t('Below minimum')}
            value={String(data.alertCount)}
            hint="Products needing replenishment"
            icon={<PackageX className="size-4" />}
            tone={data.alertCount > 0 ? 'warning' : 'positive'}
            href="/stock?below=1"
          />
        ) : null}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Invoiced sales</CardTitle>
              <p className="text-xs text-muted-foreground">Net revenue per day, last 30 days</p>
            </div>
            <Badge tone="primary">{formatCurrency(data.revenue30)}</Badge>
          </CardHeader>
          <CardBody className="pt-2">
            {data.trend.length === 0 ? (
              <EmptyState
                title="No invoiced sales in this window"
                description="Invoice a confirmed order and it will appear here."
              />
            ) : (
              <SalesTrend points={data.trend} />
            )}
          </CardBody>
        </Card>

        {canSeeFinance && data.cash !== null ? (
          <Card>
            <CardHeader>
              <CardTitle>Today&rsquo;s cash</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/finance/cash">
                  Open <ArrowUpRight className="size-3.5" />
                </Link>
              </Button>
            </CardHeader>
            <CardBody className="space-y-3">
              <CashRow label="Opening balance" value={data.cash.opening} icon={<Wallet />} />
              <CashRow label="Received" value={data.cash.inflow} tone="positive" />
              <CashRow label="Paid out" value={data.cash.outflow} tone="danger" />
              <div className="border-t border-border pt-3">
                <CashRow label="Expected closing" value={data.cash.expected} emphasis />
              </div>
              {data.cash.unsettled > 0 ? (
                <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-xs text-warning-foreground">
                  <AlertTriangle className="mt-px size-3.5 shrink-0" />
                  {data.cash.unsettled} title(s) due today are still unsettled. Closing the day will
                  require a justification.
                </p>
              ) : null}
            </CardBody>
          </Card>
        ) : null}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        {canSeeFinance && data.overdue !== null ? (
          <Card>
            <CardHeader>
              <CardTitle>Oldest overdue</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/finance/receivables?overdue=1">
                  All {data.overdue.count} <ArrowUpRight className="size-3.5" />
                </Link>
              </Button>
            </CardHeader>
            {data.overdue.worst.length === 0 ? (
              <EmptyState
                icon={<Banknote className="size-5" />}
                title="Nothing is overdue"
                description="Every title is either settled or not yet due."
              />
            ) : (
              <ul className="divide-hairline">
                {data.overdue.worst.map((title) => (
                  <li key={title.id} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{title.customer}</p>
                      <p className="truncate text-xs text-muted-foreground">{title.description}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular text-sm font-medium">
                        {formatCurrency(title.outstanding)}
                      </p>
                      <p className="text-xs text-danger">
                        {formatDueness(title.dueDate, data.businessDate)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}

        {canSeeStock ? (
          <Card>
            <CardHeader>
              <CardTitle>Needs replenishment</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/stock?below=1">
                  All {data.alertCount} <ArrowUpRight className="size-3.5" />
                </Link>
              </Button>
            </CardHeader>
            {data.alerts.length === 0 ? (
              <EmptyState
                icon={<PackageX className="size-5" />}
                title="Every product is above its minimum"
                description="Nothing needs buying today."
              />
            ) : (
              <ul className="divide-hairline">
                {data.alerts.map((alert) => (
                  <li
                    key={alert.productId}
                    className="flex items-center justify-between gap-4 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{alert.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{alert.sku}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular text-sm">
                        {alert.onHand}{' '}
                        <span className="text-muted-foreground">/ {alert.minimum}</span>
                      </p>
                      <p className="text-xs text-warning-foreground">short {alert.shortfall}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}
      </section>
    </>
  )
}

function CashRow({
  label,
  value,
  tone,
  emphasis = false,
  icon,
}: {
  readonly label: string
  readonly value: string
  readonly tone?: 'positive' | 'danger'
  readonly emphasis?: boolean
  readonly icon?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon !== undefined ? <span className="[&_svg]:size-3.5">{icon}</span> : null}
        {label}
      </span>
      <span
        className={
          'tabular text-sm ' +
          (emphasis ? 'font-semibold' : 'font-medium ') +
          (tone === 'positive'
            ? ' text-positive-foreground'
            : tone === 'danger'
              ? ' text-danger-foreground'
              : '')
        }
      >
        {formatCurrency(value)}
      </span>
    </div>
  )
}
