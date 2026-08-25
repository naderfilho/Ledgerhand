import type * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * The brand, drawn as text rather than shipped as an image.
 *
 * Two reasons. It stays sharp at any size and in either theme, because the two
 * halves are theme tokens rather than baked pixels: `Ledger` takes the
 * foreground, `Hand` takes the accent that every primary action in the
 * application already uses. And it costs no request.
 */
export function Wordmark({
  className,
  size = 'md',
}: {
  readonly className?: string
  readonly size?: 'sm' | 'md' | 'lg'
}): React.JSX.Element {
  const scale = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-3xl' : 'text-xl'

  return (
    <span
      className={cn('font-display leading-none font-semibold tracking-tight', scale, className)}
    >
      <span className="text-foreground">Ledger</span>
      <span className="text-primary">Hand</span>
    </span>
  )
}

/** The square mark, for the places a full wordmark does not fit. */
export function WordmarkGlyph({ className }: { readonly className?: string }): React.JSX.Element {
  return (
    <span
      aria-hidden
      className={cn(
        'font-display flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-lg font-semibold text-primary-foreground',
        className,
      )}
    >
      L
    </span>
  )
}
