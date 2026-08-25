import { describe, expect, it } from 'vitest'
import { ErpTransportError, httpGateway } from './http.js'

/**
 * The HTTP adapter against a stub ERP. What is worth asserting here is not
 * that fetch works, but the contract: the token travels, a business refusal
 * comes back as a value, and a server fault comes back as a throw. Confusing
 * those two would have an agent retrying a rule it will never satisfy, or
 * reporting an outage as a business rejection.
 */

interface Recorded {
  readonly url: string
  readonly init: RequestInit
}

function stub(responder: (recorded: Recorded) => { status?: number; body: string }): {
  fetch: typeof globalThis.fetch
  calls: Recorded[]
} {
  const calls: Recorded[] = []
  const fetchStub = (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
    const recorded = { url: href, init: init ?? {} }
    calls.push(recorded)
    const { status = 200, body } = responder(recorded)
    return Promise.resolve(
      new Response(body, { status, headers: { 'content-type': 'application/json' } }),
    )
  }

  return { fetch: fetchStub, calls }
}

function bodyOf(recorded: Recorded | undefined): string {
  const body = recorded?.init.body
  return typeof body === 'string' ? body : '{}'
}

describe('httpGateway', () => {
  it('sends the bearer token and the idempotency key with the call', async () => {
    const { fetch, calls } = stub(() => ({
      body: JSON.stringify({ ok: true, value: { id: 'p1' } }),
    }))
    const gateway = httpGateway({ baseUrl: 'http://erp.test/', token: 'secret', fetch })

    const outcome = await gateway.call({
      name: 'create_product',
      input: { sku: 'WID-01' },
      idempotencyKey: 'k-1',
    })

    expect(outcome).toEqual({ ok: true, value: { id: 'p1' }, replayed: false })
    expect(calls[0]?.url).toBe('http://erp.test/api/erp/tools/create_product')
    expect((calls[0]?.init.headers as Record<string, string>).authorization).toBe('Bearer secret')
    expect(JSON.parse(bodyOf(calls[0]))).toEqual({
      input: { sku: 'WID-01' },
      idempotencyKey: 'k-1',
    })
  })

  it('reports a business refusal as a value', async () => {
    const { fetch } = stub(() => ({
      status: 422,
      body: JSON.stringify({
        ok: false,
        error: { code: 'INSUFFICIENT_STOCK', message: 'Only 3 available.' },
      }),
    }))
    const gateway = httpGateway({ baseUrl: 'http://erp.test', token: 'secret', fetch })

    const outcome = await gateway.call({ name: 'register_stock_exit', input: {} })

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error.code).toBe('INSUFFICIENT_STOCK')
  })

  it('throws when the ERP itself is broken', async () => {
    const { fetch } = stub(() => ({ status: 502, body: 'bad gateway' }))
    const gateway = httpGateway({ baseUrl: 'http://erp.test', token: 'secret', fetch })

    await expect(gateway.call({ name: 'list_products', input: {} })).rejects.toBeInstanceOf(
      ErpTransportError,
    )
  })

  it('throws when the body is not the envelope it promised', async () => {
    const { fetch } = stub(() => ({ body: JSON.stringify({ unexpected: true }) }))
    const gateway = httpGateway({ baseUrl: 'http://erp.test', token: 'secret', fetch })

    await expect(gateway.call({ name: 'list_products', input: {} })).rejects.toBeInstanceOf(
      ErpTransportError,
    )
  })

  it('reads the tool list and the identity', async () => {
    const { fetch } = stub((recorded) =>
      recorded.url.endsWith('/identity')
        ? { body: JSON.stringify({ role: 'finance', today: '2026-03-16' }) }
        : { body: JSON.stringify({ tools: [{ name: 'list_products' }] }) },
    )
    const gateway = httpGateway({ baseUrl: 'http://erp.test', token: 'secret', fetch })

    expect((await gateway.identity()).today).toBe('2026-03-16')
    expect((await gateway.tools()).map((tool) => tool.name)).toEqual(['list_products'])
  })
})
