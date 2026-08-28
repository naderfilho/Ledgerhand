import Image from 'next/image'
import type * as React from 'react'
import logo from '@/assets/logo.png'
import { cn } from '@/lib/utils'

/**
 * ---------------------------------------------------------------------------
 * The mark, on the ground it was drawn for
 * ---------------------------------------------------------------------------
 * The artwork is two inks: the L in #0c1a32 and the H in #4736f5. Against the
 * dark theme's #16192b the L measures a contrast ratio of 1.00 -- the same
 * luminance, which is not "hard to read", it is not there at all.
 *
 * The answer is not to recolour it. A logo is artwork, and a mark that changes
 * colour to suit a page is a mark with no identity; the file in `docs/brand`
 * is the thing itself and this only places it. So it gets the light ground it
 * was designed on, in both themes. On the light one the chip disappears into
 * the page and the mark simply sits there; on the dark one it reads as a
 * lockup, which is what every logo drawn for paper does when it lands on a
 * dark interface.
 *
 * Decorative on purpose. The wordmark stands beside it everywhere it is used,
 * so a screen reader that announced both would say the name twice.
 */
export function Brandmark({ className }: { readonly className?: string }): React.JSX.Element {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white',
        className,
      )}
    >
      <Image
        src={logo}
        alt=""
        aria-hidden
        // The header mark is above the fold on every page: it should not wait
        // for the lazy-loading observer to notice it.
        priority
        // Without this the optimiser is asked for 1920px to fill a 44px chip,
        // and serves sixty-five kilobytes to draw something the size of a
        // thumbnail. The mark is never larger than the chip that holds it.
        sizes="44px"
        className="h-auto w-[72%]"
      />
    </span>
  )
}
