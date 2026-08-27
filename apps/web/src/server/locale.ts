import { cookies } from 'next/headers'
import { DEFAULT_LANGUAGE, isLang, LANGUAGE_COOKIE, translator, type Lang } from '@/lib/i18n'

/**
 * The language for this request, read on the server so a page renders in one
 * language rather than rendering in English and being corrected afterwards.
 */
export async function currentLanguage(): Promise<Lang> {
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
