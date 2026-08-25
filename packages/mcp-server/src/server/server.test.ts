import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { ElicitRequestSchema, type Tool } from '@modelcontextprotocol/sdk/types.js'
import type { IdempotencyRecord, IdempotencyStore, Role } from '@ledgerhand/domain'
import {
  aProduct,
  cost,
  createTestHarness,
  qty,
  type TestHarness,
} from '@ledgerhand/domain/testing'
import { beforeEach, describe, expect, it } from 'vitest'
import { inProcessGateway, type ExecutionScope } from '../gateway/in-process.js'
import { approveEverything, elicitApproval } from './approval.js'
import { createErpServer } from './build.js'
import { IDEMPOTENCY_KEY, PREVIEW_TOOL } from './tools.js'

/**
 * The whole protocol surface, driven by a real MCP client over an in-memory
 * transport, against the in-memory domain harness. No database, no sockets,
 * and no mock of the thing under test: what these assertions exercise is the
 * same code a desktop client will talk to.
 */

class MemoryIdempotency implements IdempotencyStore {
  private readonly records: IdempotencyRecord[] = []

  find(key: string, operation: string): Promise<IdempotencyRecord | null> {
    return Promise.resolve(
      this.records.find((record) => record.key === key && record.operation === operation) ?? null,
    )
  }

  save(record: IdempotencyRecord): Promise<void> {
    this.records.push(record)
    return Promise.resolve()
  }
}

interface Connected {
  readonly client: Client
  readonly harness: TestHarness
}

type Elicitation = 'accept' | 'decline' | 'unsupported'

async function connect(
  options: { role?: Role; elicitation?: Elicitation; autoApprove?: boolean } = {},
): Promise<Connected> {
  const base = createTestHarness()
  const harness = options.role === undefined ? base : base.withOverrides({ role: options.role })
  const idempotency = new MemoryIdempotency()

  const gateway = inProcessGateway(
    async <T>(handler: (scope: ExecutionScope) => Promise<T>): Promise<T> =>
      await handler({ context: harness.context, idempotency }),
  )

  const server = createErpServer({
    gateway,
    approval: options.autoApprove === true ? approveEverything : elicitApproval,
  })

  const elicitation = options.elicitation ?? 'accept'
  const client = new Client(
    { name: 'test-client', version: '0.0.0' },
    { capabilities: elicitation === 'unsupported' ? {} : { elicitation: {} } },
  )
  if (elicitation !== 'unsupported') {
    client.setRequestHandler(ElicitRequestSchema, () =>
      elicitation === 'accept'
        ? { action: 'accept' as const, content: { confirm: true } }
        : { action: 'decline' as const },
    )
  }

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  return { client, harness }
}

/**
 * The protocol's content blocks are a union of text, image, audio and links.
 * Every assertion here is about text, so the narrowing happens once.
 */
function firstText(blocks: unknown): string {
  if (!Array.isArray(blocks)) return ''
  const [first] = blocks as { text?: unknown }[]
  return typeof first?.text === 'string' ? first.text : ''
}

function textOf(result: unknown): string {
  return firstText((result as { readonly content?: unknown }).content)
}

let stocked: TestHarness

beforeEach(() => {
  stocked = createTestHarness()
})

