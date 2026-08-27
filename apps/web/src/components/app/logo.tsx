import type * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * The LH monogram, drawn rather than shipped as an image.
 *
 * Two letters sharing a corner: an L whose foot runs out under the H, and an H
 * whose left stem drops through that foot. Below the crossbar the stem shows
 * through at half strength, which is the idea of the mark rather than an
 * accident of it, so it is drawn and not approximated.
 *
 * Strokes, not outlines: three round-capped lines and a bar, which is what the
 * mark actually is, and which keeps it a handful of numbers instead of a path
 * nobody can edit. It stays sharp at any size, weighs nothing, and takes its
 * colours from the theme -- the L is `currentColor`, ink on white and light on
 * the dark ground, and the H is the accent every primary action already uses.
 */

/** The stroke is the mark: everything else is placement. */
const W = 6
/** Round caps overhang by half the stroke, so ends are inset by that much. */
const CAP = W / 2

export function Logo({
  className,
  title,
}: {
  readonly className?: string
  readonly title?: string
}): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      role={title === undefined ? 'presentation' : 'img'}
      aria-hidden={title === undefined}
      {...(title === undefined ? {} : { 'aria-label': title })}
      className={cn('size-full', className)}
    >
      <g
        className="text-primary"
        stroke="currentColor"
        strokeWidth={W}
        strokeLinecap="round"
        fill="none"
      >
        {/* The H: left stem above the bar, right stem, and the bar itself. */}
        <path d={`M49.6 ${String(29.6 + CAP)} V48.5`} />
        <path d={`M73.9 ${String(29.6 + CAP)} V${String(66.4 - CAP)}`} />
        <path d="M49.6 48.5 H73.9" strokeLinecap="butt" />
        {/* Below the bar the stem passes behind the L, and says so. */}
        <path d={`M49.6 48.5 V${String(66.4 - CAP)}`} opacity="0.55" />
      </g>

      {/* The L, in ink, on top: one stroke down and along. */}
      <path
        d={`M27.6 ${String(29.6 + CAP)} V57.4 A${String(W)} ${String(W)} 0 0 0 33.6 63.4 H${String(52.2 - CAP)}`}
        stroke="currentColor"
        strokeWidth={W}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}
