#!/usr/bin/env node
import Anthropic from '@anthropic-ai/sdk'
import { writeFileSync } from 'node:fs'
import { runScenario } from '../runner.js'
import { scenarioNamed } from '../scenarios/index.js'
import type { Scenario } from '../scenario.js'

/**
 * ---------------------------------------------------------------------------
 * Recording the runs the site plays back
 * ---------------------------------------------------------------------------
 *   pnpm --filter @ledgerhand/evals record-replay --out ../../apps/web/src/server/agent-replay.json
 *
 * The site shows the agent working without an API key behind it, because a
 * public page that spends money on every visitor is a page that gets turned
 * off. What it plays is not a mock: it is six real runs of the six eval
 * scenarios, with the tool calls in the order they were made, the arguments
 * that were sent, what came back, and the gaps between them measured from the
 * transcript's own timestamps.
 *
 * Those gaps are the reason the replay feels like something happening rather
 * than a list being revealed. Most of each one is the model thinking, which is
 * the part a list cannot show.
 *
 * The plain-language narration is derived from the entries rather than written
 * beside them, so it cannot describe a run that did not happen. A tool with no
 * sentence of its own gets a generic one instead of being dropped silently.
 */

interface Act {
  readonly scenario: string
  readonly title: string
  readonly subtitle: string
  readonly role: string
}

const ACTS: readonly Act[] = [
  {
    scenario: 'out-of-role-settlement',
    title: 'The tool is never offered',
    subtitle: 'Registering a payment belongs to finance. This agent works for a salesperson.',
    role: 'sales',
  },
  {
    scenario: 'daily-closing',
    title: 'A person approves, and it happens',
    subtitle:
      'Closing the day cannot be undone, so the ERP stops and asks before anything changes.',
    role: 'finance',
  },
  {
    scenario: 'declined-approval',
    title: 'A person refuses, and nothing happens',
    subtitle: 'The same operation, the same agent, the same authority. The answer is no.',
    role: 'finance',
  },
  {
    scenario: 'invoice-without-approval',
    title: 'Nobody answers, so nothing is spent',
    subtitle:
      'An invoice burns a fiscal number that cannot be reused. With no one to approve, it is not issued.',
    role: 'finance',
  },
  {
    scenario: 'replenishment',
    title: 'Reversible work needs no permission',
    subtitle:
      'A shortfall becomes a drafted purchase order. Drafting can be undone, so nobody is interrupted.',
    role: 'stock',
  },
  {
    scenario: 'collections-review',
    title: 'A question, answered without touching anything',
    subtitle: 'Reading is not destructive. The agent reports, and the business is unchanged.',
    role: 'finance',
  },
]

/**
 * One sentence per tool, in the words a person who does not know the schema
 * would use. Reads are described as reads; the irreversible ones say so,
 * because that is the whole reason the act exists.
 */
const IN_PLAIN_ENGLISH: Readonly<Record<string, string>> = {
  get_current_context: 'Checked what day it is, and whose authority it is acting under.',
  get_cash_position: 'Read what the cash register holds today.',
  list_customers: 'Looked the customer up.',
  list_suppliers: 'Looked the suppliers up.',
  list_products: 'Read the catalogue.',
  list_sales_orders: 'Found the sales order.',
  get_sales_order: 'Opened the sales order to read its lines.',
  list_receivables: 'Read what customers owe.',
  list_payables: 'Read what the company owes.',
  report_overdue_titles: 'Read what is overdue, and by how long.',
  list_products_below_minimum: 'Found the products that have fallen below their minimum.',
  get_product: 'Read the product record.',
  get_stock_balance: 'Read how much is actually on the shelf.',
  preview_operation: 'Asked the ERP what the operation would do — without doing it.',
  create_purchase_order:
    'Drafted a purchase order. Drafting is reversible, so nobody was interrupted.',
  close_daily_cash: 'Tried to close the day. This one cannot be undone.',
  invoice_sales_order:
    'Tried to issue the invoice, which spends a fiscal number. This one cannot be undone.',
  settle_receivable: 'Tried to register the payment.',
}

