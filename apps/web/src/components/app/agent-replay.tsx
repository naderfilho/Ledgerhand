'use client'

import { Brain, Check, Pause, Play, RotateCcw, ShieldAlert, Terminal, X } from 'lucide-react'
import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NeuralField } from '@/components/app/neural-field'
import type { Beat, ReplayAct } from '@/lib/agent-replay'

/**
 * Backstage on the left, what is happening on the right.
 *
 * The two columns are the argument. On the left is what the model asked for,
 * in the ERP's own vocabulary, with the arguments it sent and what came back.
 * On the right is what the system allowed, in words that need no vocabulary at
 * all. The distance between them is the product, and the moment they disagree
 * -- an approval refused, a call sent back -- is the fifteen seconds worth
 * showing anybody.
 *
 * They are not two animations. One index drives both, so a line on the left
 * and a sentence on the right are always the same event seen twice.
 *
 * The pacing is the run's own. Each gap is the real interval between two
 * entries in the transcript, capped so a long think does not read as a hang.
 */

/** A pause longer than this is thinking nobody needs to sit through. */
const LONGEST_GAP_MS = 3200
const SHORTEST_GAP_MS = 420
/** The approval is the point of the screen, so it holds regardless. */
const APPROVAL_HOLD_MS = 3400

function gapBefore(beats: readonly Beat[], index: number): number {
  const current = beats[index]
  if (current === undefined) return SHORTEST_GAP_MS
  const previous = index === 0 ? undefined : beats[index - 1]
  const raw = current.offsetMs - (previous?.offsetMs ?? 0)
  return Math.min(Math.max(raw, SHORTEST_GAP_MS), LONGEST_GAP_MS)
}

function toneFor(beat: Beat): 'refused' | 'approved' | 'plain' {
  if (beat.kind === 'approval') return beat.approved ? 'approved' : 'refused'
  if (beat.kind === 'call' && beat.refused) return 'refused'
  return 'plain'
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

function thousands(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value)
}

/**
 * The chrome arrives translated rather than translating itself: a client
 * component that imported the dictionary would ship every string in it to the
 * browser to render fourteen.
 */
export interface ReplayLabels {
  readonly guardrail: string
  readonly capability: string
  readonly actingFor: string
  readonly whoAsked: string
  readonly pause: string
  readonly play: string
  readonly replay: string
  readonly backstage: string
  readonly calls: string
  readonly exchanges: string
  readonly whatIsHappening: string
  readonly approvalGranted: string
  readonly approvalRefused: string
  readonly refusedByTheErp: string
  readonly stoppedAndAsked: string
  readonly approved: string
  readonly refused: string
  readonly checkedAfterwards: string
}

