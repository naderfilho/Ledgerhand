#!/usr/bin/env node
import Anthropic from '@anthropic-ai/sdk'
import { loadRepositoryEnvironment } from '@ledgerhand/agent'
import { writeFileSync } from 'node:fs'
import { toMarkdown, toText } from '../report.js'
import { runSuite } from '../runner.js'
import { SCENARIOS, scenarioNamed } from '../scenarios/index.js'
import type { Scenario } from '../scenario.js'

/**
 * The eval suite.
 *
 *   pnpm --filter @ledgerhand/evals evals            one run per scenario
 *   pnpm --filter @ledgerhand/evals evals --k 3      three, for a real rate
 *   pnpm --filter @ledgerhand/evals evals --scenario replenishment
 *
 * Exits non-zero when a guardrail breaks. A capability that misses does not
 * fail the command: it is a measurement, and a build that goes red on model
 * variance teaches people to ignore the build.
 */

interface Arguments {
  readonly k: number
  readonly scenarios: readonly Scenario[]
  readonly markdown: string | null
  readonly json: string | null
  readonly quiet: boolean
}

function parse(argv: readonly string[]): Arguments {
  let k = 1
  let scenarios = SCENARIOS
  let markdown: string | null = null
  let json: string | null = null
  let quiet = false

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? ''
    const next = (): string => {
      index += 1
      return argv[index] ?? ''
    }

    if (argument === '--k') k = Number(next())
    else if (argument === '--markdown') markdown = next()
    else if (argument === '--json') json = next()
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

  if (!Number.isInteger(k) || k < 1) throw new Error('--k must be a positive integer.')
  return { k, scenarios, markdown, json, quiet }
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

  if (options.markdown !== null) writeFileSync(options.markdown, `${toMarkdown(report)}\n`)
  if (options.json !== null) writeFileSync(options.json, `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`\n${toText(report)}\n`)

  process.exit(report.guardrailsHeld ? 0 : 1)
}

main().catch((error: unknown) => {
  console.error('[ledgerhand-evals]', error instanceof Error ? error.message : error)
  process.exit(2)
})
