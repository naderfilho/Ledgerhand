import { Bot, Code2 } from 'lucide-react'
import Link from 'next/link'
import type * as React from 'react'
import { Architecture } from '@/components/site/architecture'
import { Copyable } from '@/components/site/copyable'
import { LanguageLink } from '@/components/site/language-link'
import { Inline, Paragraph, Terminal } from '@/components/site/prose'
import { ThemeToggle } from '@/components/site/theme-toggle'
import { Brandmark } from '@/components/app/brandmark'
import { Badge } from '@/components/ui/badge'
import { Wordmark } from '@/components/app/wordmark'
import { contentFor, type Block, type LandingContent } from '@/content/landing'
import { LANGUAGES, type Lang } from '@/lib/i18n'
import { DESTRUCTIVE_COUNT, OPERATION_COUNT, roleOperationsListing } from '@/lib/operations'
import { HOME_PATH, LANDING_PATHS, SIGN_IN_PATH } from '@/lib/routes'
import { staticImage } from '@/lib/static-image'
import evals from '@metrics/evals.json'
/**
 * The recording, imported rather than copied.
 *
 * `docs/demo.svg` is what the README shows, and the alternative was a second
 * copy of it under `public/` kept in step by a script. Importing the one file
 * makes the build do that job: there is nothing to fall out of date, because
 * there is nothing to keep in step.
 */
import recording from '../../../../../docs/demo.svg'

const demo = staticImage(recording, 'docs/demo.svg')

const REPOSITORY = 'https://github.com/naderfilho/Ledgerhand'
const ADRS = `${REPOSITORY}/tree/main/docs/adr`
const AGENT_SCREEN = '/agent'
const DEMO_EMAIL = 'guest@ledgerhand.cloud'
const DEMO_PASSWORD = 'ledgerhand'

/**
 * ---------------------------------------------------------------------------
 * The public page
 * ---------------------------------------------------------------------------
 * Everything a reader who has never signed in should see: the thesis, the
 * recording, the four guardrails with the messages the system really produces,
 * what the eval suite measured, what the first measurement got wrong, and what
 * deliberately does not exist.
 *
 * Two rules govern what may go in here.
 *
 * It reads nothing at request time. No database, no API, no session -- every
 * fact is a compile-time import, from the use case registry for the counts and
 * from the committed eval summary for the rates. That includes the session:
 * the page does not check whether you are signed in, because `auth()` can reach
 * for the database to refresh a stale claim, and a page whose job is to be
 * linked from elsewhere should not have a query attached to each visitor. The
 * sign-in route sends anybody who already has a session straight on.
 *
 * And the English on it is the README's English, sentence for sentence, checked
 * by `content/landing.test.ts` rather than by whoever last edited one of the
 * two.
 */

function Section({
  id,
  heading,
  children,
  className,
}: {
  readonly id: string
  readonly heading: string
  readonly children: React.ReactNode
  readonly className?: string
}): React.JSX.Element {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className={`border-t border-border/60 py-16 lg:py-20 ${className ?? ''}`}
    >
      <h2
        id={`${id}-heading`}
        className="font-display text-2xl font-semibold tracking-tight lg:text-3xl"
      >
        {heading}
      </h2>
      {children}
    </section>
  )
}

