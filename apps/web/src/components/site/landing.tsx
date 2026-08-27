import Link from 'next/link'
import type * as React from 'react'
import { translator, type Lang } from '@/lib/i18n'
import { SIGN_IN_PATH } from '@/lib/routes'

/**
 * ---------------------------------------------------------------------------
 * The public page
 * ---------------------------------------------------------------------------
 * Everything a reader who has never signed in should see: the thesis, the
 * recording, the four guardrails with the messages the system really produces,
 * what the eval suite measured, and what deliberately does not exist.
 *
 * Two rules govern what may go in here.
 *
 * It reads nothing at request time. No database, no API, no session. Every
 * fact on this page is a compile-time import -- the use case registry for the
 * counts, and the committed measurement files for the rest -- because a page
 * whose job is to be linked from somewhere else should not have a bill
 * attached to each visitor.
 *
 * And the English on it is the README's English, byte for byte, checked by a
 * test rather than by whoever last edited one of the two. The argument was
 * written once and calibrated once; a second copy of it that drifts is worse
 * than no copy at all.
 *
 * The language arrives as a prop rather than from the cookie, because there is
 * a route per language: `/` and `/pt`. A page that is meant to be shared needs
 * a URL that carries which language it is in.
 */
export function Landing({ lang }: { readonly lang: Lang }): React.JSX.Element {
  const t = translator(lang)

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <h1 className="font-display text-4xl leading-tight font-semibold tracking-tight text-balance">
        {t('An ERP is the hard part. Letting an AI agent run it safely is the interesting part.')}
      </h1>
      <p className="text-base leading-relaxed text-muted-foreground">
        {t(
          'A working system for a trading company, built so that an agent can operate it without anybody having to trust the agent.',
        )}
      </p>
      <p>
        <Link href={SIGN_IN_PATH} className="text-sm font-medium text-primary hover:underline">
          {t('Sign in')}
        </Link>
      </p>
    </main>
  )
}
