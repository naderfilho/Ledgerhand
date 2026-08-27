import type { Metadata } from 'next'
import type * as React from 'react'
import { Landing } from '@/components/site/landing'
import { landingMetadata } from '@/components/site/metadata'

export const metadata: Metadata = landingMetadata('pt')

/**
 * The same page in Portuguese, at its own URL.
 *
 * The rest of the application keeps the language in a cookie, and the note in
 * `lib/i18n.ts` explains why: every other screen is behind a session and none
 * of it is indexed, so a second set of paths would buy nothing. This page is
 * the exception the note did not anticipate. It is the one page meant to be
 * indexed and pasted into a link, and a cookie cannot travel in a link.
 */
export default function LandingPagePortuguese(): React.JSX.Element {
  return <Landing lang="pt" />
}
