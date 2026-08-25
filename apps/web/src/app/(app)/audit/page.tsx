import { USE_CASES } from '@ledgerhand/domain'
import { Bot, ScrollText, User } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import type * as React from 'react'
import { FilterTabs } from '@/components/app/search-field'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, PageHeader } from '@/components/ui/misc'
import { formatDateTime } from '@/lib/format'
import { query, requireCapabilityOrRedirect } from '@/server/context'

export const metadata: Metadata = { title: 'Audit trail' }
export const dynamic = 'force-dynamic'

const AGGREGATE_TONE: Record<string, BadgeTone> = {
  sales_order: 'primary',
  purchase_order: 'info',
  stock: 'warning',
  receivable: 'positive',
  payable: 'danger',
  cash_session: 'info',
  fiscal_document: 'primary',
  product: 'neutral',
  customer: 'neutral',
  supplier: 'neutral',
}

/** Turns `sales_order.invoiced` into `Sales order invoiced`. */
function humanise(type: string): string {
  const words = type.replace('.', ' ').replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** The two or three payload fields worth showing in a list row. */
function summarise(payload: Readonly<Record<string, unknown>>): string {
  const interesting = ['number', 'sku', 'amount', 'total', 'quantity', 'reason', 'businessDate']
  const parts: string[] = []
  for (const key of interesting) {
    const value = payload[key]
    if (typeof value === 'string' && value !== '') parts.push(`${key} ${value}`)
    if (parts.length === 3) break
  }
  return parts.join(' · ')
}

export default async function AuditPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<React.JSX.Element> {
  const session = await requireCapabilityOrRedirect('audit:read')
  const params = await searchParams
  const actor = typeof params['actor'] === 'string' ? params['actor'] : ''
  // One agent run, from the id it stamped on everything it changed. This is
  // the question the whole audit trail exists to answer.
  const run = typeof params['run'] === 'string' ? params['run'] : ''

  const data = await query(async (context) => {
    const listed = await USE_CASES.list_domain_events.execute(
      {
        ...(run === '' ? {} : { agentRunId: run }),
        ...(actor === 'user' || actor === 'agent' || actor === 'system'
          ? { actorKind: actor }
          : {}),
        limit: 150,
        offset: 0,
      },
      context,
    )
    const counts = await context.uow.audit.countByActorKind()

    return {
      rows: listed.ok
        ? listed.value.rows.map((event) => ({
            id: event.id,
            type: event.type,
            aggregateType: event.aggregateType,
            summary: summarise(event.payload),
            actorKind: event.actorKind,
            agentRunId: event.agentRunId,
            occurredAt: event.occurredAt.toISOString(),
          }))
        : [],
      total: listed.ok ? listed.value.total : 0,
      counts,
    }
  })

  return (
    <>
      <PageHeader
        title="Audit trail"
        description="Every recorded fact, written in the same transaction as the change it describes. Nothing here can be edited or deleted -- the application role has no permission to."
      />

      {run === '' ? null : (
        <Card className="border-primary/40 bg-primary-subtle/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                Everything agent run <span className="font-mono">{run.slice(0, 8)}</span> changed
              </p>
              <p className="text-xs text-muted-foreground">
                {data.total} event{data.total === 1 ? '' : 's'}, each one recorded in the same
                transaction as the change, and each one still naming the person the agent acted for.
              </p>
            </div>
            <Link href="/audit" className="text-sm font-medium text-primary hover:underline">
              Show everything
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {data.total} event{data.total === 1 ? '' : 's'}
          </CardTitle>
          <FilterTabs
            paramName="actor"
            options={[
              { value: '', label: 'Everyone' },
              { value: 'user', label: 'People', count: data.counts['user'] ?? 0 },
              { value: 'agent', label: 'Agent', count: data.counts['agent'] ?? 0 },
            ]}
          />
        </CardHeader>

        <CardContent>
          {data.rows.length === 0 ? (
            <EmptyState
              icon={<ScrollText className="size-5" />}
              title="Nothing recorded yet"
              description="Events appear the moment anything changes."
            />
          ) : (
            <ol className="divide-hairline">
              {data.rows.map((event) => (
                <li key={event.id} className="flex items-start gap-3 px-5 py-3">
                  <span
                    className={
                      'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ' +
                      (event.actorKind === 'agent'
                        ? 'bg-primary-subtle text-primary'
                        : 'bg-muted text-muted-foreground')
                    }
                  >
                    {event.actorKind === 'agent' ? (
                      <Bot className="size-3.5" />
                    ) : (
                      <User className="size-3.5" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{humanise(event.type)}</p>
                      <Badge tone={AGGREGATE_TONE[event.aggregateType] ?? 'neutral'}>
                        {event.aggregateType.replace('_', ' ')}
                      </Badge>
                      {event.agentRunId === null ? null : (
                        <Link
                          href={`/audit?run=${event.agentRunId}`}
                          className="rounded-full"
                          title="Show everything this run changed"
                        >
                          <Badge tone="primary">run {event.agentRunId.slice(0, 8)}</Badge>
                        </Link>
                      )}
                    </div>
                    {event.summary !== '' ? (
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {event.summary}
                      </p>
                    ) : null}
                  </div>

                  <time className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                    {formatDateTime(event.occurredAt, session.timeZone)}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </>
  )
}
