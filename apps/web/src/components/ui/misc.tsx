import * as SeparatorPrimitive from '@radix-ui/react-separator'
import type * as React from 'react'
import { cn } from '@/lib/utils'

export function Separator({
  className,
  orientation = 'horizontal',
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>): React.JSX.Element {
  return (
    <SeparatorPrimitive.Root
      decorative
      orientation={orientation}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  )
}

export function Skeleton({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />
}

export interface EmptyStateProps {
  readonly icon?: React.ReactNode
  readonly title: string
  readonly description?: string
  readonly action?: React.ReactNode
  readonly className?: string
}

/**
 * An empty table is a question, not a dead end: it says what would fill it and
 * offers the action that does.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps): React.JSX.Element {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-16 text-center', className)}>
      {icon !== undefined ? (
        <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {description !== undefined ? (
          <p className="mx-auto max-w-sm text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}

export interface PageHeaderProps {
  readonly title: string
  readonly description?: string
  readonly actions?: React.ReactNode
  readonly breadcrumb?: React.ReactNode
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: PageHeaderProps): React.JSX.Element {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        {breadcrumb}
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description !== undefined ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions !== undefined ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  )
}

/** A labelled value, for detail panels where a table would be overkill. */
export function DetailItem({
  label,
  children,
  className,
}: {
  readonly label: string
  readonly children: React.ReactNode
  readonly className?: string
}): React.JSX.Element {
  return (
    <div className={cn('space-y-1', className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  )
}
