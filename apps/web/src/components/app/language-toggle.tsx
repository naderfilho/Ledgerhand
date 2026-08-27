'use client'

import { Languages } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { LANGUAGE_COOKIE, type Lang } from '@/lib/i18n'

/**
 * The language switch.
 *
 * It writes a cookie and asks the router to render again, so the choice is made
 * on the server with the rest of the page rather than swapped in afterwards --
 * no flash of the other language, and no second copy of every string shipped to
 * the browser.
 *
 * It also sets `lang` on the document. Without that, a browser reading a page
 * marked `lang="en"` offers to translate the Portuguese we just rendered, and
 * then translates the product name along with it.
 */
export function LanguageToggle({ lang }: { readonly lang: Lang }): React.JSX.Element {
  const router = useRouter()
  const next: Lang = lang === 'en' ? 'pt' : 'en'

  const choose = (): void => {
    document.documentElement.lang = next
    // A year, on the whole site, and not readable by anything but this app.
    document.cookie = `${LANGUAGE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={choose}
      title={next === 'pt' ? 'Ver em português' : 'View in English'}
      aria-label={next === 'pt' ? 'Ver em português' : 'View in English'}
      className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition hover:border-border-strong hover:text-foreground"
    >
      <Languages className="size-4" />
      <span translate="no">{lang.toUpperCase()}</span>
    </button>
  )
}
