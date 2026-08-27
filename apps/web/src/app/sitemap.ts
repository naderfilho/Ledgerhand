import type { MetadataRoute } from 'next'
import { SITE } from '@/components/site/metadata'
import { LANDING_PATHS } from '@/lib/routes'
import evals from '@metrics/evals.json'

/**
 * The two landing pages, declared as one page in two languages.
 *
 * `lastModified` is the day the rates were measured rather than the day of the
 * deploy. A build that changed a margin has not changed what this page says,
 * and telling a crawler otherwise on every push is how a sitemap stops being
 * believed.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const languages = { en: `${SITE}/`, 'pt-BR': `${SITE}${LANDING_PATHS.pt}` }

  return [
    {
      url: `${SITE}/`,
      lastModified: evals.measuredOn,
      alternates: { languages },
    },
    {
      url: `${SITE}${LANDING_PATHS.pt}`,
      lastModified: evals.measuredOn,
      alternates: { languages },
    },
  ]
}
