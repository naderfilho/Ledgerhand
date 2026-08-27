import { ImageResponse } from 'next/og'
import { contentFor } from '@/content/landing'
import type { Lang } from '@/lib/i18n'
import { DESTRUCTIVE_COUNT, OPERATION_COUNT } from '@/lib/operations'
import evals from '@metrics/evals.json'

/**
 * ---------------------------------------------------------------------------
 * The card a link to this page unfurls into
 * ---------------------------------------------------------------------------
 * A link pasted into a post is the first thing most readers will see of this
 * project, and a link with no card is a grey rectangle with a domain on it.
 *
 * The card carries the thesis and four measured figures, and the figures come
 * from where every other figure here comes from: the use case registry and the
 * committed eval summary. A social card is exactly the artefact nobody thinks
 * to update, so it is the last place a hand-typed number should live.
 *
 * Generated at build time -- nothing here reads a request -- so it costs a
 * visitor nothing and Vercel serves it as a static PNG.
 *
 * Everything is laid out with explicit `display: flex`. Satori, which renders
 * this, does not implement the block layout a browser would fall back to, and
 * a div with two children and no display throws rather than stacking them.
 */

export const SIZE = { width: 1200, height: 630 }
export const CONTENT_TYPE = 'image/png'

// The two grounds of the palette, as `app/layout.tsx` declares them to the
// browser chrome. Written out rather than read from CSS because Satori has no
// stylesheet to resolve a custom property against.
const INK = '#16192b'
const PAPER = '#f6f7fb'
const MUTED = '#9aa3bd'
const ACCENT = '#5b8cff'

export function ogImage(lang: Lang): ImageResponse {
  const content = contentFor(lang)
  const held = evals.scenarios
    .filter((scenario) => scenario.kind === 'guardrail')
    .every((scenario) => scenario.passed === scenario.attempted)

  const facts: readonly (readonly [string, string])[] = [
    [String(OPERATION_COUNT), lang === 'pt' ? 'operações' : 'operations'],
    [String(DESTRUCTIVE_COUNT), lang === 'pt' ? 'exigem uma pessoa' : 'need a person'],
    [
      held ? (lang === 'pt' ? 'todas' : 'all') : lang === 'pt' ? 'nem todas' : 'not all',
      `${content.evals.guardrailGroup.toLowerCase()}, k=${String(evals.k.guardrail)}`,
    ],
    [
      `${String(Math.round(evals.capabilityRate * 100))}%`,
      `${content.evals.capabilityGroup.toLowerCase()}, k=${String(evals.k.capability)}`,
    ],
  ]

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: INK,
        padding: '72px 80px',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            display: 'flex',
            width: 14,
            height: 44,
            borderRadius: 7,
            background: ACCENT,
          }}
        />
        <div style={{ display: 'flex', fontSize: 34, color: PAPER, letterSpacing: -0.5 }}>
          Ledgerhand
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div
          style={{
            display: 'flex',
            fontSize: 60,
            lineHeight: 1.1,
            color: PAPER,
            letterSpacing: -1.5,
          }}
        >
          {content.hero.thesis}
        </div>
        <div style={{ display: 'flex', fontSize: 26, color: MUTED, lineHeight: 1.4 }}>
          {content.nav.tagline}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 56 }}>
        {facts.map(([figure, label]) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', fontSize: 40, color: ACCENT, letterSpacing: -1 }}>
              {figure}
            </div>
            <div style={{ display: 'flex', fontSize: 20, color: MUTED }}>{label}</div>
          </div>
        ))}
      </div>
    </div>,
    SIZE,
  )
}
