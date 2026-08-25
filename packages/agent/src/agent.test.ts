import type Anthropic from '@anthropic-ai/sdk'
import {
  asId,
  type AgentRunId,
  type IdempotencyRecord,
  type IdempotencyStore,
  type Role,
} from '@ledgerhand/domain'
import {
  aProduct,
  cost,
  createTestHarness,
  qty,
  type TestHarness,
} from '@ledgerhand/domain/testing'
import {
  createErpServer,
  elicitApproval,
  inProcessGateway,
  type ExecutionScope,
  type ScopeOptions,
} from '@ledgerhand/mcp-server'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { beforeEach, describe, expect, it } from 'vitest'
import { denyAll, scriptedApprover } from './approvals.js'
import { RunBudget, type BudgetLimits } from './budget.js'
import { ErpClient } from './erp-client.js'
import { runTask } from './loop.js'
import { Transcript, type RunTranscript } from './transcript.js'

/**
 * The agent, end to end, minus the model.
 *
 * Everything below the model is real: a real MCP client talking to a real MCP
 * server over an in-memory pipe, against the real domain over in-memory
 * storage. Only the model is scripted -- because what these tests check is not
 * whether Claude chooses well, but whether the guardrails hold whatever it
 * chooses. An agent that asks for something forbidden, retries forever, or
 * tries to skip an approval is exactly the case worth pinning down, and a real
 * model cannot be made to misbehave on demand.
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

/** A model that says exactly what the test tells it to, in order. */
function scriptedModel(replies: readonly Partial<Anthropic.Message>[]): {
  readonly anthropic: Pick<Anthropic, 'messages'>
  readonly requests: Anthropic.MessageCreateParamsNonStreaming[]
} {
  const requests: Anthropic.MessageCreateParamsNonStreaming[] = []
  let index = 0

  const create = (
    params: Anthropic.MessageCreateParamsNonStreaming,
  ): Promise<Anthropic.Message> => {
    requests.push(params)
    const reply = replies[Math.min(index, replies.length - 1)]
    index += 1
    return Promise.resolve({
      id: `msg_${String(index)}`,
      type: 'message',
      role: 'assistant',
      model: params.model,
      content: [],
      stop_reason: 'end_turn',
      stop_sequence: null,
      stop_details: null,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      ...reply,
    } as Anthropic.Message)
  }

  return { anthropic: { messages: { create } } as unknown as Pick<Anthropic, 'messages'>, requests }
}

function toolUse(name: string, input: Record<string, unknown>): Partial<Anthropic.Message> {
  return {
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', id: `call_${name}`, name, input } as Anthropic.ToolUseBlock],
  }
}

function saying(text: string): Partial<Anthropic.Message> {
  return {
    stop_reason: 'end_turn',
    content: [{ type: 'text', text, citations: null }],
  }
}

const TASK = 'Do the thing'
const MODEL = 'claude-sonnet-5'

const LIMITS: BudgetLimits = {
  toolCalls: 10,
  inputTokens: 100_000,
  outputTokens: 10_000,
  costUsd: 1,
  wallClockMs: 60_000,
}

interface Wired {
  readonly erp: ErpClient
  readonly harness: TestHarness
  readonly runIds: (string | null | undefined)[]
  /**
   * Owned by the caller, as the composition root owns it in production:
   * approvals arrive as elicitation requests to the client, not as results
   * inside the loop, so the record has to be shared between the two.
   */
  readonly transcript: Transcript
}

let clock: number

beforeEach(() => {
  clock = Date.parse('2026-03-16T13:00:00.000Z')
})

const now = (): number => {
  clock += 1000
  return clock
}

async function wire(
  options: { role?: Role; approvals?: readonly boolean[]; runId?: string } = {},
): Promise<Wired> {
  const base = createTestHarness()
  const harness = options.role === undefined ? base : base.withOverrides({ role: options.role })
  const idempotency = new MemoryIdempotency()
  const runIds: (string | null | undefined)[] = []

  const gateway = inProcessGateway(
    async <T>(handler: (scope: ExecutionScope) => Promise<T>, scope?: ScopeOptions): Promise<T> => {
      runIds.push(scope?.agentRunId)
      const acting =
        scope?.agentRunId === undefined || scope.agentRunId === null
          ? harness
          : harness.withOverrides({
              actor: {
                kind: 'agent',
                userId: harness.context.userId,
                agentRunId: asId<AgentRunId>(scope.agentRunId),
              },
            })
      return await handler({ context: acting.context, idempotency })
    },
  )

  const server = createErpServer({ gateway, approval: elicitApproval })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)

  const transcript = new Transcript(options.runId ?? 'run-1', TASK, MODEL, now)
  const erp = await ErpClient.connect({
    transport: clientTransport,
    approver: options.approvals === undefined ? denyAll() : scriptedApprover(options.approvals),
    runId: options.runId ?? 'run-1',
    onApproval: (approval) => {
      transcript.asked(approval.message, approval.approved, approval.by, approval.reason)
    },
  })

  return { erp, harness, runIds, transcript }
}

async function run(
  wired: Wired,
  replies: readonly Partial<Anthropic.Message>[],
  limits: BudgetLimits = LIMITS,
): Promise<{ transcript: RunTranscript; requests: Anthropic.MessageCreateParamsNonStreaming[] }> {
  const { anthropic, requests } = scriptedModel(replies)
  const transcript = await runTask(TASK, {
    anthropic,
    erp: wired.erp,
    model: MODEL,
    runId: 'run-1',
    budget: new RunBudget(limits, now),
    transcript: wired.transcript,
    now,
  })
  return { transcript, requests }
}

