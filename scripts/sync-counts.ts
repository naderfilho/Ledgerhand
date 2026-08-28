/**
 * Rewrites the measured figures in the README from the runs that produced them.
 *
 * ```sh
 * pnpm test:coverage   # writes the test and coverage artefacts this reads
 * pnpm evals ...       # writes docs/metrics/evals.json, and costs money
 * pnpm counts          # rewrites README.md and docs/metrics/tests.json
 * pnpm counts:check    # fails if either is stale; CI runs this
 * ```
 *
 * Two kinds of figure, and they arrive differently. The test counts come from a run that
 * happens on every push, so they are read straight out of `coverage/`. The eval rates come
 * from a run that calls a paid API, so they are read out of a committed file that somebody
 * regenerated deliberately -- which is also the file the public page reads, so the README,
 * the page and the suite cannot hold three different opinions about the same measurement.
 *
 * The testing block carries one count per workspace project, a total, the number of placeholders
 * that skip without Docker, and three coverage percentages for the domain. All were typed by hand, and
 * one of them had already drifted — the block claimed 96.8% lines against the 96.9% the run
 * reports. Nothing here is hard to keep right; it is just impossible to keep right forever by
 * remembering to.
 *
 * The numbers are replaced in place, and the whitespace before each one is adjusted so the columns
 * stay aligned when a count changes width. The prose stays in the README, where it belongs.
 */

import type { EvalsSummary } from '@ledgerhand/evals'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const at = (path: string): string => fileURLToPath(new URL(`../${path}`, import.meta.url))

interface AssertionResult {
  readonly status: string
  readonly fullName: string
}

interface FileResult {
  readonly name: string
  readonly assertionResults: readonly AssertionResult[]
}

interface TestResults {
  readonly numTotalTests: number
  readonly numPassedTests: number
  readonly numFailedTests: number
  readonly numPendingTests: number
  readonly testResults: readonly FileResult[]
}

interface CoverageSummary {
  readonly total: {
    readonly lines: { readonly pct: number }
    readonly functions: { readonly pct: number }
    readonly branches: { readonly pct: number }
  }
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    throw new Error(`${path} is missing or unreadable. Run \`pnpm test:coverage\` first.`)
  }
}

const tests = readJson(at('coverage/test-results.json')) as TestResults
const coverage = readJson(at('coverage/coverage-summary.json')) as CoverageSummary

if (tests.numFailedTests > 0) {
  throw new Error(
    `the last run had ${String(tests.numFailedTests)} failing test(s); fix those first`,
  )
}

/**
 * A run without the integration database is not a run this may be written from.
 *
 * Eighteen tests skip themselves when Postgres is not on 5433, and the figures
 * that come back are all true about that run and all wrong about the README:
 * the block would go on to say "eighteen of them are the placeholders that
 * report a missing database", when two of them are and the other sixteen are
 * row level security going unmeasured.
 *
 * So the check is not on the count. It is on which tests were pending: the two
 * placeholders exist in order to be pending, and anything else pending means
 * the run measured less than the sentence claims.
 */
const unmeasured = tests.testResults.flatMap((file) =>
  file.assertionResults.filter(
    (test) =>
      test.status !== 'passed' && test.status !== 'failed' && !test.fullName.includes('(skipped)'),
  ),
)
if (unmeasured.length > 0) {
  throw new Error(
    `${String(unmeasured.length)} test(s) skipped, so this run cannot be written up as a full one.\n` +
      'Start the throwaway database and run `pnpm test:coverage` again:\n' +
      '  docker compose -f docker/compose.yml up -d postgres-test',
  )
}

/**
 * Tests per workspace project, counted from the file paths the reporter wrote.
 *
 * Both trees, because the tests are no longer all in `packages`: the public
 * landing page put a handful in `apps/web`, and a total that silently left them
 * out would be exactly the drift this script exists to prevent.
 */
const perProject = new Map<string, number>()
for (const file of tests.testResults) {
  const match = /(packages|apps)[\\/]([^\\/]+)[\\/]/.exec(file.name)
  const tree = match?.[1]
  const project = match?.[2]
  if (tree === undefined || project === undefined) continue
  const key = `${tree}/${project}`
  perProject.set(key, (perProject.get(key) ?? 0) + file.assertionResults.length)
}

