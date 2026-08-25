'use client'

import * as LabelPrimitive from '@radix-ui/react-label'
import type * as React from 'react'
import { cn } from '@/lib/utils'

const controlClasses = cn(
  'w-full rounded-md border border-input bg-surface px-3 text-sm shadow-xs',
  'placeholder:text-muted-foreground/70',
  'transition-[border-color,box-shadow] duration-150',
  'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:outline-none',
  'disabled:cursor-not-allowed disabled:opacity-60',
  'aria-invalid:border-danger aria-invalid:ring-danger/20',
)

export function Input({ className, ...props }: React.ComponentProps<'input'>): React.JSX.Element {
  return <input className={cn(controlClasses, 'h-9', className)} {...props} />
}

export function Textarea({
  className,
  ...props
}: React.ComponentProps<'textarea'>): React.JSX.Element {
  return <textarea className={cn(controlClasses, 'min-h-20 py-2', className)} {...props} />
}

export function NativeSelect({
  className,
  ...props
}: React.ComponentProps<'select'>): React.JSX.Element {
  return (
    <select
      className={cn(controlClasses, 'h-9 appearance-none bg-no-repeat pr-8', className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundPosition: 'right 0.6rem center',
        backgroundSize: '1rem',
      }}
      {...props}
    />
  )
}

export function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>): React.JSX.Element {
  return (
    <LabelPrimitive.Root
      className={cn(
        'text-xs font-medium text-foreground select-none',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
        className,
      )}
      {...props}
    />
  )
}

export interface FieldProps {
  readonly label: string
  readonly htmlFor?: string
  readonly hint?: string | undefined
  readonly error?: string | undefined
  readonly required?: boolean
  readonly className?: string
  readonly children: React.ReactNode
}

/**
 * Label, control, hint and error in one stack. The error is announced rather
 * than merely coloured -- a red border alone tells a screen reader nothing.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required = false,
  className,
  children,
}: FieldProps): React.JSX.Element {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </Label>
      {children}
      {error !== undefined && error !== '' ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint !== undefined ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
