'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import type * as React from 'react'

/**
 * The dark and light switch, for the pages that have no topbar to carry it.
 *
 * The label says the action, not the state: "Toggle theme" leaves a screen
 * reader user with no idea which way it goes.
 *
 * It says so in CSS rather than in an `aria-label`, and that is not a
 * flourish. The theme is only known once `next-themes` has read the browser's
 * storage, so a label computed from `resolvedTheme` renders one way on the
 * server and the other way on the client -- a hydration mismatch React reports
 * and does not repair. Two screen-reader-only spans, hidden the same way the
 * icons are, have no state to disagree about: `display: none` takes an element
 * out of the accessibility tree, so whichever theme is on, exactly one label is
 * the button's name.
 */
export function ThemeToggle({
  toDark,
  toLight,
}: {
  readonly toDark: string
  readonly toLight: string
}): React.JSX.Element {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={() => {
        setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
      }}
      className="flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-border-strong hover:text-foreground"
    >
      <Sun className="hidden size-4 dark:block" />
      <Moon className="size-4 dark:hidden" />
      <span className="sr-only dark:hidden">{toDark}</span>
      <span className="sr-only hidden dark:block">{toLight}</span>
    </button>
  )
}
