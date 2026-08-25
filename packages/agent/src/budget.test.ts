import type Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'
import { DEFAULT_LIMITS, limitsFromEnvironment, RunBudget, type BudgetLimits } from './budget.js'
import { costOf, priceOf } from './pricing.js'

const usage = (overrides: Partial<Anthropic.Usage> = {}): Anthropic.Usage =>
  ({
    input_tokens: 1_000_000,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    ...overrides,
  }) as Anthropic.Usage

const limits = (overrides: Partial<BudgetLimits> = {}): BudgetLimits => ({
  ...DEFAULT_LIMITS,
  ...overrides,
})

/** A clock the test moves by hand, so a time limit is provable in a millisecond. */
function fakeClock(): { now: () => number; advance: (ms: number) => void } {
  let value = 0
  return { now: () => value, advance: (ms) => (value += ms) }
}

describe('pricing', () => {
  it('charges input, output and cache at their own rates', () => {
    expect(costOf('claude-sonnet-5', usage())).toBeCloseTo(3, 6)
    expect(
      costOf('claude-sonnet-5', usage({ input_tokens: 0, output_tokens: 1_000_000 })),
    ).toBeCloseTo(15, 6)
    // Writing the cache costs 1.25x the input rate, reading it 0.1x.
    expect(
      costOf('claude-sonnet-5', usage({ input_tokens: 0, cache_creation_input_tokens: 1_000_000 })),
    ).toBeCloseTo(3.75, 6)
    expect(
      costOf('claude-sonnet-5', usage({ input_tokens: 0, cache_read_input_tokens: 1_000_000 })),
    ).toBeCloseTo(0.3, 6)
  })

  it('prices an unknown model at the most expensive known rate rather than at zero', () => {
    expect(priceOf('claude-something-unreleased').outputPerMillion).toBe(
      priceOf('claude-fable-5').outputPerMillion,
    )
  })
})

describe('the run budget', () => {
  it('allows a run until a limit is reached', () => {
    const clock = fakeClock()
    const budget = new RunBudget(limits({ toolCalls: 2 }), clock.now)

    expect(budget.breach()).toBeNull()
    budget.chargeToolCall()
    expect(budget.breach()).toBeNull()
    budget.chargeToolCall()
    expect(budget.breach()?.limit).toBe('toolCalls')
  })

  it('ends the run on wall clock time even when nothing was spent', () => {
    const clock = fakeClock()
    const budget = new RunBudget(limits({ wallClockMs: 5_000 }), clock.now)

    clock.advance(4_999)
    expect(budget.breach()).toBeNull()
    clock.advance(1)
    expect(budget.breach()?.limit).toBe('wallClockMs')
  })

  it('counts cached tokens as input, because they are billed', () => {
    const clock = fakeClock()
    const budget = new RunBudget(limits(), clock.now)

    budget.chargeExchange(
      'claude-sonnet-5',
      usage({ input_tokens: 10, cache_read_input_tokens: 90, output_tokens: 5 }),
    )

    expect(budget.spend().inputTokens).toBe(100)
    expect(budget.spend().outputTokens).toBe(5)
    expect(budget.spend().exchanges).toBe(1)
  })

  it('stops the run when the money runs out, whatever the token counts say', () => {
    const clock = fakeClock()
    const budget = new RunBudget(limits({ costUsd: 1, inputTokens: 10_000_000 }), clock.now)

    budget.chargeExchange('claude-sonnet-5', usage({ input_tokens: 400_000 }))
    const breach = budget.breach()

    expect(breach?.limit).toBe('costUsd')
    expect(breach?.message).toContain('$1.00')
  })

  it('reads its limits from the environment and refuses nonsense', () => {
    expect(limitsFromEnvironment({ AGENT_MAX_TOOL_CALLS: '7' }).toolCalls).toBe(7)
    expect(limitsFromEnvironment({}).toolCalls).toBe(DEFAULT_LIMITS.toolCalls)
    expect(() => limitsFromEnvironment({ AGENT_MAX_COST_USD: 'plenty' })).toThrow(
      /must be a positive number/,
    )
    expect(() => limitsFromEnvironment({ AGENT_MAX_COST_USD: '-1' })).toThrow()
  })
})
