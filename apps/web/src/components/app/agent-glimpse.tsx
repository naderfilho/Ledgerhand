'use client'

import { Check, ShieldAlert, X } from 'lucide-react'
import * as React from 'react'

/**
 * Fifteen seconds of the argument, before anybody has signed in.
 *
 * The same two columns as the agent screen, at a sixth of the size: what the
 * model asked for on the left, what it means on the right, and the moment the
 * ERP stops to ask spanning both. Small enough to sit beside a sign-in form,
 * and enough to say what the application is before the form is filled in.
 *
 * It loops, because somebody reading the panel beside it should be able to
 * catch it from any point. The lines come from the recording rather than from
 * a designer's imagination, so the page cannot promise a behaviour the agent
 * does not have.
 */

export interface GlimpseStep {
  readonly tool: string
  readonly plain: string
}

const HOLD_MS = 1700
const APPROVAL_MS = 3400
const RESET_MS = 2400

export function AgentGlimpse({
  steps,
  label,
  question,
  backstageLabel,
  meaningLabel,
  decision,
  approved,
  answerLabel,
}: {
  readonly steps: readonly GlimpseStep[]
  readonly label: string
  readonly question: string
  readonly backstageLabel: string
  readonly meaningLabel: string
  readonly decision: string
  readonly approved: boolean
  readonly answerLabel: string
}): React.JSX.Element {
  // One past the last step is the approval; one past that is the pause before
  // it starts over.
  const total = steps.length + 2
  const [at, setAt] = React.useState(0)

  React.useEffect(() => {
    const isApproval = at === steps.length
    const isRest = at === steps.length + 1
    const delay = isApproval ? APPROVAL_MS : isRest ? RESET_MS : HOLD_MS
    const timer = setTimeout(() => {
      setAt((value) => (value + 1) % total)
    }, delay)
    return () => {
      clearTimeout(timer)
    }
  }, [at, steps.length, total])

  const showing = Math.min(at, steps.length)
  const asking = at >= steps.length

  return (
    // A fixed height, because a card that grows as the loop fills would push
    // the page around every eight seconds.
    <div className="min-h-[13rem] rounded-xl border border-border/70 bg-surface/60 p-4 backdrop-blur-sm">
      <p className="text-[0.6875rem] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 line-clamp-1 text-xs text-foreground/80">&ldquo;{question}&rdquo;</p>

      <div className="mt-3 grid gap-x-4 gap-y-1.5 border-t border-border/60 pt-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
        <p className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
          {backstageLabel}
        </p>
        <p className="hidden text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase sm:block">
          {meaningLabel}
        </p>

        {steps.map((step, index) => {
          const seen = index < showing
          return (
            <React.Fragment key={step.tool + String(index)}>
              <span
                className={
                  'flex items-start gap-1.5 font-mono text-[0.6875rem] transition-opacity duration-300 ' +
                  (seen ? 'opacity-100' : 'opacity-0')
                }
              >
                <span aria-hidden className="text-muted-foreground">
                  &rarr;
                </span>
                <span className="min-w-0 break-all text-foreground">{step.tool}</span>
              </span>
              <span
                className={
                  'text-xs leading-snug text-muted-foreground transition-opacity duration-300 ' +
                  (seen ? 'opacity-100' : 'opacity-0')
                }
              >
                {step.plain}
              </span>
            </React.Fragment>
          )
        })}
      </div>

      <div
        className={
          'mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-opacity duration-500 ' +
          (asking
            ? approved
              ? 'border-positive/50 bg-positive-subtle opacity-100'
              : 'border-danger/50 bg-danger-subtle opacity-100'
            : 'border-transparent bg-transparent opacity-0')
        }
        aria-hidden={!asking}
      >
        <ShieldAlert
          className={'size-3.5 shrink-0 ' + (approved ? 'text-positive' : 'text-danger')}
        />
        <span className="min-w-0 truncate text-foreground">{decision}</span>
        {approved ? (
          <Check className="ml-auto size-3.5 shrink-0 text-positive" />
        ) : (
          <X className="ml-auto size-3.5 shrink-0 text-danger" />
        )}
        <span className={'shrink-0 font-medium ' + (approved ? 'text-positive' : 'text-danger')}>
          {answerLabel}
        </span>
      </div>
    </div>
  )
}
