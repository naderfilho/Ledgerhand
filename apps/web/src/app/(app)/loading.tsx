import type * as React from 'react'

/**
 * Every screen in this group reads the database on every request, so there is
 * always a moment to fill. Skeletons in the shape of the content that follows
 * are less jarring than a spinner in the middle of an empty page.
 */
export default function Loading(): React.JSX.Element {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="space-y-2">
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="h-7 w-64 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((slot) => (
          <div key={slot} className="h-28 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-xl bg-muted" />
    </div>
  )
}
