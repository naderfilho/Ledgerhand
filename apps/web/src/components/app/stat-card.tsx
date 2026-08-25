import Link from 'next/link'
import type * as React from 'react'
import { cn } from '@/lib/utils'

export interface StatCardProps {
  readonly label: string
  readonly value: string
  readonly hint?: string
  readonly icon?: React.ReactNode
  readonly tone?: 'neutral' | 'positive' | 'warning' | 'danger' | 'info'
  readonly href?: string
}

const TONE_RING: Record<NonNullable<StatCardProps['tone']>, string> = {
  neutral: 'bg-muted text-muted-foreground',
  positive: 'bg-positive-subtle text-positive-foreground',
  warning: 'bg-warning-subtle text-warning-foreground',
  danger: 'bg-danger-subtle text-danger-foreground',
  info: 'bg-info-subtle text-info-foreground',
}

/**
 * A number somebody acts on. Every stat on the dashboard links to the screen
 * where the action lives, because a figure with no next step is decoration.
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
  href,
}: StatCardProps): React.JSX.Element {
  const body = (
    <div
      className={cn(
        'surface-card flex h-full flex-col gap-3 p-4 transition-shadow duration-200',
        href !== undefined && 'hover:shadow-[var(--shadow-raised)]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {icon !== undefined ? (
          <span
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-md',
              TONE_RING[tone],
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <div className="space-y-0.5">
        <p className="tabular text-xl font-semibold tracking-tight">{value}</p>
        {hint !== undefined ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  )

  return href === undefined ? body : <Link href={href}>{body}</Link>
}
