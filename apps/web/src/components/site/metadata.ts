import type { Metadata } from 'next'
import { contentFor } from '@/content/landing'
import { LANDING_PATHS } from '@/lib/routes'
import type { Lang } from '@/lib/i18n'

/**
 * ---------------------------------------------------------------------------
 * What a link to this page looks like somewhere else
 * ---------------------------------------------------------------------------
 * The point of the page is to be pasted into a post, so the card that unfurls
 * there is part of the page rather than an afterthought. The title and the
 * description are the same sentences the page opens with, because a card that
 * promises something the page does not say is a bounce.
 *
 * The title deliberately does not use the root layout's `%s · LedgerHand`
 * template. That template is for screens inside the application, where the
 * product name is context; here the product name is the subject.
 *
 * `alternates.languages` is what tells a search engine that `/` and `/pt` are
 * one page in two languages rather than two pages competing for the same
 * words -- which is the thing a cookie could never have expressed.
 */

/** The canonical origin. Exported: robots.ts and sitemap.ts need the same one. */
export const SITE = 'https://www.ledgerhand.cloud'

export function landingMetadata(lang: Lang): Metadata {
  const content = contentFor(lang)
  const path = LANDING_PATHS[lang]

  return {
    metadataBase: new URL(SITE),
    title: {
      absolute: content.meta.title,
    },
    description: content.meta.description,
    alternates: {
      canonical: path,
      languages: {
        en: LANDING_PATHS.en,
        'pt-BR': LANDING_PATHS.pt,
        'x-default': LANDING_PATHS.en,
      },
    },
    openGraph: {
      type: 'website',
      url: `${SITE}${path === '/' ? '' : path}`,
      siteName: 'Ledgerhand',
      locale: lang === 'pt' ? 'pt_BR' : 'en_GB',
      title: content.meta.title,
      description: content.meta.description,
      // The image is not listed here on purpose: `opengraph-image.tsx` beside
      // the route is a file convention Next resolves itself, and naming a URL
      // as well would be a second place for it to go wrong.
    },
    twitter: {
      card: 'summary_large_image',
      title: content.meta.title,
      description: content.meta.description,
    },
  }
}