/** One section's blocks, including the ones that are counted rather than written. */
function Blocks({
  blocks,
  surface,
}: {
  readonly blocks: readonly Block[]
  /** Only the MCP section has one; the listing it renders is counted, not typed. */
  readonly surface?: LandingContent['mcp']
}): React.JSX.Element {
  return (
    <>
      {blocks.map((block, index) => {
        const key = `${block.kind}:${String(index)}`

        if (block.kind === 'role-counts') {
          return <Terminal key={key} label="tools/list" text={roleOperationsListing()} />
        }

        if (block.kind === 'mcp-surface') {
          if (surface === undefined) return null
          const rows: readonly (readonly [string, string])[] = [
            ['tools', `${String(OPERATION_COUNT)}, ${surface.toolsSuffix}`],
            ['resources', surface.resources.join('\n')],
            ['templates', surface.templates.join('\n')],
            ['prompts', surface.prompts.join('\n')],
          ]
          const width = Math.max(...rows.map(([label]) => label.length)) + 3
          const text = rows
            .map(([label, value]) =>
              value
                .split('\n')
                .map((line, line_) =>
                  line_ === 0 ? label.padEnd(width) + line : ' '.repeat(width) + line,
                )
                .join('\n'),
            )
            .join('\n')
          return <Terminal key={key} label={surface.surfaceLabel} text={text} />
        }

        if (block.kind === 'terminal') {
          return <Terminal key={key} label={block.label ?? ''} text={block.text ?? ''} />
        }

        const counts =
          block.opensWithCounts === true
            ? `${String(DESTRUCTIVE_COUNT)} of the ${String(OPERATION_COUNT)} `
            : ''
        return (
          <p key={key} className="mt-4 text-[0.9375rem] leading-relaxed text-muted-foreground">
            {counts}
            <Inline text={block.text ?? ''} />
          </p>
        )
      })}
    </>
  )
}