/** Truncated, never rounded up: a README should not claim a tenth nobody measured. */
const truncate = (pct: number): string => (Math.floor(pct * 10) / 10).toFixed(1)

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']
const word = (n: number): string => WORDS[n] ?? String(n)

const readmePath = at('README.md')
let readme = readFileSync(readmePath, 'utf8')
const before = readme

/**
 * Replaces a number while keeping the column it sits in.
 *
 * The run of spaces before the number absorbs the change, so a count going from 99 to 100 does not
 * push the rest of the line one character right.
 */
function replaceAligned(pattern: RegExp, value: string): void {
  readme = readme.replace(pattern, (whole: string, gap: string, old: string) => {
    // An empty gap means the number is not in a column: replace it and leave the line alone.
    const width = gap.length === 0 ? 0 : Math.max(1, gap.length + old.length - value.length)
    return whole.replace(`${gap}${old}`, `${' '.repeat(width)}${value}`)
  })
}

for (const [project, count] of perProject) {
  const line = new RegExp(`${project}( +)(\\d+)(?= tests)`)
  if (!line.test(readme)) {
    throw new Error(`README.md has no line for ${project}; add one, or update this script`)
  }
  replaceAligned(line, String(count))
}

replaceAligned(/()(\d+)(?= collected)/, String(tests.numTotalTests))
replaceAligned(/()(\d+)(?= run and pass)/, String(tests.numPassedTests))
readme = readme.replace(
  /\b\w+ of them are the placeholders/,
  `${word(tests.numPendingTests)} of them are the placeholders`,
)

const { lines, functions, branches } = coverage.total
readme = readme.replace(
  /[\d.]+% lines, [\d.]+% functions, [\d.]+% branches/,
  `${truncate(lines.pct)}% lines, ${truncate(functions.pct)}% functions, ${truncate(branches.pct)}% branches`,
)

/**
 * The same two figures again, in the summary table near the top.
 *
 * They were not maintained here, and the moment the testing block moved they
 * were left claiming 317 passing against 341 -- a second copy of a number, kept
 * by hand, drifting the first time anything changed. Which is the argument this
 * whole file exists to make, made accidentally.
 *
 * Whole percent there rather than a tenth, because that row is a summary and
 * the block below is the measurement.
 */
readme = readme.replace(
  /\d+ passing, \d+% line coverage on the domain/,
  `${String(tests.numPassedTests)} passing, ${String(Math.floor(lines.pct))}% line coverage on the domain`,
)

/**
 * ---------------------------------------------------------------------------
 * The eval rates
 * ---------------------------------------------------------------------------
 * Read from the committed summary rather than measured here, because measuring
 * costs money and a README rebuild must not. `pnpm evals --summary` writes it.
 */
const evals = readJson(at('docs/metrics/evals.json')) as EvalsSummary

/**
 * A markdown table, padded the way Prettier pads one.
 *
 * Emitting it unaligned and letting `pnpm format` fix it afterwards would work
 * once and then fail forever: `format:check` runs before `counts:check` in CI,
 * so a table this script wrote would be reported as badly formatted rather than
 * as out of date.
 */
function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const widths = header.map((cell, column) =>
    Math.max(cell.length, ...rows.map((row) => (row[column] ?? '').length)),
  )
  const line = (cells: readonly string[]): string =>
    `| ${cells.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join(' | ')} |`
  return [
    line(header),
    `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`,
    ...rows.map(line),
  ].join('\n')
}

const percent = (passed: number, attempted: number): number =>
  attempted === 0 ? 0 : Math.round((passed / attempted) * 100)

const rates = table(
  ['Scenario', 'Kind', 'Result'],
  evals.scenarios.map((scenario) => {
    const score = `${String(scenario.passed)}/${String(scenario.attempted)}`
    return [
      `\`${scenario.name}\``,
      scenario.kind,
      scenario.kind === 'guardrail'
        ? `${scenario.passed === scenario.attempted ? 'held' : '**BROKEN**'}, ${score}`
        : `${score} (${String(percent(scenario.passed, scenario.attempted))}%)`,
    ]
  }),
)

/**
 * The whole rates section, prose included.
 *
 * The prose carries three measured figures of its own -- the two sample sizes,
 * the number of runs and what they cost -- and leaving those to be retyped
 * beside a generated table would put the drift back one paragraph higher.
 */
