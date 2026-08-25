import {
  summariseForRole,
  previewOperation,
  runOperation,
  today,
  type ExecutionContext,
  type IdempotencyStore,
  type JsonValue,
} from '@ledgerhand/domain'
import { createHash } from 'node:crypto'
import type { CallRequest, CallerIdentity, GatewayOutcome, UseCaseGateway } from './gateway.js'

/**
 * The in-process adapter: the domain, called directly, inside whatever
 * transaction the runner opens.
 *
 * It knows nothing about Postgres. `ScopeRunner` is satisfied by
 * `withScope` from packages/db in production and by the in-memory test
 * harness in the tests, which is why the whole tool surface can be exercised
 * without a database running.
 */

export interface ExecutionScope {
  readonly context: ExecutionContext
  readonly idempotency: IdempotencyStore
}

export interface ScopeOptions {
  /** Runs this call as the agent, borrowing the same user and role. */
  readonly agentRunId?: string | null
}

export type ScopeRunner = <T>(
  handler: (scope: ExecutionScope) => Promise<T>,
  options?: ScopeOptions,
) => Promise<T>

function sha256(canonical: string): string {
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

export function inProcessGateway(run: ScopeRunner): UseCaseGateway {
  return {
    identity: async () =>
      await run(
        async ({ context }) =>
          await Promise.resolve<CallerIdentity>({
            tenantId: context.tenantId,
            userId: context.userId,
            role: context.role,
            timeZone: context.timeZone,
            currency: context.currency,
            today: today(context),
          }),
      ),

    // Filtered by role here rather than at the transport, so a tool the caller
    // cannot run is never advertised to the model in the first place.
    tools: async () =>
      await run(async ({ context }) => await Promise.resolve(summariseForRole(context.role))),

    call: async (request: CallRequest): Promise<GatewayOutcome<JsonValue>> =>
      await run(
        async (scope) => {
          const outcome = await runOperation(
            {
              name: request.name,
              input: request.input,
              idempotencyKey: request.idempotencyKey ?? null,
            },
            scope.context,
            { idempotency: scope.idempotency, hash: sha256 },
          )
          return outcome.ok
            ? { ok: true, value: outcome.value, replayed: outcome.replayed }
            : { ok: false, error: outcome.error }
        },
        { agentRunId: request.agentRunId ?? null },
      ),

    preview: async (request) =>
      await run(async (scope) => {
        const outcome = await previewOperation(
          { name: request.name, input: request.input },
          scope.context,
        )
        return outcome.ok
          ? { ok: true, value: outcome.value, replayed: false }
          : { ok: false, error: outcome.error }
      }),
  }
}
