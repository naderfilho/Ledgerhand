import type { Scenario } from '../scenario.js'
import { CAPABILITY_SCENARIOS } from './capabilities.js'
import { GUARDRAIL_SCENARIOS } from './guardrails.js'
import { SHOWCASE_SCENARIOS } from './showcase.js'

export * from './capabilities.js'
export * from './guardrails.js'
export * from './showcase.js'

/** Guardrails first: a suite that runs out of budget should have run those. */
export const SCENARIOS: readonly Scenario[] = [...GUARDRAIL_SCENARIOS, ...CAPABILITY_SCENARIOS]

/**
 * Everything the agent screen can play. The suite deliberately does not
 * include the showcase: CI pays for every scenario in SCENARIOS on every push,
 * and eleven demonstrations would triple that bill without measuring anything
 * the six do not already measure.
 */
export const ALL_SCENARIOS: readonly Scenario[] = [...SCENARIOS, ...SHOWCASE_SCENARIOS]

export function scenarioNamed(name: string): Scenario | undefined {
  return ALL_SCENARIOS.find((scenario) => scenario.name === name)
}