describe('tools/list', () => {
  it('offers only what the role may run', async () => {
    const { client } = await connect({ role: 'sales' })
    const names = (await client.listTools()).tools.map((tool) => tool.name)

    expect(names).toContain('create_sales_order')
    expect(names).toContain(PREVIEW_TOOL)
    // Invoicing and settling are finance acts; a salesperson has neither.
    expect(names).not.toContain('invoice_sales_order')
    expect(names).not.toContain('settle_receivable')
  })

  it('gives writes an idempotency key and leaves reads without one', async () => {
    const { client } = await connect()
    const tools = new Map((await client.listTools()).tools.map((tool) => [tool.name, tool]))

    const properties = (tool: Tool): Record<string, unknown> => tool.inputSchema.properties ?? {}

    expect(properties(tools.get('register_stock_entry') as Tool)).toHaveProperty(IDEMPOTENCY_KEY)
    expect(properties(tools.get('list_products') as Tool)).not.toHaveProperty(IDEMPOTENCY_KEY)
  })

  it('publishes the risk classification the domain decided', async () => {
    const { client } = await connect()
    const tools = new Map((await client.listTools()).tools.map((tool) => [tool.name, tool]))

    expect(tools.get('list_products')?.annotations?.readOnlyHint).toBe(true)
    expect(tools.get('settle_receivable')?.annotations?.destructiveHint).toBe(true)
    expect(tools.get('create_product')?.annotations?.destructiveHint).toBe(false)
  })
})

describe('tools/call', () => {
  it('refuses a tool the role cannot see, without saying whether it exists', async () => {
    const { client } = await connect({ role: 'readonly' })

    const refused = await client.callTool({ name: 'settle_receivable', arguments: {} })
    const invented = await client.callTool({ name: 'drop_database', arguments: {} })

    expect(refused.isError).toBe(true)
    expect(textOf(refused)).toContain('FORBIDDEN')
    expect(textOf(invented)).toBe(textOf(refused).replace('settle_receivable', 'drop_database'))
  })

  it('reports a rejected input as a tool error, with the domain sentence', async () => {
    const { client } = await connect()

    const result = await client.callTool({ name: 'create_product', arguments: { sku: '' } })

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('VALIDATION_FAILED')
  })

  it('returns decimal strings rather than the domain bigints', async () => {
    const { client, harness } = await connect()
    aProduct(harness, { sku: 'WID-01', onHand: qty(10), averageCost: cost(3) })

    const result = await client.callTool({ name: 'get_stock_position', arguments: {} })

    expect(result.isError).toBeFalsy()
    expect(textOf(result)).toContain('"onHand": "10"')
    expect(textOf(result)).toContain('"averageCost": "3.00"')
  })

  it('replays a repeated idempotency key instead of writing twice', async () => {
    const { client, harness } = await connect()
    const product = aProduct(harness, { sku: 'WID-01' })
    const call = {
      name: 'register_stock_entry',
      arguments: {
        productId: product.id,
        quantity: '10',
        unitCost: '3.00',
        [IDEMPOTENCY_KEY]: 'entry-1',
      },
    }

    const first = await client.callTool(call)
    const second = await client.callTool(call)

    expect(first.isError).toBeFalsy()
    expect(textOf(second)).toContain('Replayed')
    expect(harness.db.movements).toHaveLength(1)
  })
})

describe('human approval', () => {
  const exitCall = (productId: string): { name: string; arguments: Record<string, unknown> } => ({
    name: 'register_stock_exit',
    arguments: { productId, quantity: '4', reason: 'manual_exit' },
  })

  it('shows the domain sentence to a person and performs the operation once approved', async () => {
    const { client, harness } = await connect({ elicitation: 'accept' })
    const product = aProduct(harness, { sku: 'WID-01', onHand: qty(10), averageCost: cost(3) })

    const result = await client.callTool(exitCall(product.id))

    expect(result.isError).toBeFalsy()
    expect(harness.db.movements).toHaveLength(1)
  })

  it('does nothing when the person declines', async () => {
    const { client, harness } = await connect({ elicitation: 'decline' })
    const product = aProduct(harness, { sku: 'WID-01', onHand: qty(10), averageCost: cost(3) })

    const result = await client.callTool(exitCall(product.id))

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('APPROVAL_DENIED')
    expect(harness.db.movements).toHaveLength(0)
  })

  it('fails closed when the client has nobody to ask', async () => {
    const { client, harness } = await connect({ elicitation: 'unsupported' })
    const product = aProduct(harness, { sku: 'WID-01', onHand: qty(10), averageCost: cost(3) })

    const result = await client.callTool(exitCall(product.id))

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('APPROVAL_DENIED')
    expect(harness.db.movements).toHaveLength(0)
  })

  it('never asks for a read', async () => {
    const { client, harness } = await connect({ elicitation: 'decline' })
    aProduct(harness, { sku: 'WID-01' })

    const result = await client.callTool({ name: 'list_products', arguments: {} })

    expect(result.isError).toBeFalsy()
  })

  it('describes an operation through preview_operation without performing it', async () => {
    const { client, harness } = await connect({ autoApprove: true })
    const product = aProduct(harness, { sku: 'WID-01', onHand: qty(10), averageCost: cost(3) })

    const result = await client.callTool({
      name: PREVIEW_TOOL,
      arguments: {
        operation: 'register_stock_exit',
        input: { productId: product.id, quantity: '4', reason: 'manual_exit' },
      },
    })

    expect(textOf(result)).toContain('WID-01')
    expect(harness.db.movements).toHaveLength(0)
  })
})

