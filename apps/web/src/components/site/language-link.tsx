'use client'

import { Languages } from 'lucide-react'
import Link from 'next/link'
import type * as React from 'react'
import { LANGUAGE_COOKIE, type Lang } from '@/lib/i18n'

/**
 * The language switch on the public page, which is a link rather than a button.
 *
 * Everywhere behind a session the switch writes a cookie and re-renders, and
 * the note in `lib/i18n.ts` explains why that was right there: no screen is
 * indexed and none of them is shared as a URL. This page is both, so its two
 * languages are two addresses and moving between them is navigation.
 *
 * It still writes the cookie. Somebody who reads the page in Portuguese and
 * then signs in should not land in an English application, and the cookie is
 * what the rest of the site reads.
 */
export function LanguageLink({
  to,
  href,
  label,
}: {
  readonly to: Lang
  readonly href: string
  readonly label: string
}): React.JSX.Element {
  return (
    <Link
      href={href}
      hrefLang={to}
      onClick={() => {
        document.cookie = `${LANGUAGE_COOKIE}=${to}; path=/; max-age=31536000; samesite=lax`
      }}
      className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition hover:border-border-strong hover:text-foreground"
    >
      <Languages className="size-4" />
      <span translate="no">{to.toUpperCase()}</span>
      <span className="sr-only">{label}</span>
    </Link>
  )
}
