import type Anthropic from '@anthropic-ai/sdk'

/**
 * ---------------------------------------------------------------------------
 * What a run costs
 * ---------------------------------------------------------------------------
 * List prices per million tokens, so a run can be stopped at a dollar amount
 * rather than at a token count nobody can reason about. Two deliberate
 * choices:
 *
 *  - Introductory and promotional rates are ignored. A budget that assumes the
 *    discount is a budget that breaks when the discount ends, and charging the
 *    higher number can only make the cap arrive early.
 *  - An unknown model is priced at the most expensive model here rather than
 *    at zero. A pricing table that silently stops counting is worse than one
 *    that overestimates.
 */

export interface ModelPrice {
  readonly inputPerMillion: number
  readonly outputPerMillion: number
}

/** Cached input is written at 1.25x the input rate and read back at 0.1x. */
const CACHE_WRITE_MULTIPLIER = 1.25
const CACHE_READ_MULTIPLIER = 0.1

export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  'claude-fable-5': { inputPerMillion: 10, outputPerMillion: 50 },
  'claude-opus-5': { inputPerMillion: 5, outputPerMillion: 25 },
  'claude-opus-4-8': { inputPerMillion: 5, outputPerMillion: 25 },
  'claude-opus-4-7': { inputPerMillion: 5, outputPerMillion: 25 },
  'claude-opus-4-6': { inputPerMillion: 5, outputPerMillion: 25 },
  'claude-sonnet-5': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-sonnet-4-6': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-haiku-4-5': { inputPerMillion: 1, outputPerMillion: 5 },
}

const MOST_EXPENSIVE: ModelPrice = Object.values(MODEL_PRICES).reduce((worst, price) =>
  price.outputPerMillion > worst.outputPerMillion ? price : worst,
)

export function priceOf(model: string): ModelPrice {
  return MODEL_PRICES[model] ?? MOST_EXPENSIVE
}

export function isPriced(model: string): boolean {
  return MODEL_PRICES[model] !== undefined
}

/** Dollars for one exchange, cache reads and writes included. */
export function costOf(model: string, usage: Anthropic.Usage): number {
  const price = priceOf(model)
  const cacheWrite = usage.cache_creation_input_tokens ?? 0
  const cacheRead = usage.cache_read_input_tokens ?? 0

  const input =
    usage.input_tokens + cacheWrite * CACHE_WRITE_MULTIPLIER + cacheRead * CACHE_READ_MULTIPLIER

  return (input * price.inputPerMillion + usage.output_tokens * price.outputPerMillion) / 1_000_000
}

/** Input tokens actually paid for, for the input-token limit. */
export function billedInputTokens(usage: Anthropic.Usage): number {
  return (
    usage.input_tokens +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0)
  )
}
