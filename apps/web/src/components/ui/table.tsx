import type * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Tables are the primary interface of an ERP, so they get the attention a
 * marketing hero would get elsewhere: a sticky header, 44px rows, hairline
 * separators rather than zebra striping, and numeric columns right-aligned
 * with tabular figures so decimal points line up down the page.
 */
export function TableWrapper({
  className,
  ...props
}: React.ComponentProps<'div'>): React.JSX.Element {
  return <div className={cn('w-full overflow-x-auto', className)} {...props} />
}

export function Table({ className, ...props }: React.ComponentProps<'table'>): React.JSX.Element {
  return (
    <table className={cn('w-full caption-bottom border-collapse text-sm', className)} {...props} />
  )
}

export function THead({ className, ...props }: React.ComponentProps<'thead'>): React.JSX.Element {
  return (
    <thead
      className={cn('sticky top-0 z-10 bg-surface-sunken/95 backdrop-blur-sm', className)}
      {...props}
    />
  )
}

export function TBody({ className, ...props }: React.ComponentProps<'tbody'>): React.JSX.Element {
  return <tbody className={cn('', className)} {...props} />
}

export function TR({
  className,
  interactive = false,
  ...props
}: React.ComponentProps<'tr'> & { readonly interactive?: boolean }): React.JSX.Element {
  return (
    <tr
      className={cn(
        'border-b border-border last:border-0',
        interactive && 'cursor-pointer transition-colors duration-100 hover:bg-accent/60',
        className,
      )}
      {...props}
    />
  )
}

export function TH({
  className,
  numeric = false,
  ...props
}: React.ComponentProps<'th'> & { readonly numeric?: boolean }): React.JSX.Element {
  return (
    <th
      scope="col"
      className={cn(
        'h-9 border-b border-border px-4 text-left align-middle',
        'text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase',
        numeric && 'text-right',
        className,
      )}
      {...props}
    />
  )
}

export function TD({
  className,
  numeric = false,
  ...props
}: React.ComponentProps<'td'> & { readonly numeric?: boolean }): React.JSX.Element {
  return (
    <td
      className={cn('h-11 px-4 align-middle', numeric && 'text-right tabular', className)}
      {...props}
    />
  )
}

export function TableEmpty({
  colSpan,
  children,
}: {
  readonly colSpan: number
  readonly children: React.ReactNode
}): React.JSX.Element {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-14 text-center text-sm text-muted-foreground">
        {children}
      </td>
    </tr>
  )
}
