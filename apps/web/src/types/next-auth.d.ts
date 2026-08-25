import type { Role } from '@ledgerhand/domain'
import type { DefaultSession } from 'next-auth'

/**
 * The session carries the tenant and the role, because every server action
 * needs both to build an execution context. They are claims about identity;
 * the authorisation decision is still made by the domain on each call.
 */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      tenantId: string
      tenantName: string
      role: Role
      timeZone: string
      currency: string
    } & DefaultSession['user']
  }

  interface User {
    tenantId?: string
    tenantName?: string
    role?: Role
    timeZone?: string
    currency?: string
  }
}
