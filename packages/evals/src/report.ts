import type { ScenarioRun, SuiteReport } from './runner.js'
import type { ScenarioKind } from './scenario.js'

/**
 * The report a person reads and the file CI keeps.
 *
 * Guardrails and capabilities are reported differently on purpose. A guardrail
 * is held or broken; a capability is a rate with the sample size next to it,
 * because "100%" over one run is not a number worth printing without saying
 * so.
 */

function rate(passed: number, attempted: number): string {
  const percentage = attempted === 0 ? 0 : Math.round((passed / attempted) * 100)
  return `${String(passed)}/${String(attempted)} (${String(percentage)}%)`
}

/**
 * A 95% Wilson score interval for a success rate.
 *
 * Ten out of ten is not evidence of a hundred per cent. It is evidence of
 * something above roughly seventy, and a report that prints the first number
 * without the second is inviting the reader to believe a certainty nobody
 * measured. Wilson rather than the textbook normal approximation because the
 * normal one is worst exactly where these results live: at the boundary, where
 * it produces intervals that run past 100% or collapse to zero width.
 */
export function wilsonInterval(
  passed: number,
  attempted: number,
): { readonly low: number; readonly high: number } {
  if (attempted === 0) return { low: 0, high: 1 }
  const z = 1.959963984540054
  const p = passed / attempted
  const denominator = 1 + (z * z) / attempted
  const centre = p + (z * z) / (2 * attempted)
  const spread = z * Math.sqrt((p * (1 - p)) / attempted + (z * z) / (4 * attempted * attempted))
  return {
    low: Math.max(0, (centre - spread) / denominator),
    high: Math.min(1, (centre + spread) / denominator),
  }
}

/** The rate with the interval beside it, which is the honest way to quote one. */
export function rateWithInterval(passed: number, attempted: number): string {
  const { low, high } = wilsonInterval(passed, attempted)
  const percent = (value: number): string => String(Math.round(value * 100))
  return `${rate(passed, attempted)}, 95% CI ${percent(low)}-${percent(high)}%`
}

export function toMarkdown(report: SuiteReport): string {
  const lines: string[] = []
  lines.push(`### Guardrails`, '')
  lines.push('| Scenario | Held | What it asks for |', '| --- | --- | --- |')
  for (const scenario of report.scenarios.filter((entry) => entry.kind === 'guardrail')) {
    const held = scenario.passed === scenario.attempted
    lines.push(
      `| \`${scenario.scenario}\` | ${held ? 'yes' : `**no** (${rate(scenario.passed, scenario.attempted)})`} | ${scenario.intent} |`,
    )
  }

  // The model is deliberately not named. The rate is still qualified -- it is
  // quoted with its k, and it belongs to whatever AGENT_MODEL was set to --
  // but the published table does not advertise which model that is.
  lines.push('', `### Capabilities (k=${String(report.k.capability)})`, '')
  lines.push('| Scenario | Success | What it asks for |', '| --- | --- | --- |')
  for (const scenario of report.scenarios.filter((entry) => entry.kind === 'capability')) {
    lines.push(
      `| \`${scenario.scenario}\` | ${rateWithInterval(scenario.passed, scenario.attempted)} | ${scenario.intent} |`,
    )
  }

  const capabilities = report.scenarios.filter((entry) => entry.kind === 'capability')
  const passed = capabilities.reduce((total, entry) => total + entry.passed, 0)
  const attempted = capabilities.reduce((total, entry) => total + entry.attempted, 0)
  lines.push(
    '',
    `Overall capability rate: ${rateWithInterval(passed, attempted)}. Cost of the suite: $${report.costUsd.toFixed(4)}.`,
  )

  const failures = report.scenarios.flatMap((scenario) =>
    scenario.runs.filter((run) => !run.passed).map((run) => ({ scenario: scenario.scenario, run })),
  )
  if (failures.length > 0) {
    lines.push('', '### What failed', '')
    for (const failure of failures) {
      lines.push(`- \`${failure.scenario}\`: ${describeFailure(failure.run)}`)
    }
  }

  return lines.join('\n')
}

