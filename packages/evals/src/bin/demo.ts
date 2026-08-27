#!/usr/bin/env node
import Anthropic from '@anthropic-ai/sdk'
import { loadRepositoryEnvironment } from '@ledgerhand/agent'
import { writeFileSync } from 'node:fs'
import { runScenario, type ScenarioRun } from '../runner.js'
import { scenarioNamed } from '../scenarios/index.js'
import { narrate } from '../narration.js'
import type { Scenario } from '../scenario.js'

/**
 * The thirty seconds that are the whole argument.
 *
 *   pnpm --filter @ledgerhand/evals demo --out demo.cast
 *
 * Three acts, in one terminal, against the real agent, the real MCP server and
 * the real domain: a tool that is never offered, an approval that is granted,
 * and an approval that is refused. Nothing here is staged -- the lines are the
 * run's own output, and the verdicts are the scenario's own checks reading the
 * database afterwards. Only the pacing is authored, so a reader can follow it.
 *
 * Render it with:
 *   npx -p svg-term-cli svg-term --in demo.cast --out docs/demo.svg \
 *     --window --width 124 --height 40
 */

const DIM = '\u001b[2m'
const BOLD = '\u001b[1m'
const RESET = '\u001b[0m'
const GREEN = '\u001b[32m'
const RED = '\u001b[31m'
const CYAN = '\u001b[36m'
const YELLOW = '\u001b[33m'

interface Act {
  readonly scenario: string
  readonly heading: string
  /** Why this act is in the film, in one line. */
  readonly point: string
  readonly role: string
}

const ACTS: readonly Act[] = [
  {
    scenario: 'out-of-role-settlement',
    heading: '1 / the tool is never offered',
    point: 'Settling a receivable belongs to finance. This agent acts for a salesperson.',
    role: 'sales',
  },
  {
    scenario: 'daily-closing',
    heading: '2 / a person approves, and it happens',
    point: 'Closing the day is irreversible, so the ERP stops and asks before anything changes.',
    role: 'finance',
  },
  {
    scenario: 'declined-approval',
    heading: '3 / a person refuses, and nothing happens',
    point: 'The same operation, the same agent. The answer is no.',
    role: 'finance',
  },
]

/** An asciicast v2 event: seconds since start, stream, payload. */
type Frame = readonly [number, 'o', string]

class Cast {
  private readonly frames: Frame[] = []
  private at = 0

  write(text: string, pause = 0.35): void {
    this.frames.push([Number(this.at.toFixed(3)), 'o', text])
    this.at += pause
  }

  line(text = '', pause = 0.35): void {
    this.write(`${text}\r\n`, pause)
  }

  /** Typed a character at a time, because a prompt that appears is not a demo. */
  type(text: string, perCharacter = 0.035): void {
    for (const character of text) this.write(character, perCharacter)
    this.line('', 0.6)
  }

  toAsciicast(width: number, height: number, timestamp: number): string {
    const header = {
      version: 2,
      width,
      height,
      timestamp,
      env: { TERM: 'xterm-256color', SHELL: '/bin/bash' },
    }
    return [JSON.stringify(header), ...this.frames.map((frame) => JSON.stringify(frame))].join('\n')
  }
}

/** Wide enough for the longest tool name these three acts call. */
const TOOL_COLUMN = 32

/**
 * The terminal these frames are played back in. The summary is clipped to fit
 * one line of it rather than to a round number: a line that wraps in an image
 * wraps by character, and a showcase that splits a word down the middle reads
 * as an accident rather than a decision.
 */
const WIDTH = 124
const SUMMARY_LIMIT = WIDTH - 6

function pad(text: string, width: number): string {
  return text.length >= width ? `${text} ` : text + ' '.repeat(width - text.length)
}

function verdict(run: ScenarioRun): readonly string[] {
  return run.checks.map((check) =>
    check.passed
      ? `  ${GREEN}✓${RESET} ${DIM}${check.description}${RESET}`
      : `  ${RED}✗${RESET} ${check.description}${check.detail === undefined ? '' : ` -- ${check.detail}`}`,
  )
}

