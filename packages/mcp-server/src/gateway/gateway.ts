import type { JsonValue, OperationSummary, Role } from '@ledgerhand/domain'

/**
 * ---------------------------------------------------------------------------
 * The gateway
 * ---------------------------------------------------------------------------
 * The one thing the MCP server is allowed to know about the ERP. Two adapters
 * implement it (phase 0, decision D1):
 *
 *   in-process  calls the domain directly inside a database transaction. Fast
 *               and deterministic, which is what the eval suite needs.
 *   http        calls the ERP's own API over the network. Slower, and the
 *               point: the MCP server then holds no database credentials at
 *               all, so the trust boundary drawn in the README is a real
 *               process boundary rather than a diagram.
 *
 * Everything crossing this interface is JSON. That is not a coincidence -- it
 * is what makes the two adapters interchangeable, and it is why every use case
 * in the domain owns a presenter.
 */

/**
 * The domain's own description of an operation, unchanged. Defined there so
 * that this server and the ERP's HTTP API cannot drift into describing the
 * same tool differently.
 */
export type ToolSummary = OperationSummary

export interface CallerIdentity {
  readonly tenantId: string
  readonly userId: string
  readonly role: Role
  readonly timeZone: string
  readonly currency: string
  /** Today in the tenant's timezone. A model must never infer this itself. */
  readonly today: string
}

export interface GatewayError {
  readonly code: string
  readonly message: string
  readonly details?: JsonValue
}

export type GatewayOutcome<T> =
  | { readonly ok: true; readonly value: T; readonly replayed: boolean }
  | { readonly ok: false; readonly error: GatewayError }

export interface CallRequest {
  readonly name: string
  readonly input: unknown
  readonly idempotencyKey?: string | null
}

export interface UseCaseGateway {
  /** Who the ERP thinks is calling. Never taken from the client's word for it. */
  identity(): Promise<CallerIdentity>
  /** Only the operations this caller's role may run. */
  tools(): Promise<readonly ToolSummary[]>
  call(request: CallRequest): Promise<GatewayOutcome<JsonValue>>
  preview(request: Omit<CallRequest, 'idempotencyKey'>): Promise<GatewayOutcome<string | null>>
}

export function gatewayError(code: string, message: string, details?: JsonValue): GatewayError {
  return details === undefined ? { code, message } : { code, message, details }
}

export function failure<T>(error: GatewayError): GatewayOutcome<T> {
  return { ok: false, error }
}
