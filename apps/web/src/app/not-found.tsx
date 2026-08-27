import Link from 'next/link'
import type * as React from 'react'
import { Wordmark } from '@/components/app/wordmark'
import { HOME_PATH } from '@/lib/routes'

export default function NotFound(): React.JSX.Element {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <Wordmark size="lg" />
      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">That record does not exist</h1>
        <p className="text-sm text-muted-foreground">
          The order, product or title you asked for is not in this tenant. It may belong to another
          company, which this application cannot show you even by accident.
        </p>
      </div>
      <Link href={HOME_PATH} className="text-sm font-medium text-primary hover:underline">
        Back to the dashboard
      </Link>
    </main>
  )
}
