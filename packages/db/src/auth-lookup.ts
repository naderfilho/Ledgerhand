import { asId, type Role, type TenantId, type UserId } from '@ledgerhand/domain'
import { and, eq } from 'drizzle-orm'
import { createDatabase, type DatabaseHandle } from './client.js'
import { tenants, users } from './schema/index.js'

/**
 * ---------------------------------------------------------------------------
 * The sign-in lookup
 * ---------------------------------------------------------------------------
 * Authentication has to read `users` before the tenant is known, which no
 * ordinary application query may do. It lives here, next to the schema, so the
 * web application never imports Drizzle: the UI still has no queries of its
 * own, and this one is small enough to read in full.
 *
 * The connection is expected to be `ledgerhand_auth`, a role granted SELECT on
 * exactly two tables. See packages/db/drizzle/0002_auth_lookup_role.sql.
 */

export interface AccountRecord {
  readonly userId: UserId
  readonly tenantId: TenantId
  readonly role: Role
  readonly name: string
  readonly email: string
  readonly tenantName: string
  readonly timeZone: string
  readonly currency: string
}

export interface Credentials extends AccountRecord {
  readonly passwordHash: string
  readonly active: boolean
}

export interface AuthLookup {
  findByEmail(email: string): Promise<Credentials | null>
  findActiveById(userId: string): Promise<AccountRecord | null>
  /**
   * The same record without the credential. Used by the MCP server, which
   * names the user it acts for by email and must not so much as see a
   * password hash to do it.
   */
  findActiveByEmail(email: string): Promise<AccountRecord | null>
}

export function createAuthLookup(url: string): AuthLookup {
  let handle: DatabaseHandle | null = null
  const database = (): DatabaseHandle => {
    handle ??= createDatabase(url, { max: 2 })
    return handle
  }

  return {
    findByEmail: async (email) => {
      const [row] = await database()
        .db.select({
          userId: users.id,
          tenantId: users.tenantId,
          role: users.role,
          name: users.name,
          email: users.email,
          passwordHash: users.passwordHash,
          active: users.active,
          tenantName: tenants.name,
          timeZone: tenants.timeZone,
          currency: tenants.currency,
        })
        .from(users)
        .innerJoin(tenants, eq(tenants.id, users.tenantId))
        .where(eq(users.email, email))
        .limit(1)

      if (row === undefined) return null
      return {
        userId: asId<UserId>(row.userId),
        tenantId: asId<TenantId>(row.tenantId),
        role: row.role,
        name: row.name,
        email: row.email,
        tenantName: row.tenantName,
        timeZone: row.timeZone,
        currency: row.currency,
        passwordHash: row.passwordHash,
        active: row.active,
      }
    },

    findActiveByEmail: async (email) => {
      const [row] = await database()
        .db.select({
          userId: users.id,
          tenantId: users.tenantId,
          role: users.role,
          name: users.name,
          email: users.email,
          tenantName: tenants.name,
          timeZone: tenants.timeZone,
          currency: tenants.currency,
        })
        .from(users)
        .innerJoin(tenants, eq(tenants.id, users.tenantId))
        .where(and(eq(users.email, email), eq(users.active, true)))
        .limit(1)

      if (row === undefined) return null
      return {
        userId: asId<UserId>(row.userId),
        tenantId: asId<TenantId>(row.tenantId),
        role: row.role,
        name: row.name,
        email: row.email,
        tenantName: row.tenantName,
        timeZone: row.timeZone,
        currency: row.currency,
      }
    },

    findActiveById: async (userId) => {
      const [row] = await database()
        .db.select({
          userId: users.id,
          tenantId: users.tenantId,
          role: users.role,
          name: users.name,
          email: users.email,
          tenantName: tenants.name,
          timeZone: tenants.timeZone,
          currency: tenants.currency,
        })
        .from(users)
        .innerJoin(tenants, eq(tenants.id, users.tenantId))
        .where(and(eq(users.id, userId), eq(users.active, true)))
        .limit(1)

      if (row === undefined) return null
      return {
        userId: asId<UserId>(row.userId),
        tenantId: asId<TenantId>(row.tenantId),
        role: row.role,
        name: row.name,
        email: row.email,
        tenantName: row.tenantName,
        timeZone: row.timeZone,
        currency: row.currency,
      }
    },
  }
}
