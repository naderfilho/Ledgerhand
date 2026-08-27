import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { contrastRatio, parseOklch, readTokens } from './palette'

/**
 * ---------------------------------------------------------------------------
 * Every pair of colours the public page puts together, in both themes
 * ---------------------------------------------------------------------------
 * The page was audited in a real browser and passed at 5.78:1 in the dark and
 * 5.15:1 in the light. An audit is a photograph, though: it says the palette
 * was legible on the afternoon somebody looked. This is the part that keeps
 * being true, because a colour nudged half a step is exactly the change nobody
 * re-audits.
 *
 * It found one thing first time round. The guardrail verdict was rendered in
 * `--positive`, the saturated accent, which reaches 3.99:1 on the light ground
 * -- under the 4.5 that ordinary text needs. It now uses the badge, whose
 * `--positive-foreground` is the token drawn to sit on that wash.
 */

const CSS = readFileSync(fileURLToPath(new URL('../app/globals.css', import.meta.url)), 'utf8')

const THEMES = [
  { name: 'light', selector: ':root' },
  { name: 'dark', selector: '.dark' },
] as const

/**
 * Text colour against the ground it is rendered on, and what WCAG asks of it.
 *
 * 4.5 for body text, 3 for text at 24px or above and for the borders and icons
 * that carry meaning. Each pair here is one the landing page actually renders;
 * a pair nobody uses is not worth defending.
 */
const PAIRS = [
  { text: '--foreground', ground: '--background', need: 4.5, where: 'body text on the page' },
  { text: '--foreground', ground: '--surface', need: 4.5, where: 'body text on a card' },
  {
    text: '--muted-foreground',
    ground: '--background',
    need: 4.5,
    where: 'secondary text on the page',
  },
  {
    text: '--muted-foreground',
    ground: '--surface',
    need: 4.5,
    where: 'secondary text on a card',
  },
  {
    text: '--muted-foreground',
    ground: '--surface-sunken',
    need: 4.5,
    where: 'the label above a terminal block',
  },
  {
    text: '--foreground',
    ground: '--surface-sunken',
    need: 4.5,
    where: 'the messages the system produces',
  },
  {
    text: '--primary-foreground',
    ground: '--primary',
    need: 4.5,
    where: 'the button that opens the agent screen',
  },
  { text: '--primary', ground: '--background', need: 4.5, where: 'a link in the prose' },
  {
    text: '--positive-foreground',
    ground: '--positive-subtle',
    need: 4.5,
    where: 'a guardrail that held',
  },
  {
    text: '--danger-foreground',
    ground: '--danger-subtle',
    need: 4.5,
    where: 'a guardrail that broke',
  },
  {
    text: '--primary-foreground',
    ground: '--primary',
    need: 4.5,
    where: 'the emphasised node in the architecture diagram',
  },
] as const

describe.each(THEMES)('the $name palette', ({ selector }) => {
  const tokens = readTokens(CSS, selector)

  it.each(PAIRS)('is legible for $where', ({ text, ground, need }) => {
    const foreground = tokens[text]
    const background = tokens[ground]
    expect(foreground, `${text} is not declared in ${selector}`).toBeDefined()
    expect(background, `${ground} is not declared in ${selector}`).toBeDefined()

    const ratio = contrastRatio(parseOklch(foreground ?? ''), parseOklch(background ?? ''))
    expect(Number(ratio.toFixed(2))).toBeGreaterThanOrEqual(need)
  })
})

describe('the conversion the ratios are computed from', () => {
  it('turns oklch into the sRGB a browser would paint', () => {
    // Three anchors with known answers: white, black, and the blue this
    // application uses for its one accent.
    expect(parseOklch('oklch(1 0 0)')).toEqual({ r: 255, g: 255, b: 255 })
    expect(parseOklch('oklch(0 0 0)')).toEqual({ r: 0, g: 0, b: 0 })
    const primary = parseOklch('oklch(0.58 0.14 155)')
    expect(primary.g).toBeGreaterThan(primary.r)
    expect(primary.g).toBeGreaterThan(primary.b)
  })

  it('gives 21:1 for black on white and 1:1 for a colour on itself', () => {
    const white = parseOklch('oklch(1 0 0)')
    const black = parseOklch('oklch(0 0 0)')
    expect(Math.round(contrastRatio(black, white))).toBe(21)
    expect(contrastRatio(white, white)).toBe(1)
  })

  it('refuses a rule it cannot find rather than passing on an empty palette', () => {
    expect(() => readTokens(CSS, '.no-such-theme')).toThrow('no ".no-such-theme" rule')
  })
})
