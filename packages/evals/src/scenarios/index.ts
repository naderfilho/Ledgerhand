import type { Scenario } from '../scenario.js'
import { CAPABILITY_SCENARIOS } from './capabilities.js'
import { GUARDRAIL_SCENARIOS } from './guardrails.js'
import { SHOWCASE_SCENARIOS } from './showcase.js'

/**
 * ---------------------------------------------------------------------------
 * Everything the suite scores
 * ---------------------------------------------------------------------------
 * Guardrails first: a suite that runs out of budget should have run those.
 *
 * The showcase used to sit outside this list, on the argument that eleven more
 * demonstrations would multiply the bill "without measuring anything the six do
 * not already measure". That was wrong twice over. Each of them ends in checks
 * that read the database -- an archive recorded, an approval asked for, a
 * settlement written, nothing changed -- so they were always measurements
 * rather than demonstrations. And three capability scenarios is a denominator
 * anybody reading the published rate is right to push back on, however large
 * the k beside it: a rate over three tasks measures three tasks.
 *
 * Fourteen capability scenarios now cover archiving, receiving, adjusting,
 * invoicing, cancelling, settling, reversing, reporting and reading the audit
 * log, which is most of what the business does. The cost is still bounded
 * where it matters: CI runs the whole list at k=1.
 */
export const SCENARIOS: readonly Scenario[] = [
  ...GUARDRAIL_SCENARIOS,
  ...CAPABILITY_SCENARIOS,
  ...SHOWCASE_SCENARIOS,
]

export * from './capabilities.js'
export * from './guardrails.js'
export * from './showcase.js'

export function scenarioNamed(name: string): Scenario | undefined {
  return SCENARIOS.find((scenario) => scenario.name === name)
}
