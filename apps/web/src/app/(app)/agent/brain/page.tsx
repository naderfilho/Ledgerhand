'use client'

import * as React from 'react'
import { NeuralBrain, type NeuralBrainState } from '@/components/app/neural-brain'

/**
 * Every state of the brain, on one screen, with a button for each.
 *
 * It exists to be looked at: the transitions are the whole reason the
 * component has states at all, and the only way to know whether one reads as
 * different from another is to switch between them and see. Not in the
 * navigation -- this is a workbench, not a screen the business needs.
 */

const STATES: readonly { readonly state: NeuralBrainState; readonly note: string }[] = [
  { state: 'idle', note: 'Resting. Slow turn, a pulse now and then.' },
  { state: 'thinking', note: 'Faster, pulses frequent, chaining hard.' },
  { state: 'calling-tool', note: 'A wavefront leaves the centre and crosses the mesh.' },
  {
    state: 'awaiting-approval',
    note: 'Stopped. Pulses frozen mid-edge, amber, waiting for a person.',
  },
  { state: 'denied', note: 'Red across the mesh; pulses retract to where they started.' },
  { state: 'exhausted', note: 'Turning stops, pulses die out, the mesh fades.' },
]

export default function BrainWorkbenchPage(): React.JSX.Element {
  const [state, setState] = React.useState<NeuralBrainState>('thinking')
  const current = STATES.find((entry) => entry.state === state)

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">The brain, in every state</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          A workbench for the agent indicator. Switch between states and watch the transition --
          each one crosses over about four hundred milliseconds, so nothing snaps.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {STATES.map((entry) => (
          <button
            key={entry.state}
            type="button"
            onClick={() => {
              setState(entry.state)
            }}
            aria-pressed={entry.state === state}
            className={
              'rounded-lg border px-3 py-2 font-mono text-xs transition ' +
              (entry.state === state
                ? 'border-primary/60 bg-primary-subtle text-foreground'
                : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground')
            }
          >
            {entry.state}
          </button>
        ))}
      </div>

      <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-[#060a1a] p-8">
        <NeuralBrain state={state} size={480} />
        <p className="text-center text-sm text-muted-foreground">{current?.note}</p>
      </div>
    </div>
  )
}
