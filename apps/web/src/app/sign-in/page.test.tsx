import type * as Navigation from 'next/navigation'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CALLBACK_PARAM, HOME_PATH, LANDING_PATHS, SIGN_IN_PATH } from '@/lib/routes'

/**
 * The sign-in screen renders for somebody who has no session, and knows where
 * to send them once they do.
 *
 * It carries nothing but the form now: the thesis, the pillars and the
 * recorded run moved to the landing page, and a second copy of an argument is
 * the drift this repository argues against.
 *
 * It is the one public page that still reads a session, so the two things a
 * test process cannot have -- a session and request headers -- are the two
 * things replaced. Everything else is the real page: the real form, the real
 * counts, the real redirect.
 */

const session = vi.hoisted((): { value: unknown } => ({ value: null }))

// The form imports `AuthError` from next-auth to tell a rejected credential
// from a defect, and that value import drags in next-auth's own module graph,
// which reaches for `next/server` and does not find it outside a Next build.
// Nothing here exercises authentication, so the class is all that is needed.
vi.mock('next-auth', () => ({ AuthError: class AuthError extends Error {} }))

vi.mock('@/server/auth', () => ({
  auth: () => Promise.resolve(session.value),
  handlers: {},
  signIn: () => Promise.resolve(),
  signOut: () => Promise.resolve(),
}))

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Map()),
  cookies: () => Promise.resolve(new Map()),
}))

// The language switch on this screen writes a cookie and asks the router to
// render again, and outside a Next request there is no router to ask. Only
// that hook is replaced: `redirect` stays the real one, because where this
// page sends people is half of what is being tested.
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof Navigation>()),
  useRouter: () => ({ refresh: (): void => undefined, push: (): void => undefined }),
}))

const { default: SignInPage } = await import('./page')

const params = (query: Record<string, string> = {}): Promise<Record<string, string>> =>
  Promise.resolve(query)

/** `redirect()` throws; this is the destination it was carrying. */
async function destinationOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
  } catch (error: unknown) {
    const digest: unknown = (error as { digest?: unknown }).digest
    if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) {
      return digest.split(';')[2] ?? ''
    }
    throw error
  }
  throw new Error('nothing was redirected')
}

describe('the sign-in screen', () => {
  beforeEach(() => {
    session.value = null
  })

  it('renders for a visitor with no session', async () => {
    const html = renderToStaticMarkup(await SignInPage({ searchParams: params() }))
    expect(html).toContain('Sign in')
    expect(html).toContain('guest@ledgerhand.cloud')
    expect(html).toContain('name="password"')
  })

  it('carries the destination into the form, so signing in returns you there', async () => {
    const html = renderToStaticMarkup(
      await SignInPage({ searchParams: params({ [CALLBACK_PARAM]: '/finance/receivables' }) }),
    )
    expect(html).toContain(`name="${CALLBACK_PARAM}"`)
    expect(html).toContain('value="/finance/receivables"')
  })

  it('refuses an off-site destination and offers the home page instead', async () => {
    const html = renderToStaticMarkup(
      await SignInPage({ searchParams: params({ [CALLBACK_PARAM]: '//evil.example/steal' }) }),
    )
    expect(html).not.toContain('evil.example')
    expect(html).toContain(`value="${HOME_PATH}"`)
  })

  it('points "How it works" at the public page rather than at GitHub', async () => {
    const html = renderToStaticMarkup(await SignInPage({ searchParams: params() }))
    expect(html).toMatch(new RegExp(`href="${LANDING_PATHS.en}"[^>]*>[^<]*How it works`))
  })

  it('sends somebody who already has a session where they were going', async () => {
    session.value = {
      user: {
        id: 'b0000000-0000-4000-8000-000000000001',
        email: 'guest@ledgerhand.cloud',
        name: 'Guest',
        tenantId: 'a0000000-0000-4000-8000-000000000001',
        tenantName: 'Aurora',
        role: 'admin',
        timeZone: 'America/Sao_Paulo',
        currency: 'BRL',
      },
    }

    expect(
      await destinationOf(() =>
        SignInPage({ searchParams: params({ [CALLBACK_PARAM]: '/finance/cash' }) }),
      ),
    ).toBe('/finance/cash')

    // And with nowhere named, to the home page rather than back to this form.
    expect(await destinationOf(() => SignInPage({ searchParams: params() }))).toBe(HOME_PATH)
  })

  it('never renders the sign-in path as its own destination', async () => {
    const html = renderToStaticMarkup(
      await SignInPage({ searchParams: params({ [CALLBACK_PARAM]: SIGN_IN_PATH }) }),
    )
    expect(html).toContain(`value="${HOME_PATH}"`)
  })
})
