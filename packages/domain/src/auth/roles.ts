import { z } from 'zod'
import { forbidden, type DomainError } from '../kit/errors.js'
import { err, ok, type Result } from '../kit/result.js'

/**
 * ---------------------------------------------------------------------------
 * Roles and capabilities
 * ---------------------------------------------------------------------------
 * Authorisation is a domain concern here, not a UI concern. The same table
 * decides what a button does, what an API route allows and -- crucially --
 * which MCP tools an agent is even shown. One source of truth means an agent
 * can never do something the person it acts for could not do themselves.
 */
export const ROLES = ['admin', 'sales', 'finance', 'stock', 'readonly'] as const
export type Role = (typeof ROLES)[number]

export const CAPABILITIES = [
  'catalog:read',
  'catalog:write',
  'catalog:archive',
  'stock:read',
  'stock:write',
  'stock:adjust',
  'sales:read',
  'sales:write',
  'sales:invoice',
  'sales:cancel',
  'purchase:read',
  'purchase:write',
  'purchase:cancel',
  'finance:read',
  'finance:settle',
  'finance:reverse',
  'finance:close-cash',
  'reports:read',
  'audit:read',
] as const
export type Capability = (typeof CAPABILITIES)[number]

/**
 * There is deliberately no `agent:run` capability. Lending your identity to an
 * agent is not a privilege somebody grants you on top of your job -- the agent
 * acts as you, so it can do what you can do and nothing more. A flag saying
 * "this person may delegate" would gate the wrong thing: the risk is not that
 * an agent runs, it is what it is allowed to touch once it does, and that is
 * already the table below. It also means every account in the demo, the
 * read-only one included, can be handed to the agent -- which is where the
 * refusals are easiest to see.
 */

const READ_ONLY_CAPABILITIES = [
  'catalog:read',
  'stock:read',
  'sales:read',
  'purchase:read',
  'finance:read',
  'reports:read',
] as const satisfies readonly Capability[]

export const ROLE_CAPABILITIES: Readonly<Record<Role, readonly Capability[]>> = {
  admin: CAPABILITIES,

  // Sells and cancels its own orders, and can see what is in stock to sell.
  // Cannot invoice: issuing a fiscal document is a finance act.
  sales: [
    'catalog:read',
    'stock:read',
    'sales:read',
    'sales:write',
    'sales:cancel',
    'reports:read',
  ],

  // Owns the warehouse and the purchasing that feeds it.
  stock: [
    'catalog:read',
    'catalog:write',
    'stock:read',
    'stock:write',
    'stock:adjust',
    'purchase:read',
    'purchase:write',
    'purchase:cancel',
    'reports:read',
  ],

  // Owns money and the fiscal sequence.
  finance: [
    'catalog:read',
    'stock:read',
    'sales:read',
    'sales:invoice',
    'purchase:read',
    'finance:read',
    'finance:settle',
    'finance:reverse',
    'finance:close-cash',
    'reports:read',
    'audit:read',
  ],

  // Reads the whole business and writes none of it. Handed to the agent, this
  // is the clearest demonstration in the set: it answers questions all day and
  // is refused the first time it is asked to change anything.
  readonly: READ_ONLY_CAPABILITIES,
}

export function hasCapability(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability)
}

export function capabilitiesOf(role: Role): readonly Capability[] {
  return ROLE_CAPABILITIES[role]
}

export function requireCapability(role: Role, capability: Capability): Result<void, DomainError> {
  return hasCapability(role, capability) ? ok(undefined) : err(forbidden(capability, role))
}

export const roleSchema = z.enum(ROLES)
export const capabilitySchema = z.enum(CAPABILITIES)
