'use client'

import { RotateCw } from 'lucide-react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'

/**
 * What a reader sees when something throws.
 *
 * The message is deliberately not the exception. A domain refusal already
 * reaches the screen as a sentence written for a person; anything that gets
 * here is a defect, and a defect's own words are for the log rather than for
 * whoever was trying to close the cash.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string }
  readonly reset: () => void
}): React.JSX.Element {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">Something broke on our side</h1>
        <p className="text-sm text-muted-foreground">
          The operation was not completed, and nothing was half saved: every change in this
          application commits as one transaction or not at all.
        </p>
      </div>

      <Button onClick={reset}>
        <RotateCw className="size-4" />
        Try again
      </Button>

      {error.digest === undefined ? null : (
        <p className="font-mono text-xs text-muted-foreground">Reference {error.digest}</p>
      )}
    </main>
  )
}
