import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import LandingPageEnglish from '@/app/(site)/page'
import LandingPagePortuguese from '@/app/(site)/pt/page'
import { EN } from '@/content/landing.en'
import { PT } from '@/content/landing.pt'
import { DESTRUCTIVE_COUNT, OPERATION_COUNT } from '@/lib/operations'
import { HOME_PATH, LANDING_PATHS, SIGN_IN_PATH } from '@/lib/routes'
import evals from '@metrics/evals.json'

/**
 * The public page renders, and renders with nothing behind it.
 *
 * This is the strongest form the claim can take. There is no session in this
 * process, no database, no `ANTHROPIC_API_KEY`, no request -- and the route
 * components still produce their markup. A page that reached for any of those
 * would throw here rather than in front of somebody arriving from a link.
 */

const english = (): string => renderToStaticMarkup(<LandingPageEnglish />)
const portuguese = (): string => renderToStaticMarkup(<LandingPagePortuguese />)

describe('the landing page', () => {
  it('renders with no session and no database', () => {
    expect(english()).toContain(EN.hero.thesis)
  })

  it('renders in Portuguese at its own URL, and links to the other language', () => {
    const html = portuguese()
    expect(html).toContain(PT.hero.thesis)
    expect(html).not.toContain(EN.hero.thesis)
    expect(html).toContain(`href="${LANDING_PATHS.en}"`)
    expect(html).toContain('hrefLang="en"')
  })

  it('points its main button at the agent screen, not the dashboard', () => {
    // The dashboard is a competent ERP home. The agent screen is the reason
    // the repository exists, so it is what the button offers first.
    const html = english()
    const agent = html.indexOf('href="/agent"')
    const dashboard = html.indexOf(`href="${HOME_PATH}"`)
    expect(agent).toBeGreaterThan(-1)
    expect(dashboard).toBeGreaterThan(agent)
  })

  it('offers the credentials and the way in', () => {
    const html = english()
    expect(html).toContain('guest@ledgerhand.cloud')
    expect(html).toContain(`href="${SIGN_IN_PATH}"`)
  })

  it('sizes the recording, so the page does not jump while it loads', () => {
    // The dimensions come from docs/demo.svg itself, through the build. An
    // image this size arriving without them reflows everything under it, which
    // on this page is the entire argument.
    const html = english()
    expect(html).toMatch(/<img[^>]+width="1280"[^>]+height="928"/)
    expect(html).toMatch(/<img[^>]+fetchPriority="high"/)
  })

  it('preloads the recording, which is the largest thing on the page', () => {
    // The link is rendered rather than asked for, and the difference cost a
    // deployment to learn. This test first looked for a preload that
    // `renderToStaticMarkup` hoists out of an `<img fetchPriority="high">` on
    // its own -- so it stayed green while the App Router, which is the renderer
    // that actually ships, emitted none and production had no image preload at
    // all. `preload()` from react-dom did not reach the head either. A rendered
    // `<link>` does, verified against the HTML a real `next start` serves.
    expect(english()).toMatch(/<link rel="preload" as="image"[^>]+fetchPriority="high"/)
  })

  it('describes the recording to somebody who cannot see it', () => {
    const alt = /<img[^>]+alt="([^"]*)"/.exec(english())?.[1] ?? ''
    // Not "demo", not "screenshot": which three scenarios, and how they end.
    expect(alt).toBe(EN.hero.demoAlt)
    expect(alt).toContain('never offered')
    expect(alt).toContain('refused')
  })

  it('counts the operations rather than stating them', () => {
    const html = english()
    expect(html).toContain(`${String(DESTRUCTIVE_COUNT)} of the ${String(OPERATION_COUNT)}`)
    expect(html).toMatch(new RegExp(`admin\\s+${String(OPERATION_COUNT)} operations`))
  })

  it('shows the rates the suite measured, with the sample size beside them', () => {
    const html = english()
    expect(html).toContain(`k=${String(evals.k.capability)}`)
    expect(html).toContain(`k=${String(evals.k.guardrail)}`)
    for (const scenario of evals.scenarios) {
      expect(html).toContain(scenario.name)
      expect(html).toContain(`${String(scenario.passed)}/${String(scenario.attempted)}`)
    }
  })

  it('keeps every heading in order, so the page can be navigated by structure', () => {
    // One h1, and no level skipped after it. A screen reader user moving by
    // heading is the reason the sections are h2 and the findings are h3.
    const levels = [...english().matchAll(/<h([1-6])[\s>]/g)].map((match) =>
      Number(match[1] ?? '0'),
    )
    expect(levels.filter((level) => level === 1)).toHaveLength(1)
    expect(levels[0]).toBe(1)
    for (const [index, level] of levels.entries()) {
      if (index === 0) continue
      expect(level - (levels[index - 1] ?? 0)).toBeLessThanOrEqual(1)
    }
  })
})
