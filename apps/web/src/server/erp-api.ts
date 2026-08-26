import 'server-only'

import { createAuthLookup, withScope, type AuthLookup, type Session } from '@ledgerhand/db'
import {
  asId,
  previewOperation,
  runOperation,
  today,
  type AgentRunId,
  type JsonValue,
  type Role,
  type TenantId,
  type UserId,
} from '@ledgerhand/domain'
import { createHash, timingSafeEqual } from 'node:crypto'
import { database } from './context'
import { connectionString } from './env'

/**
 * ---------------------------------------------------------------------------
 * The ERP API
 * ---------------------------------------------------------------------------
 * The use cases over HTTP, for callers that are not a browser: today the MCP
 * server, tomorrow anything else. It exists so that the MCP server can run
 * with no database credentials of its own -- the boundary in the README
 * diagram is then a real process boundary, not a drawing.
 *
 * Authentication is a bearer token that names a user. The tenant and the role
 * are read from that user's row, never from the request: a caller cannot ask
 * to be an administrator, it can only hold a token that belongs to one.
 *
 * The tokens live in the environment, which is honest for a demo and stated
 * as a limitation in the README. A deployment would store a hash per token
 * with an expiry and a revocation list; the seam for that is one function.
 */

export interface ApiCaller {
  readonly session: Session
  readonly email: string
  readonly role: Role
  readonly tenantName: string
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

/** Constant-time comparison, so the token cannot be guessed a byte at a time. */
function matches(candidate: string, expected: string): boolean {
  return timingSafeEqual(digest(candidate), digest(expected))
}

/** `ERP_API_TOKENS=token-a:admin@ledgerhand.dev,token-b:finance@ledgerhand.dev` */
function configuredTokens(): readonly { readonly token: string; readonly email: string }[] {
  const raw = process.env['ERP_API_TOKENS'] ?? ''
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
    .map((entry) => {
      const separator = entry.indexOf(':')
      return {
        token: entry.slice(0, separator).trim(),
        email: entry.slice(separator + 1).trim(),
      }
    })
    .filter((entry) => entry.token !== '' && entry.email !== '')
}

function bearer(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
  return token === '' ? null : token
}

/**
 * One lookup for the process. Building it per request looks harmless, because
 * it connects lazily -- but each one connects on its first query and nothing
 * ever closes it, so a busy token endpoint leaves a trail of pools behind and
 * eventually the database stops answering.
 */
let lookup: AuthLookup | null = null
function accounts(): AuthLookup {
  lookup ??= createAuthLookup(
    connectionString(
      'DATABASE_AUTH_URL',
      'postgres://ledgerhand_auth:ledgerhand_auth@localhost:5432/ledgerhand',
    ),
  )
  return lookup
}

export async function authenticate(request: Request): Promise<ApiCaller | null> {
  const token = bearer(request)
  if (token === null) return null

  const entry = configuredTokens().find((candidate) => matches(token, candidate.token))
  if (entry === undefined) return null

  const account = await accounts().findActiveByEmail(entry.email)
  if (account === null) return null

  return {
    email: account.email,
    role: account.role,
    tenantName: account.tenantName,
    session: {
      tenantId: asId<TenantId>(account.tenantId),
      userId: asId<UserId>(account.userId),
      role: account.role,
      actor: { kind: 'user', userId: asId<UserId>(account.userId) },
      timeZone: account.timeZone,
      currency: account.currency,
    },
  }
}

export function unauthorised(): Response {
  return Response.json(
    { ok: false, error: { code: 'UNAUTHORIZED', message: 'A valid bearer token is required.' } },
    { status: 401, headers: { 'www-authenticate': 'Bearer' } },
  )
}

export function refusal(code: string, message: string, details?: JsonValue): Response {
  // 422 for a business rule, so a caller can tell "you asked for something the
  // rules forbid" from "you are not allowed to ask" (403) and from "the ERP is
  // broken" (5xx). The MCP server relies on exactly that distinction.
  const status = code === 'FORBIDDEN' ? 403 : code === 'NOT_FOUND' ? 404 : 422
  return Response.json(
    { ok: false, error: details === undefined ? { code, message } : { code, message, details } },
    { status },
  )
}

export function performed(value: JsonValue, replayed: boolean): Response {
  return Response.json({ ok: true, value, replayed })
}

interface CallBody {
  readonly input: unknown
  readonly idempotencyKey: string | null
}

async function readBody(request: Request): Promise<CallBody> {
  const raw: unknown = await request.json().catch(() => ({}))
  const body = (typeof raw === 'object' && raw !== null ? raw : {}) as {
    input?: unknown
    idempotencyKey?: unknown
  }
  return {
    input: body.input ?? {},
    idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : null,
  }
}

function sha256(canonical: string): string {
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

/**
 * Names the agent run behind a call. The ERP records it against every event the
 * call produces; it is an assertion about which of its own runs the caller is
 * performing, and cannot widen what the token is allowed to do.
 */
export const AGENT_RUN_HEADER = 'x-ledgerhand-agent-run'

function actingSession(caller: ApiCaller, request: Request): Session {
  const runId = request.headers.get(AGENT_RUN_HEADER)
  if (runId === null || runId.trim() === '') return caller.session
  return {
    ...caller.session,
    actor: {
      kind: 'agent',
      userId: caller.session.userId,
      agentRunId: asId<AgentRunId>(runId),
    },
  }
}

/** Runs one named operation for an authenticated caller, in one transaction. */
export async function callOperation(
  caller: ApiCaller,
  name: string,
  request: Request,
): Promise<Response> {
  const body = await readBody(request)

  const outcome = await withScope(database().db, actingSession(caller, request), async (scope) => {
    return await runOperation(
      { name, input: body.input, idempotencyKey: body.idempotencyKey },
      scope.context,
      {
        idempotency: scope.idempotency,
        hash: sha256,
      },
    )
  })

  return outcome.ok
    ? performed(outcome.value, outcome.replayed)
    : refusal(outcome.error.code, outcome.error.message, outcome.error.details)
}

export async function describeOperation(
  caller: ApiCaller,
  name: string,
  request: Request,
): Promise<Response> {
  const body = await readBody(request)

  const outcome = await withScope(database().db, caller.session, async (scope) => {
    return await previewOperation({ name, input: body.input }, scope.context)
  })

  return outcome.ok
    ? performed(outcome.value, false)
    : refusal(outcome.error.code, outcome.error.message, outcome.error.details)
}

export async function describeIdentity(caller: ApiCaller): Promise<Response> {
  const businessDate = await withScope(
    database().db,
    caller.session,
    async (scope) => await Promise.resolve(today(scope.context)),
  )

  return Response.json({
    tenantId: caller.session.tenantId,
    userId: caller.session.userId,
    role: caller.role,
    timeZone: caller.session.timeZone,
    currency: caller.session.currency,
    today: businessDate,
  })
}
