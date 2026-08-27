import { USE_CASES } from '@ledgerhand/domain'
import { Code2 } from 'lucide-react'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import type * as React from 'react'
import { AgentGlimpse } from '@/components/app/agent-glimpse'
import { LanguageToggle } from '@/components/app/language-toggle'
import { Logo } from '@/components/app/logo'
import { SignInForm } from '@/components/app/sign-in-form'
import { Wordmark } from '@/components/app/wordmark'
import { replayFor } from '@/lib/agent-replay'
import { currentSession } from '@/server/context'
import { currentTranslator } from '@/server/locale'

export const metadata: Metadata = { title: 'Sign in' }

const REPOSITORY = 'https://github.com/naderfilho/Ledgerhand'

/**
 * Counted from the use cases themselves. The previous copy said "ten of the
 * forty-one", which was right when it was written and wrong two use cases
 * later. A claim about how many operations need a human is exactly the kind of
 * number this repository argues should never be typed by hand.
 */
const OPERATIONS = Object.values(USE_CASES)
const IRREVERSIBLE = OPERATIONS.filter((useCase) => useCase.risk === 'destructive').length

const PILLARS = [
  {
    title: 'Permissions per tool',
    body: 'A role that cannot settle a receivable is never shown the tool, in the UI or over MCP.',
  },
  {
    title: 'A human approves what cannot be undone',
    body: `${String(IRREVERSIBLE)} of the ${String(OPERATIONS.length)} operations are irreversible. Each one pauses for a person and shows exactly what it would do.`,
  },
  {
    title: 'Everything is on the record',
    body: 'Every change writes a domain event in the same transaction, naming the user or the agent run behind it.',
  },
] as const

export default async function SignInPage(): Promise<React.JSX.Element> {
  if ((await currentSession()) !== null) redirect('/')

  const { t, lang } = await currentTranslator()

  // The one act worth showing before anybody has signed in: an agent that
  // reached for something irreversible, stopped, and was allowed. Taken from
  // the recording, so the page cannot promise behaviour the agent lacks.
  const act = replayFor(lang).acts.find((entry) => entry.name === 'daily-closing')
  const approval = act?.beats.find((beat) => beat.kind === 'approval')
  const glimpse =
    act === undefined || approval?.kind !== 'approval'
      ? null
      : {
          question: act.task,
          // The first sentence of what the ERP asked. The whole message is a
          // paragraph, and this card is a few lines tall.
          decision: `${approval.message.split('.')[0] ?? approval.message}?`,
          approved: approval.approved,
          steps: act.beats
            .filter((beat) => beat.kind === 'call')
            .slice(0, 3)
            .map((beat) => ({ tool: beat.tool, plain: beat.plain })),
        }

  return (
    // One atmosphere rather than two screens: the glows belong to the page, so
    // the light crosses the middle instead of stopping at the column boundary.
    // A header and a footer hold the two halves together -- without them the
    // page was two blocks floating in the dark, and the brand was a footnote.
    <div className="relative flex min-h-dvh flex-col overflow-x-clip bg-background">
      {/* The glows live in their own clipped box. Loose in the root they
       * reached past the footer and added two hundred pixels of scrollable
       * nothing under it -- and clipping the root itself would have broken
       * the sticky header and footer, which need a scrolling ancestor. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-64 -left-52 size-[40rem] rounded-full bg-primary/12 blur-[140px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/4 -right-48 size-[44rem] rounded-full bg-info/16 blur-[130px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-56 left-[38%] size-[40rem] rounded-full bg-primary/16 blur-[130px]"
        />
      </div>

      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-20 w-full max-w-[92rem] items-center gap-4 px-6 lg:px-10">
          <Logo className="size-11 shrink-0" title="LedgerHand" />
          <div className="min-w-0">
            <Wordmark size="lg" className="block" />
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {t(
                'An open-source ERP, an MCP server and an agent that operates it under guardrails',
              )}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <a
              href={`${REPOSITORY}#the-part-that-is-not-an-erp`}
              target="_blank"
              rel="noreferrer"
              className="hidden h-9 items-center rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition hover:text-foreground sm:flex"
            >
              {t('How it works')}
            </a>
            <LanguageToggle lang={lang} />
            <a
              href={REPOSITORY}
              target="_blank"
              rel="noreferrer"
              className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition hover:border-border-strong hover:text-foreground"
            >
              <Code2 className="size-4" />
              <span className="hidden sm:inline">{t('Source')}</span>
            </a>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-[92rem] flex-1 items-center gap-12 px-6 py-12 lg:grid-cols-[1.05fr_minmax(0,26rem)] lg:gap-16 lg:px-10">
        <section className="hidden max-w-2xl space-y-7 lg:block">
          <div className="space-y-4">
            <h1 className="font-display text-[2.6rem] leading-[1.1] font-semibold tracking-tight text-balance">
              {t(
                'An ERP is the hard part. Letting an AI agent run it safely is the interesting part.',
              )}
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
              {t(
                'A working system for a trading company, built so that an agent can operate it without anybody having to trust the agent.',
              )}
            </p>
          </div>

          <ul className="space-y-4">
            {PILLARS.map((pillar, index) => (
              <li key={pillar.title} className="flex gap-3.5">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-[0.6875rem] font-semibold text-muted-foreground">
                  {index + 1}
                </span>
                <div className="space-y-1">
                  <p className="text-[0.9375rem] font-medium">{t(pillar.title)}</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">{t(pillar.body)}</p>
                </div>
              </li>
            ))}
          </ul>

          {glimpse === null ? null : (
            <AgentGlimpse
              label={t('A recorded run')}
              steps={glimpse.steps}
              question={glimpse.question}
              backstageLabel={t('Backstage')}
              meaningLabel={t('What is happening')}
              decision={glimpse.decision}
              approved={glimpse.approved}
              answerLabel={glimpse.approved ? t('Approved') : t('Refused')}
            />
          )}
        </section>

        <section className="mx-auto w-full max-w-md rounded-2xl border border-border bg-surface/70 p-7 shadow-[var(--shadow-raised)] backdrop-blur-sm lg:p-8">
          <div className="mb-6 space-y-1.5">
            <h2 className="font-display text-2xl font-semibold tracking-tight">{t('Sign in')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('Use one of the demo accounts below to see how the role changes the application.')}
            </p>
          </div>
          <SignInForm />
        </section>
      </main>

      <footer className="sticky bottom-0 z-30 mt-auto border-t border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[92rem] flex-wrap items-center justify-between gap-3 px-6 py-5 text-xs text-muted-foreground lg:px-10">
          <p>
            {t('Designed and built by')}{' '}
            <a
              href="https://github.com/naderfilho"
              target="_blank"
              rel="noreferrer"
              className="text-foreground transition hover:text-primary"
            >
              Nader Filho
            </a>
            <span> &amp; </span>
            <a
              href="https://github.com/naderfilho"
              target="_blank"
              rel="noreferrer"
              className="text-foreground transition hover:text-primary"
            >
              NDR Private Agency
            </a>
          </p>
          <p className="flex items-center gap-4">
            <span>PolyForm Noncommercial</span>
            <a
              href={REPOSITORY}
              target="_blank"
              rel="noreferrer"
              className="transition hover:text-foreground"
            >
              github.com/naderfilho/Ledgerhand
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}
