import type { BudgetSpend } from './budget.js'

/**
 * ---------------------------------------------------------------------------
 * The transcript
 * ---------------------------------------------------------------------------
 * What the agent did, in order, with what it was told in return. Two readers
 * are served by it: a person deciding whether to trust the run, and the eval
 * suite in phase 5, which scores runs and needs them comparable.
 *
 * It records requests, not effects. What actually changed in the business is
 * in the ERP's own event log, joined to this run by its id -- and that is the
 * right split, because a transcript is written by the party whose account of
 * itself cannot be the last word.
 */

export type TranscriptEntry =
  | { readonly kind: 'said'; readonly at: string; readonly text: string }
  | {
      readonly kind: 'called'
      readonly at: string
      readonly tool: string
      readonly input: unknown
      readonly output: string
      readonly refused: boolean
    }
  | {
      readonly kind: 'asked'
      readonly at: string
      readonly message: string
      readonly approved: boolean
      readonly by: string
      readonly reason?: string
    }

export type RunOutcome =
  'completed' | 'budget-exhausted' | 'refused-by-model' | 'output-truncated' | 'failed'

export interface RunTranscript {
  readonly runId: string
  readonly task: string
  readonly model: string
  readonly startedAt: string
  readonly finishedAt: string
  readonly outcome: RunOutcome
  /** The agent's final answer, or the reason there is not one. */
  readonly summary: string
  readonly entries: readonly TranscriptEntry[]
  readonly spend: BudgetSpend
  /** How many tool calls the ERP refused. A high number is a finding. */
  readonly refusals: number
  readonly approvalsRequested: number
  readonly approvalsGranted: number
}

export class Transcript {
  private readonly entries: TranscriptEntry[] = []

  constructor(
    readonly runId: string,
    readonly task: string,
    readonly model: string,
    private readonly now: () => number,
  ) {
    this.startedAt = this.timestamp()
  }

  private readonly startedAt: string

  private timestamp(): string {
    return new Date(this.now()).toISOString()
  }

  said(text: string): void {
    if (text.trim() === '') return
    this.entries.push({ kind: 'said', at: this.timestamp(), text })
  }

  called(tool: string, input: unknown, output: string, refused: boolean): void {
    this.entries.push({ kind: 'called', at: this.timestamp(), tool, input, output, refused })
  }

  asked(message: string, approved: boolean, by: string, reason?: string): void {
    this.entries.push({
      kind: 'asked',
      at: this.timestamp(),
      message,
      approved,
      by,
      ...(reason === undefined ? {} : { reason }),
    })
  }

  finish(outcome: RunOutcome, summary: string, spend: BudgetSpend): RunTranscript {
    const asked = this.entries.filter((entry) => entry.kind === 'asked')
    return {
      runId: this.runId,
      task: this.task,
      model: this.model,
      startedAt: this.startedAt,
      finishedAt: this.timestamp(),
      outcome,
      summary,
      entries: [...this.entries],
      spend,
      refusals: this.entries.filter((entry) => entry.kind === 'called' && entry.refused).length,
      approvalsRequested: asked.length,
      approvalsGranted: asked.filter((entry) => entry.approved).length,
    }
  }
}

/** A short, readable account of a run, for a terminal or a pull request. */
export function summarise(transcript: RunTranscript): string {
  const spend = transcript.spend
  const lines = [
    `run ${transcript.runId} -- ${transcript.outcome}`,
    `task: ${transcript.task}`,
    `${String(spend.exchanges)} exchanges, ${String(spend.toolCalls)} tool calls, ${String(transcript.refusals)} refused`,
    `approvals: ${String(transcript.approvalsGranted)} of ${String(transcript.approvalsRequested)} granted`,
    `spend: $${spend.costUsd.toFixed(4)}, ${String(spend.inputTokens)} in / ${String(spend.outputTokens)} out, ${String(Math.round(spend.elapsedMs / 1000))}s`,
    '',
    transcript.summary,
  ]
  return lines.join('\n')
}
