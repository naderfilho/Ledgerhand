import type { JsonValue } from '@ledgerhand/domain'
import {
  gatewayError,
  type CallRequest,
  type CallerIdentity,
  type GatewayOutcome,
  type ToolSummary,
  type UseCaseGateway,
} from './gateway.js'

/**
 * The HTTP adapter: the same gateway, spoken to the ERP's own API.
 *
 * This is the configuration the demo runs, because it is the one where the
 * claim in the README is structurally true. The MCP server has no database
 * URL, no schema and no way to reach a table; it holds a bearer token that the
 * ERP maps to a real user, and the ERP applies that user's role. An agent that
 * talks the protocol perfectly still cannot exceed the person it acts for.
 *
 * A refusal is data -- `{ ok: false, error }` with a business status -- while a
 * network fault or a 5xx is thrown. The distinction matters upstream: the
 * first is something to tell the model, the second is something to retry.
 */

export interface HttpGatewayOptions {
  /** Base URL of the ERP, e.g. `http://localhost:3000`. */
  readonly baseUrl: string
  readonly token: string
  readonly fetch?: typeof globalThis.fetch
  readonly timeoutMs?: number
}

interface Envelope {
  readonly ok?: unknown
  readonly value?: unknown
  readonly replayed?: unknown
  readonly error?: {
    readonly code?: unknown
    readonly message?: unknown
    readonly details?: JsonValue
  }
}

export class ErpTransportError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message)
    this.name = 'ErpTransportError'
  }
}

export function httpGateway(options: HttpGatewayOptions): UseCaseGateway {
  const base = options.baseUrl.replace(/\/+$/, '')
  const doFetch = options.fetch ?? globalThis.fetch
  const timeoutMs = options.timeoutMs ?? 30_000

  const request = async (path: string, body: JsonValue | null): Promise<unknown> => {
    const response = await doFetch(`${base}/api/erp${path}`, {
      method: body === null ? 'GET' : 'POST',
      headers: {
        authorization: `Bearer ${options.token}`,
        ...(body === null ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === null ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (response.status >= 500) {
      throw new ErpTransportError(
        `The ERP returned ${String(response.status)} for ${path}.`,
        response.status,
      )
    }

    const text = await response.text()
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new ErpTransportError(
        `The ERP returned a non-JSON body for ${path}: ${text.slice(0, 200)}`,
        response.status,
      )
    }
  }

  const unwrap = <T>(payload: unknown, path: string): GatewayOutcome<T> => {
    const envelope = payload as Envelope
    if (envelope.ok === true) {
      return { ok: true, value: envelope.value as T, replayed: envelope.replayed === true }
    }
    const error = envelope.error
    if (
      error === undefined ||
      typeof error.code !== 'string' ||
      typeof error.message !== 'string'
    ) {
      throw new ErpTransportError(`The ERP returned an unrecognised body for ${path}.`, null)
    }
    return {
      ok: false,
      error: gatewayError(error.code, error.message, error.details),
    }
  }

  return {
    identity: async () => (await request('/identity', null)) as CallerIdentity,

    tools: async () => {
      const payload = (await request('/tools', null)) as { readonly tools?: readonly ToolSummary[] }
      return payload.tools ?? []
    },

    call: async (call: CallRequest) => {
      const path = `/tools/${encodeURIComponent(call.name)}`
      const payload = await request(path, {
        input: (call.input ?? {}) as JsonValue,
        idempotencyKey: call.idempotencyKey ?? null,
      })
      return unwrap<JsonValue>(payload, path)
    },

    preview: async (call) => {
      const path = `/tools/${encodeURIComponent(call.name)}/preview`
      const payload = await request(path, { input: (call.input ?? {}) as JsonValue })
      return unwrap<string | null>(payload, path)
    },
  }
}
