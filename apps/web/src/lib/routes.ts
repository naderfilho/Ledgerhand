import type { Lang } from './i18n'

/**
 * ---------------------------------------------------------------------------
 * Where the three kinds of page live
 * ---------------------------------------------------------------------------
 * Three groups of route, and the difference between them is who may see them:
 *
 *   the landing    `/` -- public, indexed, no session and no database
 *   the sign-in    `/sign-in` -- public, and the only way into the third group
 *   the ERP        `/dashboard` and everything under it -- session required
 *
 * `/` used to be the third kind. Somebody arriving at the domain was sent
 * straight to the sign-in form, which is the wrong first screen for a reader
 * who has not decided to sign in yet.
 *
 * Nothing here reads a session or touches Auth.js. It is string handling, kept
 * in one place so the redirect out of a protected page and the redirect back
 * into it cannot disagree about the shape of the URL between them.
 */

/**
 * Set on every request by `proxy.ts`, because a Server Component has no
 * other way to learn the path it is rendering for -- and without the path
 * there is nothing to send somebody back to after they sign in.
 */
export const PATHNAME_HEADER = 'x-ledgerhand-pathname'

export const SIGN_IN_PATH = '/sign-in'

/**
 * The landing page, per language.
 *
 * The rest of the application keeps the language in a cookie, for the reason
 * set out in `lib/i18n.ts`. The landing page is the exception: it is the only
 * page here that gets indexed and pasted into links, and a cookie does not
 * travel in a link. So the language is in the path, and `languageForPath`
 * below is what lets the document declare the language it is really in.
 */
export const LANDING_PATHS: Readonly<Record<Lang, string>> = { en: '/', pt: '/pt' }

/** Where a signed-in person belongs. Not `/`, which is now the landing. */
export const HOME_PATH = '/dashboard'

export const CALLBACK_PARAM = 'callbackUrl'

/**
 * Whether a path is somewhere it makes sense to return to after signing in.
 *
 * The rule is deliberately a whitelist of shape rather than a blacklist of
 * hosts: one leading slash and no second one. `//evil.example` and `/\evil`
 * are both protocol-relative URLs that a browser follows off-site, and they
 * are exactly what an open redirect looks like when it is written as a bug
 * rather than as an attack.
 */
function isLocalPath(candidate: string): boolean {
  if (!candidate.startsWith('/')) return false
  if (candidate.startsWith('//') || candidate.startsWith('/\\')) return false
  // A newline in a redirect target is header injection looking for somewhere
  // to happen, and no legitimate path in this application contains one.
  return !Array.from(candidate).some((character) => (character.codePointAt(0) ?? 0) < 0x20)
}

/** The pages a signed-out visitor may already see, so never a destination to
 *  send a signed-in one back to. */
function isPublicPath(path: string): boolean {
  return path === SIGN_IN_PATH || Object.values(LANDING_PATHS).includes(path)
}

/**
 * The destination after a successful sign-in.
 *
 * Anything unusable becomes the home page rather than an error: a person who
 * has just typed the right password should land somewhere, and a malformed
 * `callbackUrl` is not their problem to solve.
 */
export function safeCallbackUrl(candidate: unknown): string {
  if (typeof candidate !== 'string' || candidate === '') return HOME_PATH
  if (!isLocalPath(candidate)) return HOME_PATH
  // Returning to the sign-in page from the sign-in page is a loop, and
  // returning to the landing is not what anyone meant by signing in.
  const [path] = candidate.split('?')
  if (path === undefined || isPublicPath(path)) return HOME_PATH
  return candidate
}

/**
 * The sign-in URL to send somebody to when they reach a protected page without
 * a session, carrying where they were trying to go.
 *
 * The public pages are left off deliberately. `/sign-in?callbackUrl=/` would
 * promise to return somebody to the landing page after signing in, which is
 * the one place a signed-in person has no reason to be.
 */
export function signInPathFor(pathname: string | null | undefined): string {
  if (pathname === null || pathname === undefined || !isLocalPath(pathname)) return SIGN_IN_PATH
  const [path] = pathname.split('?')
  if (path === undefined || isPublicPath(path)) return SIGN_IN_PATH
  return `${SIGN_IN_PATH}?${CALLBACK_PARAM}=${encodeURIComponent(pathname)}`
}

/**
 * The language a path declares, or `null` if it declares none.
 *
 * Only the landing pages declare one. Everywhere else the cookie decides, and
 * returning `null` is how this says so rather than guessing English.
 */
export function languageForPath(pathname: string | null | undefined): Lang | null {
  if (pathname === null || pathname === undefined) return null
  const [path] = pathname.split('?')
  if (path === LANDING_PATHS.pt) return 'pt'
  if (path === LANDING_PATHS.en) return 'en'
  return null
}
