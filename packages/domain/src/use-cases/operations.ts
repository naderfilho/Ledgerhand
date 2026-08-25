import type { Capability, Role } from '../auth/roles.js'
import type { ExecutionContext } from '../context/execution-context.js'
import { domainError, notFound, type DomainError } from '../kit/errors.js'
import { canonicalJson, type JsonObject, type JsonValue } from '../kit/json.js'
import type { IdempotencyStore } from '../ports/services.js'
import type { RiskLevel, UseCaseDescriptor } from './definition.js'
import { DESCRIPTORS_BY_NAME, descriptorsForRole } from './registry.js'

/**
 * ---------------------------------------------------------------------------
 * Running an operation by name
 * ---------------------------------------------------------------------------
 * The web application calls use cases directly, with types. Everything remote
 * -- the HTTP API and the MCP server -- arrives with a string and a blob of
 * JSON instead, and needs the same three things done in the same order every
 * time: find the operation, honour the idempotency key, present the result.
 *
 * Doing that here rather than once per transport means an agent retrying a
 * settlement over stdio and a retry over HTTP obey the same rule, and that the
 * rule itself is testable without a socket.
 */

export interface OperationRequest {
  readonly name: string
  readonly input: unknown
  /**
   * Supplied by the caller for anything that writes. A retry with the same key
   * returns the stored response instead of acting twice; the same key with a
   * different payload is a mistake, and is refused.
   */
  readonly idempotencyKey?: string | null
}

export interface OperationDependencies {
  readonly idempotency: IdempotencyStore
  /** Hashes the canonical request. Injected because the domain does no crypto. */
  readonly hash: (canonical: string) => string
}

export type OperationOutcome =
  | { readonly ok: true; readonly value: JsonValue; readonly replayed: boolean }
  | { readonly ok: false; readonly error: DomainError }

export async function runOperation(
  request: OperationRequest,
  context: ExecutionContext,
  dependencies: OperationDependencies,
): Promise<OperationOutcome> {
  const descriptor = DESCRIPTORS_BY_NAME.get(request.name)
  if (descriptor === undefined) {
    return { ok: false, error: notFound('Operation', request.name) }
  }

  const key = request.idempotencyKey ?? null
  // A replayed read would answer with yesterday's stock. Keys are for writes,
  // where the danger is doing the thing twice rather than seeing it twice.
  const replayable = key !== null && descriptor.risk !== 'read'

  if (replayable) {
    const requestHash = dependencies.hash(canonicalJson(request.input))
    const stored = await dependencies.idempotency.find(key, request.name)

    if (stored !== null) {
      if (stored.requestHash !== requestHash) {
        return {
          ok: false,
          error: domainError(
            'IDEMPOTENCY_KEY_REUSED',
            `Idempotency key "${key}" was already used for ${request.name} with different arguments. Use a new key for a new request, or repeat the original arguments to receive the original result.`,
            { key, operation: request.name },
          ),
        }
      }
      return { ok: true, value: stored.response, replayed: true }
    }

    const result = await descriptor.runJson(request.input, context)
    if (!result.ok) return { ok: false, error: result.error }

    // Only successes are recorded. A refusal is not an outcome worth pinning
    // to a key: the caller should be free to fix the input and try again.
    await dependencies.idempotency.save({
      key,
      operation: request.name,
      requestHash,
      response: result.value,
      createdAt: context.now,
    })
    return { ok: true, value: result.value, replayed: false }
  }

  const result = await descriptor.runJson(request.input, context)
  return result.ok
    ? { ok: true, value: result.value, replayed: false }
    : { ok: false, error: result.error }
}

/**
 * The sentence a person is shown before approving a destructive operation, or
 * null when the operation is not destructive and therefore has none. Written
 * by the domain, never by the model asking for the approval.
 */
export async function previewOperation(
  request: Pick<OperationRequest, 'name' | 'input'>,
  context: ExecutionContext,
): Promise<
  | { readonly ok: true; readonly value: string | null }
  | { readonly ok: false; readonly error: DomainError }
> {
  const descriptor = DESCRIPTORS_BY_NAME.get(request.name)
  if (descriptor === undefined) {
    return { ok: false, error: notFound('Operation', request.name) }
  }
  if (descriptor.preview === null) return { ok: true, value: null }

  const result = await descriptor.preview(request.input, context)
  return result.ok ? { ok: true, value: result.value } : { ok: false, error: result.error }
}

/**
 * What a remote caller is told about an operation. The MCP server publishes
 * this as a tool and the HTTP API returns it from `/tools`, so both describe
 * the same operation with the same words -- there is no second place where a
 * summary could go stale.
 */
export interface OperationSummary {
  readonly name: string
  readonly title: string
  readonly summary: string
  readonly capability: Capability
  readonly risk: RiskLevel
  readonly inputSchema: JsonObject
  readonly hasPreview: boolean
}

export function summariseOperation(descriptor: UseCaseDescriptor): OperationSummary {
  return {
    name: descriptor.name,
    title: descriptor.title,
    summary: descriptor.summary,
    capability: descriptor.capability,
    risk: descriptor.risk,
    inputSchema: descriptor.jsonSchema(),
    hasPreview: descriptor.preview !== null,
  }
}

/** The operations this role may run, described. Nothing else is disclosed. */
export function summariseForRole(role: Role): readonly OperationSummary[] {
  return descriptorsForRole(role).map(summariseOperation)
}
