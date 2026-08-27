import type { Metadata } from 'next'
import type * as React from 'react'
import { Landing } from '@/components/site/landing'
import { landingMetadata } from '@/components/site/metadata'

export const metadata: Metadata = landingMetadata('en')

/**
 * The English landing page, and the first thing anybody arriving at the domain
 * sees. `/pt` is the same page in Portuguese.
 *
 * No session, no database, no `cookies()` of its own -- see the note in
 * `components/site/landing.tsx` for why the language is a route rather than a
 * cookie here.
 */
export default function LandingPageEnglish(): React.JSX.Element {
  return <Landing lang="en" />
}
