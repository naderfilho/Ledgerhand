import type * as React from 'react'
import { cn } from '@/lib/utils'

export function Card({ className, ...props }: React.ComponentProps<'section'>): React.JSX.Element {
  return <section className={cn('surface-card overflow-hidden', className)} {...props} />
}

export function CardHeader({
  className,
  ...props
}: React.ComponentProps<'header'>): React.JSX.Element {
  return (
    <header
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5',
        className,
      )}
      {...props}
    />
  )
}

export function CardTitle({ className, ...props }: React.ComponentProps<'h2'>): React.JSX.Element {
  return <h2 className={cn('text-sm font-semibold tracking-tight', className)} {...props} />
}

export function CardDescription({
  className,
  ...props
}: React.ComponentProps<'p'>): React.JSX.Element {
  return <p className={cn('text-xs text-muted-foreground', className)} {...props} />
}

export function CardBody({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return <div className={cn('px-5 py-4', className)} {...props} />
}

/** For content that provides its own padding, such as a table. */
export function CardContent({
  className,
  ...props
}: React.ComponentProps<'div'>): React.JSX.Element {
  return <div className={cn(className)} {...props} />
}

export function CardFooter({
  className,
  ...props
}: React.ComponentProps<'footer'>): React.JSX.Element {
  return (
    <footer
      className={cn(
        'flex items-center justify-between gap-3 border-t border-border bg-surface-sunken px-5 py-3',
        className,
      )}
      {...props}
    />
  )
}