describe('the agent loop', () => {
  it('offers the model only the tools the role may run', async () => {
    const wired = await wire({ role: 'sales' })
    const { requests } = await run(wired, [saying('Nothing to do.')])

    const tools = (requests[0]?.tools ?? []) as readonly Anthropic.Tool[]
    const names = tools.map((tool) => tool.name)
    expect(names).toContain('create_sales_order')
    expect(names).not.toContain('settle_receivable')
  })

  it('runs the tools the model asks for and records what came back', async () => {
    const wired = await wire()
    aProduct(wired.harness, { sku: 'WID-01' })

    const { transcript } = await run(wired, [
      toolUse('list_products', {}),
      saying('There is one product: WID-01.'),
    ])

    expect(transcript.outcome).toBe('completed')
    expect(transcript.summary).toContain('WID-01')
    const called = transcript.entries.filter((entry) => entry.kind === 'called')
    expect(called).toHaveLength(1)
    expect(called[0]).toMatchObject({ tool: 'list_products', refused: false })
    expect(transcript.spend.toolCalls).toBe(1)
  })

  it('stamps the run id on every call, so the ERP can attribute the events', async () => {
    const wired = await wire({ runId: 'run-42' })
    aProduct(wired.harness, { sku: 'WID-01' })

    await run(wired, [toolUse('list_products', {}), saying('done')])

    expect(wired.runIds).toContain('run-42')
  })

  it('hands a refusal back to the model as an error rather than ending the run', async () => {
    const wired = await wire({ role: 'readonly' })

    const { transcript } = await run(wired, [
      toolUse('create_product', { sku: 'X-1', name: 'X', salePrice: '1.00' }),
      saying('The ERP refused: my role cannot create products.'),
    ])

    expect(transcript.outcome).toBe('completed')
    expect(transcript.refusals).toBe(1)
    const called = transcript.entries.find((entry) => entry.kind === 'called')
    expect(called).toMatchObject({ refused: true })
    if (called?.kind === 'called') expect(called.output).toContain('FORBIDDEN')
  })

  it('stops when the tool call budget runs out, whatever the model wants', async () => {
    const wired = await wire()
    aProduct(wired.harness, { sku: 'WID-01' })

    const { transcript } = await run(wired, [toolUse('list_products', {})], {
      ...LIMITS,
      toolCalls: 2,
    })

    expect(transcript.outcome).toBe('budget-exhausted')
    expect(transcript.summary).toContain('2 tool calls')
    expect(transcript.spend.toolCalls).toBe(2)
  })

  it('stops when the run has taken too long', async () => {
    const wired = await wire()
    aProduct(wired.harness, { sku: 'WID-01' })

    const { transcript } = await run(wired, [toolUse('list_products', {})], {
      ...LIMITS,
      wallClockMs: 3_000,
    })

    expect(transcript.outcome).toBe('budget-exhausted')
    expect(transcript.summary).toContain('seconds')
  })

  it('reports a model refusal as such', async () => {
    const wired = await wire()

    const { transcript } = await run(wired, [
      {
        stop_reason: 'refusal',
        stop_details: { type: 'refusal', category: 'general_harms', explanation: 'Declined.' },
        content: [],
      },
    ])

    expect(transcript.outcome).toBe('refused-by-model')
  })
})

describe('destructive operations', () => {
  const exit = toolUse('register_stock_exit', {
    productId: '',
    quantity: '4',
    reason: 'manual_exit',
  })

  const exitFor = (productId: string): Partial<Anthropic.Message> =>
    toolUse('register_stock_exit', { productId, quantity: '4', reason: 'manual_exit' })

  it('does nothing when the approver declines, and tells the model why', async () => {
    const wired = await wire({ approvals: [false] })
    const product = aProduct(wired.harness, {
      sku: 'WID-01',
      onHand: qty(10),
      averageCost: cost(3),
    })

    const { transcript } = await run(wired, [
      exitFor(product.id),
      saying('The write-off was not approved, so nothing was removed.'),
    ])

    expect(wired.harness.db.movements).toHaveLength(0)
    expect(transcript.refusals).toBe(1)
    expect(transcript.approvalsRequested).toBe(1)
    expect(transcript.approvalsGranted).toBe(0)
    const asked = transcript.entries.find((entry) => entry.kind === 'asked')
    // The question a person answered is the domain's sentence, not the model's.
    if (asked?.kind === 'asked') expect(asked.message).toContain('WID-01')
  })

  it('performs it once the approver agrees', async () => {
    const wired = await wire({ approvals: [true] })
    const product = aProduct(wired.harness, {
      sku: 'WID-01',
      onHand: qty(10),
      averageCost: cost(3),
    })

    const { transcript } = await run(wired, [
      exitFor(product.id),
      saying('Four units written off.'),
    ])

    expect(wired.harness.db.movements).toHaveLength(1)
    expect(transcript.approvalsGranted).toBe(1)
    expect(transcript.refusals).toBe(0)
  })

  it('refuses when there is nobody to ask', async () => {
    const wired = await wire()
    const product = aProduct(wired.harness, {
      sku: 'WID-01',
      onHand: qty(10),
      averageCost: cost(3),
    })

    const { transcript } = await run(wired, [exitFor(product.id), saying('It was refused.')])

    expect(wired.harness.db.movements).toHaveLength(0)
    expect(transcript.approvalsGranted).toBe(0)
  })

  it('has an unusable input when the model invents one', async () => {
    const wired = await wire({ approvals: [true] })

    const { transcript } = await run(wired, [exit, saying('That product does not exist.')])

    expect(transcript.refusals).toBe(1)
    expect(wired.harness.db.movements).toHaveLength(0)
  })
})
