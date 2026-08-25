import type { ScenarioRun, SuiteReport } from './runner.js'

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

  lines.push('', `### Capabilities (${report.model}, k=${String(report.k)})`, '')
  lines.push('| Scenario | Success | What it asks for |', '| --- | --- | --- |')
  for (const scenario of report.scenarios.filter((entry) => entry.kind === 'capability')) {
    lines.push(
      `| \`${scenario.scenario}\` | ${rate(scenario.passed, scenario.attempted)} | ${scenario.intent} |`,
    )
  }

  lines.push(
    '',
    `Overall capability rate: ${String(Math.round(report.capabilityRate * 100))}%. Cost of the suite: $${report.costUsd.toFixed(4)}.`,
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
    `capability rate ${String(Math.round(report.capabilityRate * 100))}% over k=${String(report.k)}, $${report.costUsd.toFixed(4)} spent`,
  )
  return lines.join('\n')
}
