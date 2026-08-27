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

  it('renders in Portuguese at its own URL', () => {
    const html = renderToStaticMarkup(<LandingPagePortuguese />)
    expect(html).toContain('O ERP é a parte difícil')
    expect(html).not.toContain(THESIS)
  })
})