function describeFailure(run: ScenarioRun): string {
  if (run.error !== undefined) return `the run itself failed -- ${run.error}`
  const broken = run.checks.filter((result) => !result.passed)
  return broken
    .map((result) =>
      result.detail === undefined
        ? `did not ${result.description}`
        : `did not ${result.description} (${result.detail})`,
    )
    .join('; ')
}

/** The terminal version: the same information, narrower. */
export function toText(report: SuiteReport): string {
  const lines: string[] = []
  for (const scenario of report.scenarios) {
    const held = scenario.passed === scenario.attempted
    const mark = held ? 'ok  ' : 'FAIL'
    lines.push(
      `${mark} ${scenario.kind === 'guardrail' ? 'guardrail ' : 'capability'} ${scenario.scenario.padEnd(26)} ${rate(scenario.passed, scenario.attempted)}`,
    )
    for (const run of scenario.runs.filter((entry) => !entry.passed)) {
      lines.push(`       ${describeFailure(run)}`)
    }
  }

  lines.push('')
  lines.push(
    report.guardrailsHeld
      ? 'every guardrail held'
      : 'A GUARDRAIL WAS BROKEN -- the run above is not a pass',
  )
  lines.push(
    `capability rate ${String(Math.round(report.capabilityRate * 100))}% over k=${String(report.k.capability)}, $${report.costUsd.toFixed(4)} spent`,
  )
  return lines.join('\n')
}

/**
 * ---------------------------------------------------------------------------
 * The file the README and the public page both read
 * ---------------------------------------------------------------------------
 * The full report carries every transcript, which is megabytes and is nobody's
 * business outside a debugging session. This is the part worth committing: the
 * scores, the sample sizes, and what the suite cost to produce them.
 *
 * It exists because the rates were being quoted in three places -- the README
 * table, the prose above it, and now a public page -- and three hand-kept
 * copies of a measurement are three chances to publish a number nobody
 * measured. `pnpm counts` writes the README from this file and fails the build
 * when they disagree.
 *
 * The model is deliberately absent, as it is from the published table. The rate
 * belongs to whatever `AGENT_MODEL` was set to and is quoted with its k for
 * exactly that reason, but naming the model turns a measurement into a
 * comparison nobody ran.
 */
export interface Interval {
  readonly low: number
  readonly high: number
}

export interface EvalsSummary {
  /** The day the suite was run, so a reader can tell a fresh number from an old one. */
  readonly measuredOn: string
  readonly k: SuiteReport['k']
  readonly totalRuns: number
  readonly costUsd: number
  readonly guardrailsHeld: boolean
  readonly capabilityRate: number
  /**
   * The 95% interval around that rate, computed here rather than by whoever
   * renders it. The README, the public page and the CI summary all quote this
   * number, and three implementations of the same statistic is three chances to
   * publish a different one.
   */
  readonly capabilityInterval: Interval
  readonly scenarios: readonly {
    readonly name: string
    readonly kind: ScenarioKind
    readonly intent: string
    readonly passed: number
    readonly attempted: number
    readonly interval: Interval
  }[]
}

export function toSummary(report: SuiteReport, measuredOn: string): EvalsSummary {
  const capabilities = report.scenarios.filter((entry) => entry.kind === 'capability')
  const passed = capabilities.reduce((total, entry) => total + entry.passed, 0)
  const attempted = capabilities.reduce((total, entry) => total + entry.attempted, 0)

  return {
    measuredOn,
    k: report.k,
    totalRuns: report.scenarios.reduce((total, scenario) => total + scenario.attempted, 0),
    costUsd: report.costUsd,
    guardrailsHeld: report.guardrailsHeld,
    capabilityRate: report.capabilityRate,
    capabilityInterval: wilsonInterval(passed, attempted),
    scenarios: report.scenarios.map((scenario) => ({
      name: scenario.scenario,
      kind: scenario.kind,
      intent: scenario.intent,
      passed: scenario.passed,
      attempted: scenario.attempted,
      interval: wilsonInterval(scenario.passed, scenario.attempted),
    })),
  }
}
