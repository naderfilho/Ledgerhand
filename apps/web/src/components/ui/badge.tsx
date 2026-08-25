import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * State, not decoration. Every badge in this application means something a
 * user can act on: an order waiting to be invoiced, a title past due, a day
 * still open. The subtle washes keep a dense table readable -- forty saturated
 * pills on one screen is noise.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-muted text-muted-foreground',
        primary: 'border-primary/25 bg-primary-subtle text-primary',
        positive: 'border-positive/25 bg-positive-subtle text-positive-foreground',
        warning: 'border-warning/30 bg-warning-subtle text-warning-foreground',
        danger: 'border-danger/25 bg-danger-subtle text-danger-foreground',
        info: 'border-info/25 bg-info-subtle text-info-foreground',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>

export function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>): React.JSX.Element {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}

/** A 6px dot, for status shown next to a label rather than inside a pill. */
export function StatusDot({ tone }: { readonly tone: BadgeTone }): React.JSX.Element {
  const colour: Record<BadgeTone, string> = {
    neutral: 'bg-muted-foreground',
    primary: 'bg-primary',
    positive: 'bg-positive',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
  }
  return <span className={cn('size-1.5 shrink-0 rounded-full', colour[tone])} aria-hidden />
}