function approvalLine(run: ScenarioRun): string | null {
  const { approvalsRequested, approvalsGranted } = run.facts
  if (approvalsRequested === 0) return null
  return approvalsGranted > 0
    ? `  ${YELLOW}⏸${RESET}  the ERP stopped and asked a person   ${GREEN}→ approved${RESET}`
    : `  ${YELLOW}⏸${RESET}  the ERP stopped and asked a person   ${RED}→ refused${RESET}`
}

async function main(): Promise<void> {
  loadRepositoryEnvironment()
  const argv = process.argv.slice(2)
  const outIndex = argv.indexOf('--out')
  const out = outIndex >= 0 ? (argv[outIndex + 1] ?? 'demo.cast') : 'demo.cast'
  const model = process.env['AGENT_MODEL'] ?? 'claude-sonnet-5'

  let anthropic: Anthropic
  try {
    anthropic = new Anthropic()
  } catch {
    console.error('The demo runs the real agent: set ANTHROPIC_API_KEY in .env.')
    process.exit(2)
  }

  const cast = new Cast()
  cast.line()
  cast.line(
    `  ${BOLD}Ledgerhand${RESET} ${DIM}-- an AI agent operating an ERP, under guardrails the system enforces${RESET}`,
  )
  cast.line(
    `  ${DIM}Real agent, real MCP server, real domain. Nothing below is staged.${RESET}`,
    1.2,
  )

  for (const act of ACTS) {
    const scenario: Scenario | undefined = scenarioNamed(act.scenario)
    if (scenario === undefined) throw new Error(`No scenario named ${act.scenario}`)

    cast.line()
    cast.line(`  ${CYAN}${BOLD}${act.heading}${RESET}`, 0.5)
    cast.line(`  ${DIM}${act.point}${RESET}`, 0.8)
    cast.line()
    cast.write(`  ${DIM}$${RESET} ledgerhand-agent --as ${act.role}@ledgerhand.cloud`, 0.3)
    cast.line('', 0.4)
    cast.write(`  ${DIM}>${RESET} `, 0.2)
    cast.type(`"${scenario.task}"`)
    cast.line()

    const seen: string[] = []
    const run = await runScenario(scenario, {
      anthropic,
      model,
      onEvent: (line) => {
        const trimmed = line.trim()
        if (trimmed.startsWith('→')) seen.push(trimmed)
      },
    })

    // Two columns, headed the way the agent screen heads them: the call the
    // model made, and what that call means to somebody who has never read the
    // schema. The sentences come from the same table the site reads, so the
    // image cannot drift into describing a run differently from the app.
    cast.line(`    ${DIM}${pad('backstage', TOOL_COLUMN)}what is happening${RESET}`, 0.5)
    for (const call of seen) {
      const tool = call.replace(/^→\s*/, '')
      cast.line(
        `    ${CYAN}→${RESET} ${pad(tool, TOOL_COLUMN - 2)}${DIM}${narrate(tool, 'en')}${RESET}`,
        0.45,
      )
    }
    cast.line()

    const stopped = approvalLine(run)
    if (stopped !== null) cast.line(stopped, 1.0)

    const summary = run.facts.summary.replace(/\s+/g, ' ').trim()
    cast.line(
      `  ${DIM}${summary.slice(0, SUMMARY_LIMIT)}${summary.length > SUMMARY_LIMIT ? '...' : ''}${RESET}`,
      1.0,
    )
    cast.line()
    for (const check of verdict(run)) cast.line(check, 0.3)
    cast.line('', 1.4)

    process.stderr.write(`${act.scenario}: ${run.passed ? 'ok' : 'FAILED'}\n`)
  }

  cast.line()
  cast.line(`  ${DIM}None of the three lives in a prompt. See README.${RESET}`, 2.5)
  cast.line()

  // eslint-disable-next-line no-restricted-syntax -- the recording's wall clock
  const timestamp = Math.floor(Date.now() / 1000)
  writeFileSync(out, `${cast.toAsciicast(WIDTH, 40, timestamp)}\n`)
  process.stderr.write(`\nWrote ${out}\n`)
}

main().catch((error: unknown) => {
  console.error('[ledgerhand-demo]', error instanceof Error ? error.message : error)
  process.exit(2)
})
