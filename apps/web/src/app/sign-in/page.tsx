import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import type * as React from 'react'
import { SignInForm } from '@/components/app/sign-in-form'
import { currentSession } from '@/server/context'

export const metadata: Metadata = { title: 'Sign in' }

const PILLARS = [
  {
    title: 'Permissions per tool',
    body: 'A role that cannot settle a receivable is never shown the tool, in the UI or over MCP.',
  },
  {
    title: 'A human approves what cannot be undone',
    body: 'Ten of the forty-one operations are irreversible. Each one pauses for a person and shows exactly what it would do.',
  },
  {
    title: 'Everything is on the record',
    body: 'Every change writes a domain event in the same transaction, naming the user or the agent run behind it.',
  },
] as const

export default async function SignInPage(): Promise<React.JSX.Element> {
  if ((await currentSession()) !== null) redirect('/')

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-surface-sunken p-10 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -left-24 size-96 rounded-full bg-primary/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -bottom-32 size-96 rounded-full bg-info/10 blur-3xl"
        />

        <div className="relative flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <svg viewBox="0 0 24 24" fill="none" className="size-4.5">
              <path
                d="M5 4v13.5A2.5 2.5 0 0 0 7.5 20H19"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
              <path
                d="M9 15.5 12.5 12l3 3L20 9.5"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="text-sm font-semibold tracking-tight">Ledgerhand</span>
        </div>

        <div className="relative max-w-md space-y-8">
          <div className="space-y-3">
            <h1 className="text-2xl leading-tight font-semibold tracking-tight text-balance">
              An ERP is the hard part. Letting an AI agent run it safely is the interesting part.
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              A working system for a small trading company, built so that an agent can operate it
              without anybody having to trust the agent.
            </p>
          </div>

          <ul className="space-y-4">
            {PILLARS.map((pillar, index) => (
              <li key={pillar.title} className="flex gap-3">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-[0.625rem] font-semibold text-muted-foreground">
                  {index + 1}
                </span>
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{pillar.title}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{pillar.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-muted-foreground">
          Open source under MIT &middot; github.com/naderfilho/Ledgerhand
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm space-y-7">
          <div className="space-y-1.5">
            <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
            <p className="text-sm text-muted-foreground">
              Use one of the demo accounts below to see how the role changes the application.
            </p>
          </div>
          <SignInForm />
        </div>
      </section>
    </div>
  )
}
