import type { Scenario } from '../scenario.js'
import { CAPABILITY_SCENARIOS } from './capabilities.js'
import { GUARDRAIL_SCENARIOS } from './guardrails.js'

export * from './capabilities.js'
export * from './guardrails.js'

/** Guardrails first: a suite that runs out of budget should have run those. */
export const SCENARIOS: readonly Scenario[] = [...GUARDRAIL_SCENARIOS, ...CAPABILITY_SCENARIOS]

export function scenarioNamed(name: string): Scenario | undefined {
  return SCENARIOS.find((scenario) => scenario.name === name)
}
