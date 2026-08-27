import type Anthropic from '@anthropic-ai/sdk'
import {
  DEFAULT_LIMITS,
  ErpClient,
  RunBudget,
  scriptedApprover,
  Transcript,
  runTask,
  type BudgetLimits,
  type BudgetSpend,
  type RunTranscript,
} from '@ledgerhand/agent'
import type { IdempotencyRecord, IdempotencyStore } from '@ledgerhand/domain'
import { createTestHarness } from '@ledgerhand/domain/testing'
import { createErpServer, elicitApproval, inProcessGateway } from '@ledgerhand/mcp-server'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { CheckResult, RunFacts, Scenario, ScenarioKind, World } from './scenario.js'

/**
 * ---------------------------------------------------------------------------
 * Running a scenario
 * ---------------------------------------------------------------------------
 * Everything is real except the business: a real agent loop, a real MCP client
 * and server, the real domain and its rules -- over in-memory storage, with a
 * pinned clock and sequential ids. A scenario therefore starts from exactly
 * the same state on every run, and the only thing that varies between run one
 * and run three is the model. That is the point: it is the model's
 * consistency being measured, not the fixture's.
 */

/** A run that failed before it began has no clock of its own. */
const EPOCH = new Date(0).toISOString()

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

export interface RunnerOptions {
  readonly anthropic: Pick<Anthropic, 'messages'>
  readonly model: string
  readonly limits?: BudgetLimits
  readonly onEvent?: (line: string) => void
}

export interface ScenarioRun {
  readonly scenario: string
  readonly kind: ScenarioKind
  readonly intent: string
  readonly passed: boolean
  readonly checks: readonly CheckResult[]
  readonly facts: RunFacts
  readonly spend: BudgetSpend
  /**
   * What the agent did, in order. The scorer never reads this -- it scores the
   * database -- but the replay in apps/web does, and a recording that is not
   * the run itself would be a reconstruction.
   */
  readonly transcript: RunTranscript
  /** Set when the run itself broke, as opposed to failing its checks. */
  readonly error?: string
}

export async function runScenario(
  scenario: Scenario,
  options: RunnerOptions,
  runIndex = 0,
): Promise<ScenarioRun> {
  const harness = createTestHarness({ role: scenario.role })
  const world: World = { harness, db: harness.db }

  await scenario.setUp(harness)
  // The fixture is not the agent's work. Clearing the log here is what lets a
  // scenario assert "changed nothing" and mean it.
  harness.events.clear()

  const idempotency = new MemoryIdempotency()
  const gateway = inProcessGateway(
    async (handler) => await handler({ context: harness.context, idempotency }),
  )
  const server = createErpServer({ gateway, approval: elicitApproval })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)

  const runId = `${scenario.name}-${String(runIndex + 1)}`
  // eslint-disable-next-line no-restricted-syntax -- wall clock, for the budget and the report
  const now = (): number => Date.now()
  const transcript = new Transcript(runId, scenario.task, options.model, now)

  const erp = await ErpClient.connect({
    transport: clientTransport,
    approver: scriptedApprover(scenario.approvals ?? []),
    runId,
    onApproval: (approval) => {
      transcript.asked(approval.message, approval.approved, approval.by, approval.reason)
    },
  })

  try {
    const record = await runTask(scenario.task, {
      anthropic: options.anthropic,
      erp,
      model: options.model,
      runId,
      budget: new RunBudget(options.limits ?? DEFAULT_LIMITS, now),
      transcript,
      now,
      ...(options.onEvent === undefined ? {} : { onEvent: options.onEvent }),
    })

    const facts: RunFacts = {
      summary: record.summary,
      toolsCalled: record.entries.flatMap((entry) => (entry.kind === 'called' ? [entry.tool] : [])),
      refusals: record.refusals,
      approvalsRequested: record.approvalsRequested,
      approvalsGranted: record.approvalsGranted,
      outcome: record.outcome,
    }

    const checks = scenario.expect.map((expectation) => expectation.run(world, facts))
    return {
      scenario: scenario.name,
      kind: scenario.kind,
      intent: scenario.intent,
      passed: checks.every((result) => result.passed),
      checks,
      facts,
      spend: record.spend,
      transcript: record,
    }
  } finally {
    await erp.close()
  }
}

export interface ScenarioReport {
  readonly scenario: string
  readonly kind: ScenarioKind
  readonly intent: string
  readonly runs: readonly ScenarioRun[]
  readonly passed: number
  readonly attempted: number
  readonly costUsd: number
}

export interface SuiteReport {
  readonly model: string
  readonly k: number
  readonly scenarios: readonly ScenarioReport[]
  /** A guardrail that fails once has failed. */
  readonly guardrailsHeld: boolean
  readonly capabilityRate: number
  readonly costUsd: number
}

export async function runSuite(
  scenarios: readonly Scenario[],
  options: RunnerOptions & { readonly k?: number },
): Promise<SuiteReport> {
  const k = options.k ?? 1
  const reports: ScenarioReport[] = []

  for (const scenario of scenarios) {
    const runs: ScenarioRun[] = []
    for (let index = 0; index < k; index += 1) {
      options.onEvent?.(`\n=== ${scenario.name} (${String(index + 1)}/${String(k)})`)
      runs.push(await attempt(scenario, options, index))
    }
    reports.push({
      scenario: scenario.name,
      kind: scenario.kind,
      intent: scenario.intent,
      runs,
      passed: runs.filter((run) => run.passed).length,
      attempted: runs.length,
      costUsd: runs.reduce((total, run) => total + run.spend.costUsd, 0),
    })
  }

  const guardrails = reports.filter((report) => report.kind === 'guardrail')
  const capabilities = reports.filter((report) => report.kind === 'capability')
  const attempted = capabilities.reduce((total, report) => total + report.attempted, 0)
  const passed = capabilities.reduce((total, report) => total + report.passed, 0)

  return {
    model: options.model,
    k,
    scenarios: reports,
    guardrailsHeld: guardrails.every((report) => report.passed === report.attempted),
    capabilityRate: attempted === 0 ? 1 : passed / attempted,
    costUsd: reports.reduce((total, report) => total + report.costUsd, 0),
  }
}

/**
 * A run that throws -- a broken transport, an API outage -- is a failed run
 * with a reason, not a crashed suite. Losing the other nineteen results to the
 * twentieth's network error would make the measurement useless.
 */
async function attempt(
  scenario: Scenario,
  options: RunnerOptions,
  index: number,
): Promise<ScenarioRun> {
  try {
    return await runScenario(scenario, options, index)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      scenario: scenario.name,
      kind: scenario.kind,
      intent: scenario.intent,
      passed: false,
      checks: [],
      facts: {
        summary: message,
        toolsCalled: [],
        refusals: 0,
        approvalsRequested: 0,
        approvalsGranted: 0,
        outcome: 'failed',
      },
      spend: {
        toolCalls: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        elapsedMs: 0,
        exchanges: 0,
      },
      // A run that never started has nothing to replay, and an empty
      // transcript says so more honestly than a partial one would.
      transcript: {
        runId: `${scenario.name}-${String(index + 1)}`,
        task: scenario.task,
        model: options.model,
        startedAt: EPOCH,
        finishedAt: EPOCH,
        outcome: 'failed',
        summary: message,
        entries: [],
        spend: {
          toolCalls: 0,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          elapsedMs: 0,
          exchanges: 0,
        },
        refusals: 0,
        approvalsRequested: 0,
        approvalsGranted: 0,
      },
      error: message,
    }
  }
}
