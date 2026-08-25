import type Anthropic from '@anthropic-ai/sdk'
import { billedInputTokens, costOf } from './pricing.js'

/**
 * ---------------------------------------------------------------------------
 * The run budget
 * ---------------------------------------------------------------------------
 * Five limits, because an agent fails in five different ways: it loops, it
 * reads too much, it writes too much, it costs too much, or it simply never
 * finishes. Any one of them ends the run.
 *
 * The budget is enforced by the code that drives the loop, not asked for in
 * the prompt. A model cannot be talked out of a `while` condition.
 *
 * Limits are checked between steps rather than predicted before them, so a run
 * can overshoot by at most the step that broke the limit. Predicting the cost
 * of a step before making it would mean guessing the size of a tool result
 * that has not happened yet, and a guess in the safety mechanism is worse than
 * a bounded overshoot.
 */

export interface BudgetLimits {
  readonly toolCalls: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly costUsd: number
  readonly wallClockMs: number
}

export interface BudgetSpend {
  readonly toolCalls: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly costUsd: number
  readonly elapsedMs: number
  readonly exchanges: number
}

export interface BudgetBreach {
  readonly limit: keyof BudgetLimits
  readonly used: number
  readonly allowed: number
  readonly message: string
}

export const DEFAULT_LIMITS: BudgetLimits = {
  toolCalls: 25,
  inputTokens: 200_000,
  outputTokens: 16_000,
  costUsd: 1,
  wallClockMs: 180_000,
}

export class RunBudget {
  private toolCalls = 0
  private inputTokens = 0
  private outputTokens = 0
  private costUsd = 0
  private exchanges = 0
  private readonly startedAt: number

  /**
   * `now` is injected rather than read: the eval suite replays a run with a
   * pinned clock, and a test for "the wall clock limit ends the run" should not
   * take three minutes to prove it.
   */
  constructor(
    readonly limits: BudgetLimits,
    private readonly now: () => number,
  ) {
    this.startedAt = now()
  }

  chargeExchange(model: string, usage: Anthropic.Usage): void {
    this.exchanges += 1
    this.inputTokens += billedInputTokens(usage)
    this.outputTokens += usage.output_tokens
    this.costUsd += costOf(model, usage)
  }

  chargeToolCall(count = 1): void {
    this.toolCalls += count
  }

  spend(): BudgetSpend {
    return {
      toolCalls: this.toolCalls,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      costUsd: this.costUsd,
      elapsedMs: this.now() - this.startedAt,
      exchanges: this.exchanges,
    }
  }

  /** The first limit that has been reached, or null while the run may continue. */
  breach(): BudgetBreach | null {
    const spend = this.spend()
    const checks: readonly { limit: keyof BudgetLimits; used: number; allowed: number }[] = [
      { limit: 'toolCalls', used: spend.toolCalls, allowed: this.limits.toolCalls },
      { limit: 'inputTokens', used: spend.inputTokens, allowed: this.limits.inputTokens },
      { limit: 'outputTokens', used: spend.outputTokens, allowed: this.limits.outputTokens },
      { limit: 'costUsd', used: spend.costUsd, allowed: this.limits.costUsd },
      { limit: 'wallClockMs', used: spend.elapsedMs, allowed: this.limits.wallClockMs },
    ]

    for (const check of checks) {
      if (check.used >= check.allowed) {
        return { ...check, message: describe(check.limit, check.used, check.allowed) }
      }
    }
    return null
  }
}

function describe(limit: keyof BudgetLimits, used: number, allowed: number): string {
  switch (limit) {
    case 'toolCalls':
      return `The run reached its limit of ${String(allowed)} tool calls.`
    case 'inputTokens':
      return `The run reached its limit of ${String(allowed)} input tokens.`
    case 'outputTokens':
      return `The run reached its limit of ${String(allowed)} output tokens.`
    case 'costUsd':
      return `The run reached its cost limit of $${allowed.toFixed(2)} (spent $${used.toFixed(4)}).`
    case 'wallClockMs':
      return `The run reached its time limit of ${String(Math.round(allowed / 1000))} seconds.`
  }
}

export function limitsFromEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): BudgetLimits {
  const read = (name: string, fallback: number): number => {
    const raw = environment[name]
    if (raw === undefined || raw.trim() === '') return fallback
    const value = Number(raw)
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${name} must be a positive number. Received "${raw}".`)
    }
    return value
  }

  return {
    toolCalls: read('AGENT_MAX_TOOL_CALLS', DEFAULT_LIMITS.toolCalls),
    inputTokens: read('AGENT_MAX_INPUT_TOKENS', DEFAULT_LIMITS.inputTokens),
    outputTokens: read('AGENT_MAX_OUTPUT_TOKENS', DEFAULT_LIMITS.outputTokens),
    costUsd: read('AGENT_MAX_COST_USD', DEFAULT_LIMITS.costUsd),
    wallClockMs: read('AGENT_MAX_WALL_CLOCK_MS', DEFAULT_LIMITS.wallClockMs),
  }
}
