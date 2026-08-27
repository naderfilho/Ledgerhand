import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import LandingPageEnglish from '@/app/(site)/page'
import LandingPagePortuguese from '@/app/(site)/pt/page'
import { SIGN_IN_PATH } from '@/lib/routes'

/**
 * The public page renders, and renders with nothing behind it.
 *
 * This is the strongest form the claim can take. There is no session in this
 * process, no database, no `ANTHROPIC_API_KEY`, no request -- and the route
 * components still produce their markup. A page that reached for any of those
 * would throw here rather than in front of somebody arriving from a link.
 */

const THESIS = 'An ERP is the hard part'

describe('the landing page', () => {
  it('renders with no session and no database', () => {
    const html = renderToStaticMarkup(<LandingPageEnglish />)
    expect(html).toContain(THESIS)
  })

  it('offers the way in', () => {
    expect(renderToStaticMarkup(<LandingPageEnglish />)).toContain(`href="${SIGN_IN_PATH}"`)
  })

  it('sizes the recording, so the page does not jump while it loads', () => {
    // The dimensions come from docs/demo.svg itself, through the build. An
    // image this size arriving without them reflows everything under it, which
    // on this page is the entire argument.
    const html = renderToStaticMarkup(<LandingPageEnglish />)
    expect(html).toMatch(/<img[^>]+width="1280"[^>]+height="928"/)
    expect(html).toMatch(/<img[^>]+fetchPriority="high"/)
  })

  it('preloads the recording, which is the largest thing on the page', () => {
    // React hoists a `<link rel="preload">` out of an image marked high
    // priority, so the fetch starts with the document rather than after the
    // parser reaches the tag. That head start is the LCP budget.
    expect(renderToStaticMarkup(<LandingPageEnglish />)).toMatch(
      /<link rel="preload" as="image"[^>]+fetchPriority="high"/,
    )
  })

  it('describes the recording to somebody who cannot see it', () => {
    const html = renderToStaticMarkup(<LandingPageEnglish />)
    const alt = /<img[^>]+alt="([^"]*)"/.exec(html)?.[1] ?? ''
    // Not "demo", not "screenshot": what the three scenarios are.
    expect(alt).toContain('never offered')
    expect(alt).toContain('refuses')
  })

  it('renders in Portuguese at its own URL', () => {
    const html = renderToStaticMarkup(<LandingPagePortuguese />)
    expect(html).toContain('O ERP é a parte difícil')
    expect(html).not.toContain(THESIS)
  })
})