describe('resources', () => {
  it('lists only the resources the role can read', async () => {
    const { client } = await connect({ role: 'sales' })
    const uris = (await client.listResources()).resources.map((resource) => resource.uri)

    expect(uris).toContain('erp://catalog/products')
    expect(uris).toContain('erp://stock/position')
    // Cash and receivables belong to finance.
    expect(uris).not.toContain('erp://cash/today')
    expect(uris).not.toContain('erp://finance/receivables/overdue')
  })

  it('reads a resource as JSON produced by the use case behind it', async () => {
    const { client, harness } = await connect()
    aProduct(harness, { sku: 'LOW-01', onHand: qty(1), minimumStock: qty(10) })

    const read = await client.readResource({ uri: 'erp://stock/below-minimum' })
    const [content] = read.contents

    expect(content?.mimeType).toBe('application/json')
    expect(firstText(read.contents)).toContain('LOW-01')
  })

  it('expands a template', async () => {
    const { client } = await connect()
    const templates = (await client.listResourceTemplates()).resourceTemplates.map(
      (template) => template.uriTemplate,
    )
    expect(templates).toContain('erp://reports/sales/{from}/{to}')

    const read = await client.readResource({ uri: 'erp://reports/sales/2026-03-01/2026-03-16' })
    expect(firstText(read.contents)).toContain('"from": "2026-03-01"')
  })

  it('rejects a URI it does not serve', async () => {
    const { client } = await connect()
    await expect(client.readResource({ uri: 'erp://secrets/everything' })).rejects.toThrow(
      /No resource at/,
    )
  })

  it('refuses a resource the role may not read', async () => {
    const { client } = await connect({ role: 'sales' })
    await expect(client.readResource({ uri: 'erp://cash/today' })).rejects.toThrow(/not available/)
  })
})

describe('prompts', () => {
  it('offers only the routines the role could carry out', async () => {
    const finance = await connect({ role: 'finance' })
    const sales = await connect({ role: 'sales' })

    const financeNames = (await finance.client.listPrompts()).prompts.map((prompt) => prompt.name)
    const salesNames = (await sales.client.listPrompts()).prompts.map((prompt) => prompt.name)

    expect(financeNames).toContain('daily_cash_closing')
    expect(salesNames).not.toContain('daily_cash_closing')
  })

  it('renders the routine with its arguments and its rules', async () => {
    const { client } = await connect()
    const prompt = await client.getPrompt({
      name: 'daily_cash_closing',
      arguments: { business_date: '2026-03-16' },
    })

    const text = prompt.messages.map((message) => firstText([message.content])).join(' ')
    expect(text).toContain('2026-03-16')
    expect(text).toContain('get_current_context')
    expect(text).toContain('human approval')
  })
})

describe('the harness itself', () => {
  it('starts empty, so a test that finds data put it there', () => {
    expect(stocked.db.movements).toHaveLength(0)
  })
})
