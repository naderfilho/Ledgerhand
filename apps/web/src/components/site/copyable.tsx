'use client'

import { Check, Copy } from 'lucide-react'
import * as React from 'react'

/**
 * A credential and a button that puts it on the clipboard.
 *
 * The whole point of the demo accounts is that somebody arriving from a link
 * gets inside without typing anything, so the value is selectable text *and* a
 * one-click copy rather than either alone.
 *
 * The confirmation is announced, not just coloured. A tick that only changes
 * shape tells a sighted user the copy worked and tells a screen reader nothing,
 * and "did that button do anything?" is the one question this control exists to
 * answer.
 */
export function Copyable({
  label,
  value,
  copyLabel,
  copiedLabel,
}: {
  readonly label: string
  readonly value: string
  readonly copyLabel: string
  readonly copiedLabel: string
}): React.JSX.Element {
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (!copied) return undefined
    const timer = setTimeout(() => {
      setCopied(false)
    }, 2000)
    return () => {
      clearTimeout(timer)
    }
  }, [copied])

  const copy = (): void => {
    // Two ways this fails and both are fine. `navigator.clipboard` is typed as
    // always present and is not -- an insecure origin has none, and reading
    // through it throws rather than yielding undefined -- and the write itself
    // can be refused. Nothing is broken either way: the value is still right
    // there to select, so the failure is silent rather than a dialog about a
    // convenience that did not happen.
    try {
      void navigator.clipboard.writeText(value).then(
        () => {
          setCopied(true)
        },
        () => undefined,
      )
    } catch {
      // No clipboard on this origin.
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-sunken px-3 py-2">
      <div className="min-w-0">
        <p className="text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <p className="truncate font-mono text-sm text-foreground" translate="no">
          {value}
        </p>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={`${copyLabel} ${label}`}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition hover:border-border-strong hover:text-foreground"
      >
        {copied ? <Check className="size-3.5 text-positive" /> : <Copy className="size-3.5" />}
        <span aria-hidden>{copied ? copiedLabel : copyLabel}</span>
      </button>
      {/* Announced once, when it changes, rather than read on every render. */}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? `${copiedLabel}: ${label}` : ''}
      </span>
    </div>
  )
}
