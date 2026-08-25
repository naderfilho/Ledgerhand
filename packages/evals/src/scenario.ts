import type { Role } from '@ledgerhand/domain'
import type { InMemoryDatabase, TestHarness } from '@ledgerhand/domain/testing'

/**
 * ---------------------------------------------------------------------------
 * What a scenario is
 * ---------------------------------------------------------------------------
 * A fixed starting state, a sentence a person might actually say, and a set of
 * checks over what the business looked like afterwards.
 *
 * The checks read the database and the event log, never the agent's account of
 * itself. "It said it created the purchase order" is not evidence; a purchase
 * order in the table is. That is the whole difference between a demo and a
 * measurement, and it is why there is no model judging the output here.
 *
 * Scenarios come in two kinds, and they are reported differently:
 *
 *   guardrail   The system must refuse, stop, or stay put. These are pass or
 *               fail, and CI fails with them: a guardrail that works four
 *               times out of five does not work.
 *   capability  The agent has to get something done. These are scored as a
 *               rate over k runs, because a language model is not a function.
 */

export type ScenarioKind = 'guardrail' | 'capability'

export interface World {
  readonly harness: TestHarness
  readonly db: InMemoryDatabase
}

export interface CheckResult {
  readonly passed: boolean
  readonly description: string
  /** What was found instead, when it failed. */
  readonly detail?: string
}

export interface Check {
  readonly description: string
  run(world: World, outcome: RunFacts): CheckResult
}

/** The parts of a finished run a check may look at, besides the world. */
export interface RunFacts {
  readonly summary: string
  readonly toolsCalled: readonly string[]
  readonly refusals: number
  readonly approvalsRequested: number
  readonly approvalsGranted: number
  readonly outcome: string
}

export interface Scenario {
  readonly name: string
  readonly kind: ScenarioKind
  /** One line, for the report. */
  readonly intent: string
  /** The role the agent acts as. Half of these scenarios are about it. */
  readonly role: Role
  /** Builds the starting state through the real domain, never by writing rows. */
  setUp(harness: TestHarness): Promise<void> | void
  /** The task, as a person would say it. */
  readonly task: string
  /**
   * The answers a person gives when the ERP asks for approval, in order. An
   * empty list means nobody is available, and the ERP will refuse.
   */
  readonly approvals?: readonly boolean[]
  readonly expect: readonly Check[]
}

export function check(
  description: string,
  run: (world: World, facts: RunFacts) => boolean | { passed: boolean; detail?: string },
): Check {
  return {
    description,
    run: (world, facts) => {
      const outcome = run(world, facts)
      return typeof outcome === 'boolean'
        ? { passed: outcome, description }
        : {
            passed: outcome.passed,
            description,
            ...(outcome.detail === undefined ? {} : { detail: outcome.detail }),
          }
    },
  }
}
