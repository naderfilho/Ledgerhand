import { hasCapability, ROLES, USE_CASES, type Role } from '@ledgerhand/domain'

/**
 * ---------------------------------------------------------------------------
 * How many operations there are, and how many each role may run
 * ---------------------------------------------------------------------------
 * Counted from the registry, never written down. The sign-in page learned this
 * the hard way: its copy said "ten of the forty-one", which was right when it
 * was written and wrong two use cases later.
 *
 * The filter here is the same predicate the MCP server applies when it decides
 * what to advertise -- `hasCapability(role, useCase.capability)` -- so the
 * numbers on the page are the size of the tool list a real agent would be
 * handed, rather than a second opinion about it.
 */

const OPERATIONS = Object.values(USE_CASES)

export const OPERATION_COUNT = OPERATIONS.length

/** Irreversible without a compensating entry, or it moves money, or it burns a fiscal number. */
export const DESTRUCTIVE_COUNT = OPERATIONS.filter(
  (useCase) => useCase.risk === 'destructive',
).length

export interface RoleOperations {
  readonly role: Role
  readonly operations: number
}

/**
 * Every role and the size of its tool list, biggest first.
 *
 * `preview_operation` is deliberately not in this count: it is added by the MCP
 * server on top of the registry, it is offered to every role, and it runs
 * nothing. Including it would inflate all five numbers by one and make the
 * difference between them -- which is the entire point of the listing -- read
 * as slightly smaller than it is.
 */
export const OPERATIONS_BY_ROLE: readonly RoleOperations[] = [...ROLES]
  .map((role) => ({
    role,
    operations: OPERATIONS.filter((useCase) => hasCapability(role, useCase.capability)).length,
  }))
  .sort((a, b) => b.operations - a.operations)

/** The listing as the README shows it: one role per line, counts in a column. */
export function roleOperationsListing(): string {
  const width = Math.max(...OPERATIONS_BY_ROLE.map((entry) => entry.role.length))
  return OPERATIONS_BY_ROLE.map(
    (entry) => `${entry.role.padEnd(width + 2)}${String(entry.operations).padStart(2)} operations`,
  ).join('\n')
}