export function Landing({ lang }: { readonly lang: Lang }): React.JSX.Element {
  const content = contentFor(lang)
  const other: Lang = LANGUAGES.find((candidate) => candidate !== lang) ?? 'en'
  const rate = Math.round(evals.capabilityRate * 100)
  // Computed by the suite and read here, rather than computed twice.
  const oneDecimal = (value: number): string => (Math.round(value * 1000) / 10).toFixed(1)
  const interval = `${oneDecimal(evals.capabilityInterval.low)}-${oneDecimal(evals.capabilityInterval.high)}%`

  const guardrails = evals.scenarios.filter((scenario) => scenario.kind === 'guardrail')
  const capabilities = evals.scenarios.filter((scenario) => scenario.kind === 'capability')

  return (
    <div className="relative min-h-dvh overflow-x-clip bg-background">
      {/* Hoisted into <head> by React, so the recording starts downloading with
          the document instead of when the parser reaches the <img>. That head
          start is most of the LCP budget on a slow connection. */}
      <link rel="preload" as="image" href={demo.src} fetchPriority="high" />
      {/* The same atmosphere as the sign-in screen, clipped to its own box so
       * the glows cannot add scrollable nothing under the footer. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-64 -left-52 size-[40rem] rounded-full bg-primary/12 blur-[140px]" />
        <div className="absolute top-[12%] -right-48 size-[44rem] rounded-full bg-info/16 blur-[130px]" />
      </div>

      <a
        href="#hero"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:shadow-[var(--shadow-overlay)]"
      >
        {content.nav.skipToContent}
      </a>

      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-20 w-full max-w-5xl items-center gap-4 px-6">
          <Brandmark className="size-11" />
          <div className="min-w-0">
            <Wordmark size="lg" className="block" />
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{content.nav.tagline}</p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <LanguageLink
              to={other}
              href={LANDING_PATHS[other]}
              label={content.nav.otherLanguage}
            />
            <ThemeToggle toDark="Dark theme" toLight="Light theme" />
            <a
              href={REPOSITORY}
              target="_blank"
              rel="noreferrer"
              className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition hover:border-border-strong hover:text-foreground"
            >
              <Code2 className="size-4" />
              {/* Named at every width. Below sm the label is hidden, which left the
                  link with an icon and no accessible name at all. */}
              <span className="sr-only sm:hidden">{content.nav.source}</span>
              <span className="hidden sm:inline">{content.nav.source}</span>
            </a>
            <Link
              href={SIGN_IN_PATH}
              className="hidden h-9 items-center rounded-lg bg-primary px-3.5 text-xs font-medium text-primary-foreground shadow-xs transition hover:bg-primary-hover sm:flex"
            >
              {content.nav.signIn}
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-5xl px-6">
        {/* ------------------------------------------------------------ hero */}
        <section id="hero" className="pt-14 pb-16 lg:pt-20">
          <h1 className="max-w-3xl font-display text-[2.25rem] leading-[1.12] font-semibold tracking-tight text-balance lg:text-[3rem]">
            {content.hero.thesis}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            {content.hero.lede}
          </p>
          <p className="mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-muted-foreground">
            <Inline text={content.hero.claim} />
          </p>

          <figure className="mt-10">
            {/* A plain img, not next/image: the optimiser does not touch SVG,
                and this one animates, so it has to be served byte for byte. */}
            <img
              src={demo.src}
              width={demo.width}
              height={demo.height}
              fetchPriority="high"
              alt={content.hero.demoAlt}
              className="w-full rounded-xl border border-border shadow-[var(--shadow-raised)]"
            />
            <figcaption className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {content.hero.caption.join(' ')}
            </figcaption>
          </figure>
        </section>

        {/* ---------------------------------------------------------- access */}
        <Section id="access" heading={content.access.heading}>
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-10">
            <div className="space-y-2.5 rounded-xl border border-border bg-surface/70 p-5 shadow-[var(--shadow-raised)] backdrop-blur-sm">
              <Copyable
                label={content.access.emailLabel}
                value={DEMO_EMAIL}
                copyLabel={content.access.copy}
                copiedLabel={content.access.copied}
              />
              <Copyable
                label={content.access.passwordLabel}
                value={DEMO_PASSWORD}
                copyLabel={content.access.copy}
                copiedLabel={content.access.copied}
              />
              <div className="flex flex-wrap gap-2 pt-2">
                <Link
                  href={AGENT_SCREEN}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs transition hover:bg-primary-hover"
                >
                  <Bot className="size-4" />
                  {content.access.primary}
                </Link>
                <Link
                  href={HOME_PATH}
                  className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition hover:border-border-strong hover:text-foreground"
                >
                  {content.access.secondary}
                </Link>
              </div>
            </div>

            <div className="space-y-4">
              <Paragraph text={content.access.lead} />
              <p className="text-[0.9375rem] leading-relaxed font-medium text-foreground">
                {content.access.pitch}
              </p>
              {/* A list rather than a sentence: four things you will see, and
                  running them together after a full stop read as a fragment. */}
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {content.access.pitchDetail.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground"
                  >
                    <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        {/* ------------------------------------------------------ guardrails */}
        <Section id="guardrails" heading={content.guardrails.heading}>
          <div className="mt-5 max-w-3xl space-y-4">
            {content.guardrails.intro.map((text) => (
              <Paragraph key={text.slice(0, 32)} text={text} />
            ))}
          </div>

          <ol className="mt-10 space-y-12">
            {content.guardrails.items.map((item, index) => (
              <li key={item.title} className="max-w-3xl">
                <h3 className="flex items-baseline gap-3 font-display text-lg font-semibold tracking-tight">
                  <span aria-hidden className="text-sm font-mono font-normal text-muted-foreground">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  {item.title}
                </h3>
                <Blocks blocks={item.blocks} />
              </li>
            ))}
          </ol>

          <div className="mt-12 max-w-3xl rounded-xl border border-border bg-surface/60 p-5">
            <Paragraph
              text={content.guardrails.outro}
              className="text-[0.9375rem] leading-relaxed text-muted-foreground"
            />
          </div>
        </Section>

        {/* ------------------------------------------------------------- mcp */}
        <Section id="mcp" heading={content.mcp.heading}>
          <div className="mt-5 max-w-3xl">
            <Blocks blocks={content.mcp.blocks} surface={content.mcp} />
          </div>
        </Section>

        {/* ----------------------------------------------------------- agent */}
        <Section id="agent" heading={content.agent.heading}>
          <div className="mt-5 max-w-3xl">
            <Blocks blocks={content.agent.blocks.slice(0, 2)} />
          </div>

          {/* Five axes, named, each with the variable that moves it. The
              defaults live in packages/agent, which this application may not
              import, and a number copied out of it would be a number nobody
              counted. */}
          <ul className="mt-6 grid max-w-3xl gap-2 sm:grid-cols-2">
            {content.agent.limits.map((limit) => (
              <li
                key={limit.variable}
                className="flex items-baseline justify-between gap-3 rounded-lg border border-border bg-surface-sunken px-3 py-2"
              >
                <span className="text-sm font-medium text-foreground">{limit.name}</span>
                <code className="font-mono text-[0.6875rem] text-muted-foreground" translate="no">
                  {limit.variable}
                </code>
              </li>
            ))}
          </ul>

          <div className="mt-6 max-w-3xl">
            <Blocks blocks={content.agent.blocks.slice(2)} />
          </div>
        </Section>

        {/* ----------------------------------------------------------- evals */}
        <Section id="evals" heading={content.evals.heading}>
          <div className="mt-5 max-w-3xl space-y-4">
            <Paragraph text={content.evals.lead} />
          </div>

          <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-3 text-sm">
            <div>
              <dt className="text-xs tracking-wide text-muted-foreground uppercase">
                {content.evals.guardrailGroup}
              </dt>
              <dd className="font-mono text-foreground">k={evals.k.guardrail}</dd>
            </div>
            <div>
              <dt className="text-xs tracking-wide text-muted-foreground uppercase">
                {content.evals.capabilityGroup}
              </dt>
              <dd className="font-mono text-foreground">k={evals.k.capability}</dd>
            </div>
            <div>
              <dt className="text-xs tracking-wide text-muted-foreground uppercase">
                {content.evals.sampleLabel}
              </dt>
              <dd className="font-mono text-foreground">{evals.totalRuns}</dd>
            </div>
            {/* The pooled rate with its interval. Ten out of ten is a 95%
                interval of 72% to 100% however good the model is; pooling the
                capability runs is what makes the figure mean something, and
                printing a rate without an interval invites a precision nobody
                measured. */}
            <div>
              <dt className="text-xs tracking-wide text-muted-foreground uppercase">
                {content.evals.rateLabel}
              </dt>
              <dd className="font-mono text-foreground">
                {rate}%{' '}
                <span className="text-muted-foreground">
                  ({content.evals.intervalLabel} {interval})
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs tracking-wide text-muted-foreground uppercase">
                {content.evals.costLabel}
              </dt>
              <dd className="font-mono text-foreground">${evals.costUsd.toFixed(2)}</dd>
            </div>
          </dl>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="py-2.5 pr-4 font-medium text-muted-foreground">
                    {content.evals.columns.scenario}
                  </th>
                  <th scope="col" className="py-2.5 pr-4 font-medium text-muted-foreground">
                    {content.evals.columns.asks}
                  </th>
                  <th scope="col" className="py-2.5 font-medium text-muted-foreground">
                    {content.evals.columns.result}
                  </th>
                </tr>
              </thead>
              {[
                { label: content.evals.guardrailGroup, rows: guardrails },
                { label: content.evals.capabilityGroup, rows: capabilities },
              ].map((group) => (
                <tbody key={group.label}>
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={3}
                      className="pt-6 pb-1.5 text-left text-[0.6875rem] font-semibold tracking-widest text-muted-foreground uppercase"
                    >
                      {group.label}
                    </th>
                  </tr>
                  {group.rows.map((scenario) => (
                    <tr key={scenario.name} className="border-t border-border/60">
                      <th
                        scope="row"
                        className="py-2.5 pr-4 font-mono text-[0.8125rem] font-normal text-foreground"
                        translate="no"
                      >
                        {scenario.name}
                      </th>
                      <td className="py-2.5 pr-4 text-muted-foreground">{scenario.intent}</td>
                      <td className="py-2.5 text-[0.8125rem] whitespace-nowrap">
                        {scenario.kind === 'guardrail' ? (
                          // The badge's own tokens, not `text-positive`: the raw
                          // accent reaches 3.99:1 on the light ground and the
                          // pill's foreground is the one drawn to sit on it. The
                          // word carries the verdict either way, so nobody has to
                          // see the colour to read the result.
                          <Badge
                            tone={scenario.passed === scenario.attempted ? 'positive' : 'danger'}
                          >
                            {scenario.passed === scenario.attempted ? content.evals.held : '—'}
                            <span className="font-mono">
                              {scenario.passed}/{scenario.attempted}
                            </span>
                          </Badge>
                        ) : (
                          <span className="font-mono text-foreground">
                            {scenario.passed}/{scenario.attempted} (
                            {Math.round((scenario.passed / scenario.attempted) * 100)}%)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>

          <p className="mt-5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            <Inline text={content.evals.note} />
          </p>
          <p className="sr-only">
            {content.evals.capabilityGroup}: {rate}% over k={evals.k.capability}.
          </p>
        </Section>

        {/* -------------------------------------------------------- firstRun */}
        <Section id="first-run" heading={content.firstRun.heading}>
          <div className="mt-5 max-w-3xl">
            <Paragraph text={content.firstRun.intro} />
          </div>

          <div className="mt-10 max-w-3xl space-y-10">
            {content.firstRun.findings.map((finding) => (
              <div key={finding.lead} className="border-l-2 border-border pl-5">
                <h3 className="font-display text-base font-semibold tracking-tight text-foreground">
                  {finding.lead}
                </h3>
                {finding.body.map((text) => (
                  <Paragraph
                    key={text.slice(0, 32)}
                    text={text}
                    className="mt-3 text-[0.9375rem] leading-relaxed text-muted-foreground"
                  />
                ))}
              </div>
            ))}
          </div>

          <div className="mt-10 max-w-3xl">
            <Paragraph text={content.firstRun.outro} />
          </div>
        </Section>

        {/* ---------------------------------------------------------- absent */}
        <Section id="absent" heading={content.absent.heading}>
          <div className="mt-5 max-w-3xl">
            <Paragraph text={content.absent.intro} />
          </div>

          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="py-2.5 pr-6 font-medium text-muted-foreground">
                    {content.absent.columns.feature}
                  </th>
                  <th scope="col" className="py-2.5 font-medium text-muted-foreground">
                    {content.absent.columns.why}
                  </th>
                </tr>
              </thead>
              <tbody>
                {content.absent.rows.map((row) => (
                  <tr key={row.feature} className="border-t border-border/60">
                    <th
                      scope="row"
                      className="py-3 pr-6 font-medium whitespace-nowrap text-foreground"
                    >
                      {row.feature}
                    </th>
                    <td className="py-3 text-muted-foreground">
                      <Inline text={row.why} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8 max-w-3xl">
            <Paragraph text={content.absent.outro} />
          </div>
        </Section>

        {/* ---------------------------------------------------- architecture */}
        <Section id="architecture" heading={content.architecture.heading}>
          <div className="mt-8 grid items-center gap-10 lg:grid-cols-[minmax(0,26rem)_1fr]">
            <Architecture className="w-full" />
            <Paragraph
              text={content.architecture.note}
              className="text-[0.9375rem] leading-relaxed text-muted-foreground"
            />
          </div>
        </Section>
      </main>

      <footer className="relative z-10 border-t border-border/60">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-xs text-muted-foreground">
          <p>
            {content.footer.builtBy}{' '}
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
          <p className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <a href={REPOSITORY} target="_blank" rel="noreferrer" className="hover:text-foreground">
              {content.footer.repository}
            </a>
            <a href={ADRS} target="_blank" rel="noreferrer" className="hover:text-foreground">
              {content.footer.decisions}
            </a>
            <a
              href={`${REPOSITORY}/blob/main/LICENSE.md`}
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground"
            >
              {content.footer.licence}
            </a>
            <span>
              {content.footer.measured} <time dateTime={evals.measuredOn}>{evals.measuredOn}</time>
            </span>
          </p>
        </div>
      </footer>
    </div>
  )
}
