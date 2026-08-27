import { NextResponse, type NextRequest } from 'next/server'
import { PATHNAME_HEADER } from '@/lib/routes'

/**
 * ---------------------------------------------------------------------------
 * One header, and deliberately nothing else
 * ---------------------------------------------------------------------------
 * This does not authenticate anybody. It stamps the path being requested onto
 * the request headers, because a Server Component cannot otherwise find out
 * which URL it is rendering, and without that there is nothing to send a
 * visitor back to after they sign in.
 *
 * The temptation is to check the session here instead and redirect from here,
 * which is the shape most Auth.js examples take. Two reasons not to.
 * The authority would move out of `requireSession`, where every page and every
 * Server Action already meets it, into a matcher that has to be kept in step
 * with the route tree by hand -- and a route missing from that list would be
 * an unprotected page rather than a failing test. And the session lookup
 * re-reads the user row through `@ledgerhand/db`, which does not run on the
 * edge runtime, so the check here could only ever be "a cookie exists", which
 * is not a check.
 *
 * So: no decisions, no reads, no session. One header.
 */
export function proxy(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers)
  headers.set(PATHNAME_HEADER, `${request.nextUrl.pathname}${request.nextUrl.search}`)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: [
    /**
     * Everything a person navigates to, and nothing a browser fetches on its
     * own. The API routes are excluded because they authenticate with a bearer
     * token and have nowhere to redirect a caller to.
     */
    '/((?!api/|_next/static/|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)',
  ],
}
