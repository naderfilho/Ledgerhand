import type { MetadataRoute } from 'next'
import { LANDING_PATHS, SIGN_IN_PATH } from '@/lib/routes'
import { SITE } from '@/components/site/metadata'

/**
 * Three public pages, and nothing else worth a crawler's time.
 *
 * Everything under the ERP needs a session and answers a signed-out request
 * with a redirect, so a crawler would collect a directory of sign-in pages.
 * Saying so here is not a security measure -- `requireSession` is -- it is
 * simply an accurate description of what is behind those paths.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: [LANDING_PATHS.en, LANDING_PATHS.pt, SIGN_IN_PATH],
      disallow: ['/dashboard', '/agent', '/api/'],
    },
    sitemap: `${SITE}/sitemap.xml`,
  }
}
