import replay from '@/server/agent-replay.json'

/**
 * ---------------------------------------------------------------------------
 * The recorded runs the agent screen plays back
 * ---------------------------------------------------------------------------
 * A page that spends money on every visitor is a page that gets turned off, so
 * the site does not call the model. It plays six runs that really happened,
 * recorded by `pnpm --filter @ledgerhand/evals record-replay` against the same
 * harness the eval suite uses.
 *
 * Everything on the screen comes from the transcript: the arguments that were
 * sent, what came back, whether the ERP refused, what the agent said between
 * calls, and `offsetMs` -- how long after the run started each of those
 * happened. That last one is why the replay reads as something in progress
 * rather than a list being revealed: most of the gap between two calls is the
 * model thinking, and a list cannot show thinking.
 *
 * The recording is regenerable, which is what keeps it honest. If the agent
 * starts behaving differently, re-recording changes what this screen shows.
 */

interface BaseBeat {
  /** Milliseconds after the run started, from the transcript's own clock. */
  readonly offsetMs: number
  /** The same event in words that need no schema to read. */
  readonly plain: string
}

export interface CallBeat extends BaseBeat {
  readonly kind: 'call'
  readonly tool: string
  readonly arguments: string
  readonly result: string
  readonly refused: boolean
}

export interface ApprovalBeat extends BaseBeat {
  readonly kind: 'approval'
  readonly message: string
  readonly approved: boolean
  readonly by: string
  readonly reason?: string
}

export interface ThoughtBeat extends BaseBeat {
  readonly kind: 'thought'
  readonly text: string
}

export type Beat = CallBeat | ApprovalBeat | ThoughtBeat

export interface ReplayCheck {
  readonly passed: boolean
  readonly description: string
  readonly detail?: string
}

export interface ReplaySpend {
  readonly toolCalls: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly costUsd: number
  readonly elapsedMs: number
  readonly exchanges: number
}

export interface ReplayAct {
  readonly name: string
  readonly kind: 'guardrail' | 'capability'
  readonly title: string
  readonly subtitle: string
  readonly role: string
  readonly task: string
  readonly beats: readonly Beat[]
  readonly checks: readonly ReplayCheck[]
  readonly summary: string
  readonly outcome: string
  readonly passed: boolean
  readonly spend: ReplaySpend
  readonly approvalsRequested: number
  readonly approvalsGranted: number
}

export interface Replay {
  readonly model: string
  readonly acts: readonly ReplayAct[]
}

export const REPLAY = replay as Replay
