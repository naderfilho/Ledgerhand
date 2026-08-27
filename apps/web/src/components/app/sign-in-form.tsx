'use client'

import { AlertCircle, ArrowRight } from 'lucide-react'
import * as React from 'react'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { CALLBACK_PARAM } from '@/lib/routes'
import { signInAction, type SignInState } from '@/server/actions/session'

// The notes are the capability table in shorthand, not a vibe. Each one names
// the thing the role is refused, because that is the part worth reading.
const DEMO_ACCOUNTS = [
  { role: 'admin', email: 'guest@ledgerhand.cloud', note: 'everything, audit log included' },
  { role: 'sales', email: 'sales@ledgerhand.cloud', note: 'sells and cancels, cannot invoice' },
  { role: 'finance', email: 'finance@ledgerhand.cloud', note: 'invoices, settles, closes the day' },
  { role: 'stock', email: 'stock@ledgerhand.cloud', note: 'warehouse, purchasing, catalogue' },
  {
    role: 'readonly',
    email: 'readonly@ledgerhand.cloud',
    note: 'reads everything, writes nothing',
  },
] as const

export function SignInForm({
  callbackUrl,
}: {
  /** Where the visitor was headed when they were asked to sign in. */
  readonly callbackUrl?: string
}): React.JSX.Element {
  const [state, formAction, pending] = useActionState<SignInState, FormData>(signInAction, {})
  const [email, setEmail] = React.useState('guest@ledgerhand.cloud')

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        {callbackUrl === undefined ? null : (
          <input type="hidden" name={CALLBACK_PARAM} value={callbackUrl} />
        )}
        <Field label="E-mail" htmlFor="email" required>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
            }}
            aria-invalid={state.error !== undefined}
          />
        </Field>

        <Field label="Password" htmlFor="password" required>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            defaultValue="ledgerhand"
            aria-invalid={state.error !== undefined}
          />
        </Field>

        {state.error !== undefined ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-xs text-danger-foreground"
          >
            <AlertCircle className="mt-px size-3.5 shrink-0" />
            {state.error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending}>
          Sign in
          {pending ? null : <ArrowRight className="size-4" />}
        </Button>
      </form>

      <div className="space-y-2 rounded-lg border border-border bg-surface-sunken p-3">
        <p className="text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase">
          Demo accounts &middot; password <span className="font-mono">ledgerhand</span>
        </p>
        <ul className="grid gap-1">
          {DEMO_ACCOUNTS.map((account) => (
            <li key={account.email}>
              <button
                type="button"
                onClick={() => {
                  setEmail(account.email)
                }}
                className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
              >
                <span className="font-medium capitalize">{account.role}</span>
                <span className="truncate text-muted-foreground">{account.note}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="px-2 text-[0.6875rem] text-muted-foreground">
          The agent signs in as whichever account you pick and gets exactly its permissions. Ask the
          sales agent to invoice an order and it cannot: the tool was never offered to it. The
          system refuses, not the prompt.
        </p>
      </div>
    </div>
  )
}
