import { Code2 } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type * as React from 'react'
import { LanguageToggle } from '@/components/app/language-toggle'
import { Brandmark } from '@/components/app/brandmark'
import { SignInForm } from '@/components/app/sign-in-form'
import { Wordmark } from '@/components/app/wordmark'
import { CALLBACK_PARAM, LANDING_PATHS, safeCallbackUrl } from '@/lib/routes'
import { currentSession } from '@/server/context'
import { currentTranslator } from '@/server/locale'

export const metadata: Metadata = { title: 'Sign in' }

const REPOSITORY = 'https://github.com/naderfilho/Ledgerhand'

export default async function SignInPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<React.JSX.Element> {
  const raw = (await searchParams)[CALLBACK_PARAM]
  const callbackUrl = safeCallbackUrl(Array.isArray(raw) ? raw[0] : raw)

  // Already signed in: honour the destination rather than dropping somebody
  // who followed a link to a deep page onto the home screen instead.
  if ((await currentSession()) !== null) redirect(callbackUrl)

  const { t, lang } = await currentTranslator()

  return (
    // The header and footer stay: a form floating alone on a dark ground has
    // no brand on it and nowhere to go back to. The glows stay for the same
    // reason they are on the landing page -- this is the same site, and a door
    // that looks like a different building is a door people do not walk through.
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
          <Brandmark className="size-11" />
          <div className="min-w-0">
            <Wordmark size="lg" className="block" />
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {t(
                'An open-source ERP, an MCP server and an agent that operates it under guardrails',
              )}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* The public page, not the README on GitHub. It carries the same
                argument and is one navigation away rather than a tab away. */}
            <Link
              href={LANDING_PATHS[lang]}
              className="hidden h-9 items-center rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition hover:text-foreground sm:flex"
            >
              {t('How it works')}
            </Link>
            <LanguageToggle lang={lang} />
            <a
              href={REPOSITORY}
              target="_blank"
              rel="noreferrer"
              className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition hover:border-border-strong hover:text-foreground"
            >
              <Code2 className="size-4" />
              {/* Named at every width: below sm the visible label is hidden. */}
              <span className="sr-only sm:hidden">{t('Source')}</span>
              <span className="hidden sm:inline">{t('Source')}</span>
            </a>
          </div>
        </div>
      </header>

      {/* One column, and the form is the only thing in it.
       * It carried the thesis, three pillars and a recorded run for as long as
       * it was the only public page. It is not any more: everything that was
       * here is on the landing page, in more room and in two languages, and a
       * second copy of an argument is the drift this repository argues against.
       * What is left is the thing somebody came here to do. */}
      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 items-center px-6 py-12">
        <section className="w-full rounded-2xl border border-border bg-surface/70 p-7 shadow-[var(--shadow-raised)] backdrop-blur-sm">
          <div className="mb-6 space-y-1.5">
            <h1 className="font-display text-2xl font-semibold tracking-tight">{t('Sign in')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('Use one of the demo accounts below to see how the role changes the application.')}
            </p>
          </div>
          <SignInForm callbackUrl={callbackUrl} />
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
            <span> · </span>
            <a
              href="mailto:ndr.dev@outlook.com"
              className="text-foreground transition hover:text-primary"
            >
              ndr.dev@outlook.com
            </a>
          </p>
          <p className="flex items-center gap-4">
            <a
              href={`${REPOSITORY}/blob/main/LICENSE.md`}
              target="_blank"
              rel="noreferrer"
              className="transition hover:text-foreground"
            >
              Apache 2.0
            </a>
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