const capabilityRuns = evals.scenarios.filter((scenario) => scenario.kind === 'capability')
const capabilityScore = `${String(capabilityRuns.reduce((total, scenario) => total + scenario.passed, 0))}/${String(capabilityRuns.reduce((total, scenario) => total + scenario.attempted, 0))} over k=${String(evals.k.capability)}`
const oneDecimal = (value: number): string => (Math.round(value * 1000) / 10).toFixed(1)
const confidence = `${oneDecimal(evals.capabilityInterval.low)}% to ${oneDecimal(evals.capabilityInterval.high)}%`

const ratesSection = [
  `Guardrails at k=${String(evals.k.guardrail)} and capabilities at k=${String(evals.k.capability)} -- ${String(evals.totalRuns)} runs, $${evals.costUsd.toFixed(2)} of API credit, against the same English tasks the site shows, on the model set in \`AGENT_MODEL\`. The two sample sizes differ because the two things do: a guardrail is a gate and repeating it teaches nothing once it has held, while a capability is a rate, and a rate quoted over three runs invites the obvious question. The rate belongs to that model: another one gives another number, which is why it is quoted with the k and not on its own.`,
  '',
  rates,
  '',
  /**
   * The interval goes on the total rather than on every row. Ten out of ten is
   * a 95% interval of 72% to 100% however good the model is, and thirteen rows
   * repeating that would drown the figure that carries: the runs pooled.
   */
  evals.guardrailsHeld
    ? `Every guardrail held. The capability rate is ${capabilityScore}, a 95% confidence interval of ${confidence} -- quoted with the interval because a rate printed without one invites a precision nobody measured.`
    : `A GUARDRAIL BROKE. The capability rate was ${capabilityScore} (95% CI ${confidence}), and it is not the headline.`,
].join('\n')

const ratesRegion = /(?<=### The rates\n\n)[\s\S]*?(?=\n\n### What the first run)/
if (!ratesRegion.test(readme)) {
  throw new Error('README.md has no "### The rates" section for the eval figures to go in')
}
// A function, not the string: a cost of `$1.40` in a replacement string is read
// as capture group one followed by ".40".
readme = readme.replace(ratesRegion, () => ratesSection)

/**
 * ---------------------------------------------------------------------------
 * The artefacts
 * ---------------------------------------------------------------------------
 * `docs/metrics/tests.json` is this run, reduced to the figures somebody might
 * want to render. It is committed because `coverage/` is not: the public page
 * is built on a machine that has never run the test suite, and a page that
 * cannot read a measurement would have to be told one.
 */
const testsArtefact =
  JSON.stringify(
    {
      total: tests.numTotalTests,
      passed: tests.numPassedTests,
      pending: tests.numPendingTests,
      perProject: Object.fromEntries([...perProject].sort(([a], [b]) => a.localeCompare(b))),
      coverage: {
        lines: Number(truncate(lines.pct)),
        functions: Number(truncate(functions.pct)),
        branches: Number(truncate(branches.pct)),
      },
    },
    null,
    2,
  ) + '\n'

/** No date in here on purpose: a timestamp would make CI stale every midnight. */
const testsPath = at('docs/metrics/tests.json')
const testsBefore = ((): string => {
  try {
    return readFileSync(testsPath, 'utf8')
  } catch {
    return ''
  }
})()

const figures =
  `${String(tests.numTotalTests)} collected, ${String(tests.numPassedTests)} passing, ` +
  `${truncate(lines.pct)}% lines in the domain, ` +
  `evals k=${String(evals.k.guardrail)}/${String(evals.k.capability)} from ${evals.measuredOn}`

const stale: string[] = []
if (readme !== before) stale.push('README.md')
if (testsArtefact !== testsBefore) stale.push('docs/metrics/tests.json')

const check = process.argv.includes('--check')
if (stale.length === 0) {
  console.log(`up to date: ${figures}`)
} else if (check) {
  console.error(`${stale.join(' and ')} stale: the runs say ${figures}.`)
  console.error('Run `pnpm counts` and commit the result.')
  process.exit(1)
} else {
  writeFileSync(readmePath, readme, 'utf8')
  writeFileSync(testsPath, testsArtefact, 'utf8')
  console.log(`written: ${figures}`)
}
