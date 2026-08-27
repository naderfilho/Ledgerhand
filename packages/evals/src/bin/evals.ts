#!/usr/bin/env node
import Anthropic from '@anthropic-ai/sdk'
import { loadRepositoryEnvironment } from '@ledgerhand/agent'
import { writeFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { toMarkdown, toSummary, toText } from '../report.js'
import { runSuite } from '../runner.js'
import { SCENARIOS, scenarioNamed } from '../scenarios/index.js'
import type { SampleSize } from '../runner.js'
import type { Scenario } from '../scenario.js'

/**
 * The eval suite.
 *
 *   pnpm --filter @ledgerhand/evals evals            one run per scenario
 *   pnpm --filter @ledgerhand/evals evals --k 3      three of everything
 *   pnpm --filter @ledgerhand/evals evals --capability-k 10   raise only the rates
 *   pnpm --filter @ledgerhand/evals evals --scenario replenishment
 *
 * Exits non-zero when a guardrail breaks. A capability that misses does not
 * fail the command: it is a measurement, and a build that goes red on model
 * variance teaches people to ignore the build.
 */

interface Arguments {
  readonly k: SampleSize
  readonly scenarios: readonly Scenario[]
  readonly markdown: string | null
  readonly json: string | null
  readonly summary: string | null
  readonly quiet: boolean
}

function parse(argv: readonly string[]): Arguments {
  let guardrailK = 1
  let capabilityK: number | null = null
  let scenarios = SCENARIOS
  let markdown: string | null = null
  let json: string | null = null
  let summary: string | null = null
  let quiet = false

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? ''
    const next = (): string => {
      index += 1
      return argv[index] ?? ''
    }

    if (argument === '--k') guardrailK = Number(next())
    else if (argument === '--capability-k') capabilityK = Number(next())
    else if (argument === '--markdown') markdown = next()
    else if (argument === '--json') json = next()
    else if (argument === '--summary') summary = next()
    else if (argument === '--quiet') quiet = true
    else if (argument === '--scenario') {
      const name = next()
      const found = scenarioNamed(name)
      if (found === undefined) {
        throw new Error(
          `No scenario named "${name}". Available: ${SCENARIOS.map((entry) => entry.name).join(', ')}.`,
        )
      }
      scenarios = [found]
    }
  }

  // `--k` alone still means "this many of everything", which is what CI wants
  // and what every existing invocation means. `--capability-k` raises only the
  // half that is a rate.
  const k: SampleSize = { guardrail: guardrailK, capability: capabilityK ?? guardrailK }
  for (const [name, value] of Object.entries(k)) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`the ${name} k must be a positive integer.`)
    }
  }
  return { k, scenarios, markdown, json, summary, quiet }
}

/**
 * Resolves an output path against the directory the command was typed in.
 *
 * `pnpm --filter @ledgerhand/evals evals` runs with the working directory set
 * to this package, so `--summary docs/metrics/evals.json` -- typed at the
 * repository root, meaning the file the README and the public page read --
 * silently aimed at `packages/evals/docs/metrics/`. It did not fail until the
 * suite had finished and spent the money, which is the worst moment for a path
 * to be wrong. `INIT_CWD` is where the person actually was.
 */
function where(target: string): string {
  const from = process.env['INIT_CWD']
  return from === undefined || isAbsolute(target) ? target : resolve(from, target)
}

async function main(): Promise<void> {
  loadRepositoryEnvironment()
  const options = parse(process.argv.slice(2))
  const model = process.env['AGENT_MODEL'] ?? 'claude-sonnet-5'

  let anthropic: Anthropic
  try {
    anthropic = new Anthropic()
  } catch {
    console.error(
      'The eval suite needs Anthropic credentials: set ANTHROPIC_API_KEY in .env. Everything else in this repository runs without one.',
    )
    process.exit(2)
  }

  const report = await runSuite(options.scenarios, {
    anthropic,
    model,
    k: options.k,
    ...(options.quiet
      ? {}
      : {
          onEvent: (line: string) => {
            process.stderr.write(`${line}\n`)
          },
        }),
  })

  if (options.markdown !== null) writeFileSync(where(options.markdown), `${toMarkdown(report)}\n`)
  if (options.json !== null) {
    writeFileSync(where(options.json), `${JSON.stringify(report, null, 2)}\n`)
  }
  if (options.summary !== null) {
    // The date the suite ran, not the moment it finished: a measurement is
    // quoted by the day it was taken, and a timestamp to the millisecond in a
    // committed file is a diff on every run for no information.
    // eslint-disable-next-line no-restricted-syntax -- the composition root's clock
    const measuredOn = new Date().toISOString().slice(0, 10)
    writeFileSync(
      where(options.summary),
      `${JSON.stringify(toSummary(report, measuredOn), null, 2)}\n`,
    )
  }
  process.stdout.write(`\n${toText(report)}\n`)

  process.exit(report.guardrailsHeld ? 0 : 1)
}

main().catch((error: unknown) => {
  console.error('[ledgerhand-evals]', error instanceof Error ? error.message : error)
  process.exit(2)
})
