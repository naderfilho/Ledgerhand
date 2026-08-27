import 'server-only'

import {
  asId,
  hasCapability,
  type Capability,
  type DomainError,
  type ExecutionContext,
  type Result,
  type Role,
  type TenantId,
  type UserId,
} from '@ledgerhand/domain'
import { createDatabase, withUnitOfWork, type DatabaseHandle, type Session } from '@ledgerhand/db'
import { POOL_SIZE, connectionString } from './env'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { auth } from './auth'
import { HOME_PATH, PATHNAME_HEADER, signInPathFor } from '@/lib/routes'

/**
 * ---------------------------------------------------------------------------
 * The bridge between a request and a use case
 * ---------------------------------------------------------------------------
 * Everything the web application does to the database goes through here, which
 * is what keeps the promise from ADR 0001 true: the UI has no queries of its
 * own, only use cases.
 *
 * `query` is for reading in a Server Component. `run` is for Server Actions and
 * returns something serialisable, because a `Result` full of branded bigints
 * cannot cross the network boundary to a client component.
 */

export interface WebSession {
  readonly userId: UserId
  readonly tenantId: TenantId
  readonly role: Role
  readonly name: string
  readonly email: string
  readonly tenantName: string
  readonly timeZone: string
  readonly currency: string
}

let handle: DatabaseHandle | null = null

/**
 * One pool for the process, shared by the pages, the Server Actions and the
 * ERP API routes. Exported because the API routes need the same connection --
 * a second pool would double the connections for no reason.
 */
export function database(): DatabaseHandle {
  handle ??= createDatabase(
    connectionString(
      'DATABASE_URL',
      'postgres://ledgerhand_app:ledgerhand_app@localhost:5432/ledgerhand',
    ),
    { max: POOL_SIZE },
  )
  return handle
}

/**
 * Deduplicated per request by React's cache, so ten Server Components on one
 * page decode the session once.
 */
export const currentSession = cache(async (): Promise<WebSession | null> => {
  const session = await auth()
  const user = session?.user
  if (user === undefined || user.tenantId === '') return null

  return {
    userId: asId<UserId>(user.id),
    tenantId: asId<TenantId>(user.tenantId),
    role: user.role,
    name: user.name ?? user.email ?? 'Unknown',
    email: user.email ?? '',
    tenantName: user.tenantName,
    timeZone: user.timeZone,
    currency: user.currency,
  }
})

/**
 * The session, or the sign-in page carrying where the visitor was going.
 *
 * The path comes from the header `proxy.ts` stamps on every request. If
 * it is missing -- a caller that never went through the proxy -- the
 * redirect still happens, just without somewhere to return to, because losing
 * a return trip is a worse outcome than a page that stays open to a signed-out
 * visitor.
 */
export async function requireSession(): Promise<WebSession> {
  const session = await currentSession()
  if (session !== null) return session
  const pathname = (await headers()).get(PATHNAME_HEADER)
  redirect(signInPathFor(pathname))
}

function toDomainSession(session: WebSession): Session {
  return {
    tenantId: session.tenantId,
    userId: session.userId,
    role: session.role,
    actor: { kind: 'user', userId: session.userId },
    timeZone: session.timeZone,
    currency: session.currency,
  }
}

/** Runs a read inside a tenant-scoped transaction. Redirects if signed out. */
export async function query<T>(handler: (context: ExecutionContext) => Promise<T>): Promise<T> {
  const session = await requireSession()
  return await withUnitOfWork(database().db, toDomainSession(session), handler)
}

/** The same, but for callers that already hold a session. */
export async function queryAs<T>(
  session: WebSession,
  handler: (context: ExecutionContext) => Promise<T>,
): Promise<T> {
  return await withUnitOfWork(database().db, toDomainSession(session), handler)
}

export type ActionResult<T = unknown> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly code: string; readonly message: string }

export function failed(message: string, code = 'VALIDATION_FAILED'): ActionResult<never> {
  return { ok: false, code, message }
}

/**
 * Runs a write and flattens the outcome into something a client component can
 * receive. A rejected business rule is a value, not an exception -- the form
 * shows the domain's own sentence rather than "something went wrong".
 */
export async function run<T, R>(
  handler: (context: ExecutionContext) => Promise<Result<T, DomainError>>,
  present: (value: T) => R,
): Promise<ActionResult<R>> {
  const session = await requireSession()
  try {
    const outcome = await withUnitOfWork(database().db, toDomainSession(session), handler)
    if (!outcome.ok) {
      return { ok: false, code: outcome.error.code, message: outcome.error.message }
    }
    return { ok: true, data: present(outcome.value) }
  } catch (error: unknown) {
    // A thrown error is a defect, not a refusal. Log it server-side and give
    // the user something honest rather than a stack trace.
    console.error('[action] unexpected failure', error)
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      message: 'The operation could not be completed. The error has been logged.',
    }
  }
}

export function can(session: WebSession, capability: Capability): boolean {
  return hasCapability(session.role, capability)
}

/** Guards a page whose whole purpose the role cannot serve. */
export async function requireCapabilityOrRedirect(capability: Capability): Promise<WebSession> {
  const session = await requireSession()
  if (!can(session, capability)) redirect(HOME_PATH)
  return session
}
