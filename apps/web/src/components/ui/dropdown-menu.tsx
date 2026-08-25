'use client'

import * as Primitive from '@radix-ui/react-dropdown-menu'
import type * as React from 'react'
import { cn } from '@/lib/utils'

export const DropdownMenu = Primitive.Root
export const DropdownMenuTrigger = Primitive.Trigger
export const DropdownMenuGroup = Primitive.Group

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof Primitive.Content>): React.JSX.Element {
  return (
    <Primitive.Portal>
      <Primitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-48 overflow-hidden rounded-lg border border-border bg-surface p-1',
          'shadow-[var(--shadow-overlay)]',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  )
}

export function DropdownMenuItem({
  className,
  tone = 'default',
  ...props
}: React.ComponentProps<typeof Primitive.Item> & {
  readonly tone?: 'default' | 'danger'
}): React.JSX.Element {
  return (
    <Primitive.Item
      className={cn(
        'relative flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none',
        'transition-colors duration-100 select-none',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        "[&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
        tone === 'danger'
          ? 'text-danger focus:bg-danger-subtle [&_svg]:text-danger'
          : 'focus:bg-accent focus:text-accent-foreground',
        className,
      )}
      {...props}
    />
  )
}

export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Label>): React.JSX.Element {
  return (
    <Primitive.Label
      className={cn('px-2.5 py-1.5 text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  )
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Separator>): React.JSX.Element {
  return <Primitive.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
}
