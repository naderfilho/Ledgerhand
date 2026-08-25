import type { Role } from '../auth/roles.js'
import type { TenantId, UserId, AgentRunId } from '../kit/ids.js'
import type { BusinessDate } from '../kit/business-date.js'
import { businessDateIn } from '../kit/business-date.js'
import type { UnitOfWork } from '../ports/unit-of-work.js'

/**
 * Who is asking, and on whose behalf. `agent` is not a role -- an agent always
 * borrows the identity and the role of a real user, so an audit trail can name
 * the person accountable for what it did.
 */
export type Actor =
  | { readonly kind: 'user'; readonly userId: UserId }
  | { readonly kind: 'agent'; readonly userId: UserId; readonly agentRunId: AgentRunId }

/**
 * Everything a use case is allowed to know about the outside world. Notably it
 * contains `now` rather than reading the clock: tests pin time, and the eval
 * suite replays the same scenario on the same "day" every run.
 */
export interface ExecutionContext {
  readonly tenantId: TenantId
  readonly userId: UserId
  readonly role: Role
  readonly actor: Actor
  readonly now: Date
  readonly timeZone: string
  readonly currency: string
  readonly uow: UnitOfWork
}

export function today(context: ExecutionContext): BusinessDate {
  return businessDateIn(context.now, context.timeZone)
}

export function isAgentActor(actor: Actor): actor is Extract<Actor, { kind: 'agent' }> {
  return actor.kind === 'agent'
}

export function describeActor(actor: Actor): string {
  return actor.kind === 'agent' ? `agent run ${actor.agentRunId}` : `user ${actor.userId}`
}
