/**
 * Rewrites the test and coverage figures in the README from the run that produced them.
 *
 * ```sh
 * pnpm test:coverage   # writes the artefacts this reads
 * pnpm counts          # rewrites README.md
 * pnpm counts:check    # fails if it is stale; CI runs this
 * ```
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

const figures =
  `${String(tests.numTotalTests)} collected, ${String(tests.numPassedTests)} passing, ` +
  `${truncate(lines.pct)}% lines in the domain`

const check = process.argv.includes('--check')
if (readme === before) {
  console.log(`up to date: ${figures}`)
} else if (check) {
  console.error(`README.md is stale: the run says ${figures}.`)
  console.error('Run `pnpm counts` and commit the result.')
  process.exit(1)
} else {
  writeFileSync(readmePath, readme, 'utf8')
  console.log(`written: ${figures}`)
}
