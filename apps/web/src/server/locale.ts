import { cookies, headers } from 'next/headers'
import { DEFAULT_LANGUAGE, isLang, LANGUAGE_COOKIE, translator, type Lang } from '@/lib/i18n'
import { languageForPath, PATHNAME_HEADER } from '@/lib/routes'

/**
 * The language for this request, read on the server so a page renders in one
 * language rather than rendering in English and being corrected afterwards.
 */
export async function currentLanguage(): Promise<Lang> {
  // The landing pages carry their language in the path, and the path wins.
  // Without this, somebody who set the cookie to Portuguese and then opened
  // the English landing page would get a document marked lang="pt" around
  // English text, which is how a browser ends up offering to translate a page
  // into the language it is already in.
  const declared = languageForPath((await headers()).get(PATHNAME_HEADER))
  if (declared !== null) return declared

  const store = await cookies()
  const chosen = store.get(LANGUAGE_COOKIE)?.value
  return isLang(chosen) ? chosen : DEFAULT_LANGUAGE
}

/** The language and its dictionary, for a server component that needs both. */
export async function currentTranslator(): Promise<{
  readonly lang: Lang
  readonly t: (english: string) => string
}> {
  const lang = await currentLanguage()
  return { lang, t: translator(lang) }
}
