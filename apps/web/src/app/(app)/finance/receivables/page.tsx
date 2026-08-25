import { USE_CASES, formatMoney, outstandingAmount, sumMoney } from '@ledgerhand/domain'
import type { Metadata } from 'next'
import type * as React from 'react'
import { TitlesPage } from '@/components/finance/titles-page'
import { can, query, requireCapabilityOrRedirect } from '@/server/context'
import { presentTitle } from '@/server/present'

export const metadata: Metadata = { title: 'Receivables' }
export const dynamic = 'force-dynamic'

export default async function ReceivablesPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<React.JSX.Element> {
  const session = await requireCapabilityOrRedirect('finance:read')
  const params = await searchParams
  const filter = typeof params['filter'] === 'string' ? params['filter'] : ''

  const data = await query(async (context) => {
    const today = await USE_CASES.get_current_context.execute({}, context)
    const businessDate = today.ok ? today.value.today : ''

    const [all, customers] = await Promise.all([
      USE_CASES.list_receivables.execute(
        {
          ...(filter === 'all' ? {} : { status: ['open', 'partially_settled'] as const }),
          overdueOnly: false,
          limit: 200,
          offset: 0,
        },
        context,
      ),
      USE_CASES.list_customers.execute(
        { activeOnly: false, page: { limit: 500, offset: 0 } },
        context,
      ),
    ])

    if (!all.ok) {
      return {
        rows: [],
        businessDate,
        totals: {
          outstanding: '0.00',
          overdue: '0.00',
          overdueCount: 0,
          dueToday: '0.00',
          dueTodayCount: 0,
        },
      }
    }

    const names = new Map(
      (customers.ok ? customers.value.rows : []).map((customer) => [customer.id, customer.name]),
    )

    const open = all.value.rows.filter(
      (title) => title.status === 'open' || title.status === 'partially_settled',
    )
    const overdue = open.filter((title) => title.dueDate < businessDate)
    const dueToday = open.filter((title) => title.dueDate === businessDate)

    const visible = all.value.rows.filter((title) => {
      if (filter === 'overdue') return title.dueDate < businessDate && open.includes(title)
      if (filter === 'today') return title.dueDate === businessDate && open.includes(title)
      return true
    })

    return {
      rows: visible.map((title) =>
        presentTitle(title, names.get(title.customerId) ?? 'Unknown customer', businessDate),
      ),
      businessDate,
      totals: {
        outstanding: formatMoney(sumMoney(open.map(outstandingAmount))),
        overdue: formatMoney(sumMoney(overdue.map(outstandingAmount))),
        overdueCount: overdue.length,
        dueToday: formatMoney(sumMoney(dueToday.map(outstandingAmount))),
        dueTodayCount: dueToday.length,
      },
    }
  })

  return (
    <TitlesPage
      kind="receivable"
      rows={data.rows}
      businessDate={data.businessDate}
      totals={data.totals}
      canSettle={can(session, 'finance:settle')}
    />
  )
}