export function AgentReplay({
  acts,
  labels,
}: {
  readonly acts: readonly ReplayAct[]
  readonly labels: ReplayLabels
}): React.JSX.Element {
  const [actIndex, setActIndex] = React.useState(0)
  const [step, setStep] = React.useState(0)
  const [playing, setPlaying] = React.useState(true)

  const act = acts[actIndex]
  const total = act?.beats.length ?? 0
  const finished = step >= total

  React.useEffect(() => {
    if (!playing || act === undefined || step >= total) return undefined
    const current = act.beats[step]
    const delay = current?.kind === 'approval' ? APPROVAL_HOLD_MS : gapBefore(act.beats, step)
    const timer = setTimeout(() => {
      setStep((value) => value + 1)
    }, delay)
    return () => {
      clearTimeout(timer)
    }
  }, [playing, step, total, act])

  const choose = (index: number): void => {
    setActIndex(index)
    setStep(0)
    setPlaying(true)
  }

  const restart = (): void => {
    setStep(0)
    setPlaying(true)
  }

  if (act === undefined) return <p className="text-sm text-muted-foreground">No recording.</p>

  const pending = act.beats[step]
  // Narrowed rather than flagged: the card below needs the beat itself, and a
  // boolean would not carry the type across the JSX boundary.
  const awaiting = playing && pending?.kind === 'approval' ? pending : null

  // The story shows the beat in progress, not only the ones behind it: the
  // left line and the right sentence have to be the same event seen twice, and
  // lagging by one left this column empty for the first beat of every act.
  const shown = act.beats.slice(0, Math.min(step + 1, total))
  const elapsed = finished
    ? act.spend.elapsedMs
    : (act.beats[Math.min(step, total - 1)]?.offsetMs ?? 0)
  const callsSoFar = shown.filter((beat) => beat.kind === 'call').length
  const share = total === 0 ? 0 : Math.min(step / total, 1)

  return (
    <div className="space-y-5">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {acts.map((entry, index) => (
          <button
            key={entry.name}
            type="button"
            onClick={() => {
              choose(index)
            }}
            aria-current={index === actIndex}
            className={
              'rounded-lg border px-3 py-2.5 text-left transition ' +
              (index === actIndex
                ? 'border-primary/60 bg-primary-subtle text-foreground'
                : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground')
            }
          >
            <span className="mb-1 block text-[0.6875rem] tracking-wide uppercase opacity-70">
              {entry.kind === 'guardrail' ? labels.guardrail : labels.capability}
            </span>
            <span className="block text-sm leading-snug font-medium">{entry.title}</span>
          </button>
        ))}
      </div>

      <div className="relative overflow-hidden rounded-xl border border-border bg-surface">
        {/* Something is working behind this, and the screen should say so. */}
        <NeuralField columns={7} rows={3} intensity={finished ? 0.3 : playing ? 0.85 : 0.45} />

        <div className="relative flex flex-wrap items-start justify-between gap-4 border-b border-border p-4">
          <div className="min-w-0 space-y-1.5">
            <p className="text-sm text-muted-foreground">{act.subtitle}</p>
            <p className="text-sm">
              <span className="text-muted-foreground">{labels.actingFor} </span>
              <Badge tone="neutral">{act.role}</Badge>
              <span className="text-muted-foreground">{labels.whoAsked} </span>
              <span className="text-foreground">{act.task}</span>
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setPlaying((value) => !value)
              }}
              disabled={finished}
            >
              {playing ? <Pause /> : <Play />}
              {playing ? labels.pause : labels.play}
            </Button>
            <Button variant="secondary" onClick={restart}>
              <RotateCcw />
              {labels.replay}
            </Button>
          </div>
        </div>

        <div className="relative h-0.5 bg-muted">
          <div
            className="h-full bg-primary transition-[width] duration-500 ease-linear"
            style={{ width: `${String(Math.round(share * 100))}%` }}
          />
        </div>

        <div className="relative grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <div className="border-b border-border bg-surface-sunken/70 p-4 lg:border-r lg:border-b-0">
            <div className="mb-3 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[0.6875rem] font-medium tracking-wider text-muted-foreground uppercase">
                <Terminal className="size-3.5" />
                {labels.backstage}
              </p>
              <p className="font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
                {seconds(elapsed)} · {String(callsSoFar)} {labels.calls}
              </p>
            </div>

            <ol className="space-y-1.5 font-mono text-[0.6875rem] leading-relaxed">
              {act.beats.map((beat, index) => {
                const seen = index < step
                const now = index === step
                if (!seen && !now) return null
                const tone = toneFor(beat)
                return (
                  <li
                    key={act.name + '-' + String(index)}
                    className={
                      'rounded px-2 py-1.5 transition ' +
                      (now ? 'bg-primary-subtle' : 'bg-transparent')
                    }
                  >
                    <div className="flex items-start gap-2">
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        {seconds(beat.offsetMs)}
                      </span>
                      {beat.kind === 'approval' ? (
                        <span
                          className={
                            'flex min-w-0 flex-1 items-center gap-1.5 font-medium ' +
                            (beat.approved ? 'text-positive' : 'text-danger')
                          }
                        >
                          <ShieldAlert className="size-3.5 shrink-0" />
                          {beat.approved ? labels.approvalGranted : labels.approvalRefused}
                        </span>
                      ) : beat.kind === 'thought' ? (
                        <span className="flex min-w-0 flex-1 items-start gap-1.5 text-muted-foreground italic">
                          <Brain className="mt-0.5 size-3.5 shrink-0" />
                          <span className="min-w-0">{beat.text}</span>
                        </span>
                      ) : (
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-1.5">
                            <span aria-hidden className="text-muted-foreground">
                              &rarr;
                            </span>
                            <span
                              className={
                                'font-medium break-all ' +
                                (tone === 'refused' ? 'text-danger' : 'text-foreground')
                              }
                            >
                              {beat.tool}
                            </span>
                          </span>
                          <span className="mt-0.5 block break-all text-muted-foreground">
                            {beat.arguments}
                          </span>
                          <span
                            className={
                              'mt-0.5 block break-all ' +
                              (tone === 'refused' ? 'text-danger' : 'text-muted-foreground/70')
                            }
                          >
                            &larr; {beat.refused ? labels.refusedByTheErp + ' · ' : ''}
                            {beat.result}
                          </span>
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>

            {finished ? (
              <p className="mt-3 border-t border-border pt-3 font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
                {thousands(act.spend.inputTokens)} in · {thousands(act.spend.outputTokens)} out ·{' '}
                {act.spend.costUsd.toFixed(4)} USD · {String(act.spend.exchanges)}{' '}
                {labels.exchanges}
              </p>
            ) : null}
          </div>

          <div className="relative min-h-[22rem] p-5">
            <p className="mb-4 text-[0.6875rem] font-medium tracking-wider text-muted-foreground uppercase">
              {labels.whatIsHappening}
            </p>

            <ol className="space-y-3.5">
              {shown.map((beat, index) => (
                <li
                  key={act.name + '-plain-' + String(index)}
                  className={
                    'flex gap-3 text-sm leading-relaxed ' +
                    (index === step ? 'text-foreground' : 'text-muted-foreground')
                  }
                >
                  <span
                    className={
                      'mt-1.5 size-1.5 shrink-0 rounded-full ' +
                      (index === step && !finished ? 'animate-ping-slow ' : '') +
                      (toneFor(beat) === 'refused'
                        ? 'bg-danger'
                        : toneFor(beat) === 'approved'
                          ? 'bg-positive'
                          : 'bg-border-strong')
                    }
                  />
                  <span>{beat.plain}</span>
                </li>
              ))}
            </ol>

            {awaiting !== null ? (
              <div
                className={
                  'mt-4 rounded-xl border p-4 ' +
                  (awaiting.approved
                    ? 'border-positive/50 bg-positive-subtle'
                    : 'border-danger/50 bg-danger-subtle')
                }
              >
                <p className="flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
                  <ShieldAlert className="size-4" />
                  {labels.stoppedAndAsked}
                </p>
                <p className="mt-2 text-sm text-foreground">{awaiting.message}</p>
                <p className="mt-3 flex items-center gap-2 text-sm font-medium">
                  {awaiting.approved ? (
                    <>
                      <Check className="size-4 text-positive" />
                      {labels.approved}
                    </>
                  ) : (
                    <>
                      <X className="size-4 text-danger" />
                      {labels.refused}
                    </>
                  )}
                </p>
              </div>
            ) : null}

            {finished ? (
              <div className="mt-5 border-t border-border pt-4">
                <p className="text-[0.6875rem] font-medium tracking-wider text-muted-foreground uppercase">
                  {labels.checkedAfterwards}
                </p>
                <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {act.checks.map((check) => (
                    <li key={check.description} className="flex items-start gap-2 text-xs">
                      {check.passed ? (
                        <Check className="mt-px size-3.5 shrink-0 text-positive" />
                      ) : (
                        <X className="mt-px size-3.5 shrink-0 text-danger" />
                      )}
                      <span className="text-muted-foreground">{check.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
