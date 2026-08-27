import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CALLBACK_PARAM, PATHNAME_HEADER, SIGN_IN_PATH } from '@/lib/routes'

/**
 * What happens to somebody who reaches a protected page without a session.
 *
 * `requireSession` is the only place in this application that answers that
 * question -- there is deliberately no auth check in the proxy, so a page
 * is protected because it goes through here and for no other reason. That
 * makes this the redirect worth pinning down.
 *
 * The session lookup and the request headers are the two things a test process
 * cannot have, so they are the two things replaced. Everything else -- the path
 * handling, the redirect itself -- is the real code.
 */

const session = vi.hoisted((): { value: unknown } => ({ value: null }))
const requestPath = vi.hoisted(() => ({ value: null as string | null }))

vi.mock('./auth', () => ({
  auth: () => Promise.resolve(session.value),
  handlers: {},
  signIn: () => Promise.resolve(),
  signOut: () => Promise.resolve(),
}))

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Map([[PATHNAME_HEADER, requestPath.value]])),
  cookies: () => Promise.resolve(new Map()),
}))

const { requireSession } = await import('./context')

/** What `redirect()` throws, unwrapped: `NEXT_REDIRECT;replace;/where;...`. */
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
  throw new Error('nothing was redirected, so the page would have rendered without a session')
}

describe('requireSession', () => {
  beforeEach(() => {
    session.value = null
    requestPath.value = null
  })

  it('sends a signed-out visitor to the sign-in page carrying where they were going', async () => {
    requestPath.value = '/finance/receivables'
    expect(await destinationOf(requireSession)).toBe(
      `${SIGN_IN_PATH}?${CALLBACK_PARAM}=%2Ffinance%2Freceivables`,
    )
  })

  it('redirects even when the proxy header never arrived', async () => {
    expect(await destinationOf(requireSession)).toBe(SIGN_IN_PATH)
  })

  it('lets a signed-in visitor through', async () => {
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
    await expect(requireSession()).resolves.toMatchObject({ role: 'admin' })
  })
})
