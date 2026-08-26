import type { Role } from '@ledgerhand/domain'
import { createAuthLookup, verifyPassword, type AuthLookup } from '@ledgerhand/db'
import NextAuth, { type NextAuthResult } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { z } from 'zod'
import { connectionString } from './env'

/**
 * ---------------------------------------------------------------------------
 * Authentication
 * ---------------------------------------------------------------------------
 * Auth.js v5 with a credentials provider, which means JWT sessions: the
 * library does not support database sessions together with credentials, and
 * pretending otherwise would be a lie in the README.
 *
 * A JWT carries a copy of the role, and a copy goes stale. Two things keep the
 * window small and the consequences bounded:
 *
 *   1. The token re-reads the user row every five minutes, so a deactivated
 *      account or a changed role takes effect quickly rather than at the end of
 *      an eight-hour session.
 *   2. Authorisation is not decided by the token anyway. Every use case checks
 *      the capability itself and Postgres row level security scopes the data to
 *      the tenant. The token is an identity claim, not a permission grant.
 *
 * The lookup runs as `ledgerhand_auth`, a role that can read two tables and
 * nothing else. See migration 0002.
 */

const REFRESH_AFTER_MS = 5 * 60 * 1000
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60

/**
 * A valid Argon2id hash of a value nobody knows. Verifying against it when the
 * e-mail does not exist keeps a failed sign-in the same length whether or not
 * the account is real.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZS1zYWx0LXZhbHVlLi4$8Qm5ZLQqQK0V0mLxvqQFOZ2q3aGXe1kJm4t8pQ0nH6c'

interface AccountClaims {
  readonly id: string
  readonly tenantId: string
  readonly tenantName: string
  readonly role: Role
  readonly timeZone: string
  readonly currency: string
}

type Claims = Record<string, unknown>

function writeClaims(token: Claims, claims: AccountClaims): void {
  token['tenantId'] = claims.tenantId
  token['tenantName'] = claims.tenantName
  token['role'] = claims.role
  token['timeZone'] = claims.timeZone
  token['currency'] = claims.currency
  token['refreshedAt'] = Date.now()
}

function readString(token: Claims, key: string): string {
  const value = token[key]
  return typeof value === 'string' ? value : ''
}

function readNumber(token: Claims, key: string): number {
  const value = token[key]
  return typeof value === 'number' ? value : 0
}

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
})

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

const result: NextAuthResult = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE_SECONDS },
  pages: { signIn: '/sign-in' },
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'E-mail', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw)
        if (!parsed.success) return null

        const account = await accounts().findByEmail(parsed.data.email)
        const matches = await verifyPassword(
          account?.passwordHash ?? DUMMY_HASH,
          parsed.data.password,
        )
        if (account === null || !matches || !account.active) return null

        return {
          id: account.userId,
          name: account.name,
          email: account.email,
          tenantId: account.tenantId,
          tenantName: account.tenantName,
          role: account.role,
          timeZone: account.timeZone,
          currency: account.currency,
        }
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user, trigger }) => {
      const claims = user as unknown as Partial<AccountClaims> | undefined
      if (claims?.tenantId !== undefined) {
        if (claims.id !== undefined) token.sub = claims.id
        writeClaims(token, claims as AccountClaims)
        return token
      }

      const refreshedAt = readNumber(token, 'refreshedAt')
      if (Date.now() - refreshedAt <= REFRESH_AFTER_MS && trigger !== 'update') return token

      const account = token.sub === undefined ? null : await accounts().findActiveById(token.sub)
      if (account === null) {
        // The signature stays valid, but the claims are gone; the session
        // callback then refuses to build a usable session from it.
        token['tenantId'] = undefined
        token['role'] = undefined
        return token
      }

      writeClaims(token, {
        id: account.userId,
        tenantId: account.tenantId,
        tenantName: account.tenantName,
        role: account.role,
        timeZone: account.timeZone,
        currency: account.currency,
      })
      return token
    },

    session: ({ session, token }) => {
      session.user.id = token.sub ?? ''
      session.user.tenantId = readString(token, 'tenantId')
      session.user.tenantName = readString(token, 'tenantName')
      session.user.role = (readString(token, 'role') || 'readonly') as Role
      session.user.timeZone = readString(token, 'timeZone') || 'UTC'
      session.user.currency = readString(token, 'currency') || 'BRL'
      return session
    },
  },
})

export const handlers = result.handlers
export const auth = result.auth
export const signIn = result.signIn
export const signOut = result.signOut