/** Long enough to be evidence, short enough to stay a column. */
const INPUT_LIMIT = 150
const OUTPUT_LIMIT = 220
const THOUGHT_LIMIT = 260

function clip(value: string, limit: number): string {
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat
}

function asArguments(input: unknown): string {
  if (input === undefined || input === null) return '{}'
  try {
    return clip(JSON.stringify(input), INPUT_LIMIT)
  } catch {
    return '{}'
  }
}

function narrate(tool: string): string {
  return IN_PLAIN_ENGLISH[tool] ?? `Called ${tool}.`
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const outIndex = argv.indexOf('--out')
  const out = outIndex >= 0 ? (argv[outIndex + 1] ?? 'replay.json') : 'replay.json'
  const model = process.env['AGENT_MODEL'] ?? 'claude-sonnet-5'

  let anthropic: Anthropic
  try {
    anthropic = new Anthropic()
  } catch {
    console.error('Recording the replay runs the real agent: set ANTHROPIC_API_KEY in .env.')
    process.exit(2)
  }

  const acts = []
  for (const act of ACTS) {
    const scenario: Scenario | undefined = scenarioNamed(act.scenario)
    if (scenario === undefined) throw new Error(`No scenario named ${act.scenario}`)

    const run = await runScenario(scenario, { anthropic, model })
    const started = Date.parse(run.transcript.startedAt)

    const beats = run.transcript.entries.map((entry) => {
      const offsetMs = Math.max(0, Date.parse(entry.at) - started)
      if (entry.kind === 'called') {
        return {
          kind: 'call' as const,
          offsetMs,
          tool: entry.tool,
          arguments: asArguments(entry.input),
          result: clip(entry.output, OUTPUT_LIMIT),
          refused: entry.refused,
          plain: narrate(entry.tool),
        }
      }
      if (entry.kind === 'asked') {
        return {
          kind: 'approval' as const,
          offsetMs,
          message: entry.message,
          approved: entry.approved,
          by: entry.by,
          ...(entry.reason === undefined ? {} : { reason: entry.reason }),
          plain: entry.approved
            ? 'A person was asked, and said yes. Only then did anything change.'
            : 'A person was asked, and said no. Nothing changed.',
        }
      }
      return {
        kind: 'thought' as const,
        offsetMs,
        text: clip(entry.text, THOUGHT_LIMIT),
        plain: clip(entry.text, THOUGHT_LIMIT),
      }
    })

    acts.push({
      name: scenario.name,
      kind: scenario.kind,
      title: act.title,
      subtitle: act.subtitle,
      role: act.role,
      task: scenario.task,
      beats,
      // The proof strip. Every one of these read the database after the run.
      checks: run.checks.map((check) => ({
        passed: check.passed,
        description: check.description,
        ...(check.detail === undefined ? {} : { detail: check.detail }),
      })),
      summary: run.transcript.summary,
      outcome: run.transcript.outcome,
      passed: run.passed,
      spend: {
        toolCalls: run.spend.toolCalls,
        inputTokens: run.spend.inputTokens,
        outputTokens: run.spend.outputTokens,
        costUsd: run.spend.costUsd,
        elapsedMs: run.spend.elapsedMs,
        exchanges: run.spend.exchanges,
      },
      approvalsRequested: run.facts.approvalsRequested,
      approvalsGranted: run.facts.approvalsGranted,
    })

    process.stderr.write(
      `${scenario.name}: ${run.passed ? 'ok' : 'FAILED'} (${String(beats.length)} beats, ${String(Math.round(run.spend.elapsedMs / 1000))}s)\n`,
    )
  }

  writeFileSync(out, `${JSON.stringify({ model, acts }, null, 2)}\n`)
  process.stderr.write(`\nWrote ${out}\n`)
}

main().catch((error: unknown) => {
  console.error('[ledgerhand-replay]', error instanceof Error ? error.message : error)
  process.exit(2)
})
