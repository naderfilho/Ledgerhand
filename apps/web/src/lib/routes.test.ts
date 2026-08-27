import { describe, expect, it } from 'vitest'
import {
  CALLBACK_PARAM,
  HOME_PATH,
  LANDING_PATHS,
  SIGN_IN_PATH,
  languageForPath,
  safeCallbackUrl,
  signInPathFor,
} from './routes'

/**
 * The routing contract, on its own.
 *
 * These are string functions, which is the point: the decision about where a
 * signed-out visitor is sent and where they come back to is worth testing
 * without a browser, a session or a database anywhere near it.
 */

describe('signInPathFor', () => {
  it('carries the page somebody was trying to reach', () => {
    expect(signInPathFor('/finance/receivables')).toBe(
      `${SIGN_IN_PATH}?${CALLBACK_PARAM}=%2Ffinance%2Freceivables`,
    )
  })

  it('carries the query string with it, since half these pages are filtered', () => {
    expect(signInPathFor('/sales?status=confirmed')).toBe(
      `${SIGN_IN_PATH}?${CALLBACK_PARAM}=%2Fsales%3Fstatus%3Dconfirmed`,
    )
  })

  it('promises no return trip to a page that needed no session in the first place', () => {
    expect(signInPathFor(LANDING_PATHS.en)).toBe(SIGN_IN_PATH)
    expect(signInPathFor(LANDING_PATHS.pt)).toBe(SIGN_IN_PATH)
    expect(signInPathFor(SIGN_IN_PATH)).toBe(SIGN_IN_PATH)
  })

  it('still redirects when the proxy header is missing', () => {
    // Losing the return trip is survivable. Leaving the page open is not.
    expect(signInPathFor(null)).toBe(SIGN_IN_PATH)
    expect(signInPathFor(undefined)).toBe(SIGN_IN_PATH)
  })
})

describe('safeCallbackUrl', () => {
  it('returns somebody to where they were stopped', () => {
    expect(safeCallbackUrl('/finance/receivables')).toBe('/finance/receivables')
    expect(safeCallbackUrl('/sales?status=confirmed')).toBe('/sales?status=confirmed')
  })

  it.each([
    ['an absolute URL', 'https://evil.example/steal'],
    ['a protocol-relative URL', '//evil.example/steal'],
    ['a backslash protocol-relative URL', '/\\evil.example/steal'],
    ['a scheme with no slashes', 'javascript:alert(1)'],
    ['a bare path', 'dashboard'],
    ['an empty string', ''],
    ['a number', 42],
    ['nothing at all', undefined],
  ])('refuses %s and goes home instead', (_description, candidate) => {
    expect(safeCallbackUrl(candidate)).toBe(HOME_PATH)
  })

  it('refuses a newline, which is header injection looking for a home', () => {
    expect(safeCallbackUrl('/sales\nLocation: https://evil.example')).toBe(HOME_PATH)
  })

  it('does not send a freshly signed-in person back to the sign-in form', () => {
    expect(safeCallbackUrl(SIGN_IN_PATH)).toBe(HOME_PATH)
    expect(safeCallbackUrl(`${SIGN_IN_PATH}?${CALLBACK_PARAM}=%2Fsales`)).toBe(HOME_PATH)
  })

  it('does not send them to the landing page either, in either language', () => {
    expect(safeCallbackUrl(LANDING_PATHS.en)).toBe(HOME_PATH)
    expect(safeCallbackUrl(LANDING_PATHS.pt)).toBe(HOME_PATH)
  })
})

describe('languageForPath', () => {
  it('reads the language the landing pages declare', () => {
    expect(languageForPath('/')).toBe('en')
    expect(languageForPath('/pt')).toBe('pt')
    expect(languageForPath('/pt?utm_source=linkedin')).toBe('pt')
  })

  it('declares nothing for the pages that keep the language in a cookie', () => {
    expect(languageForPath('/dashboard')).toBeNull()
    expect(languageForPath(SIGN_IN_PATH)).toBeNull()
    expect(languageForPath(null)).toBeNull()
  })
})
