import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import type * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * One accent colour, used for the single action that matters on a screen.
 * Everything else is quiet, because a toolbar where six buttons all shout is a
 * toolbar where none of them is read.
 *
 * `destructive` is visually distinct on purpose: it is the same word the
 * domain uses for operations that cannot be undone, and the two should look
 * related to somebody who reads both.
 */
const buttonVariants = cva(
  cn(
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md',
    'text-sm font-medium outline-none transition-[background-color,border-color,box-shadow,transform]',
    'duration-150 ease-out active:translate-y-px',
    'disabled:pointer-events-none disabled:opacity-50',
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
  ),
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover',
        secondary:
          'border border-border bg-surface text-foreground shadow-xs hover:bg-accent hover:border-border-strong',
        ghost: 'text-muted-foreground hover:bg-accent hover:text-foreground',
        destructive: 'bg-danger text-white shadow-xs hover:brightness-95',
        outlineDestructive:
          'border border-danger/40 text-danger hover:bg-danger-subtle hover:border-danger/60',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-2.5 text-xs',
        md: 'h-9 px-3.5',
        lg: 'h-10 px-5',
        icon: 'size-9',
        iconSm: 'size-8',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export interface ButtonProps
  extends React.ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  readonly asChild?: boolean
  /** Swaps the leading icon for a spinner and blocks interaction. */
  readonly loading?: boolean
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps): React.JSX.Element {
  const Component = asChild ? Slot : 'button'
  return (
    <Component
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {children}
        </>
      ) : (
        children
      )}
    </Component>
  )
}

export { buttonVariants }
