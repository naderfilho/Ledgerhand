import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { translator } from '@/lib/i18n'
import { DESTRUCTIVE_COUNT, OPERATION_COUNT, OPERATIONS_BY_ROLE } from '@/lib/operations'
import { EN } from './landing.en'
import { PT } from './landing.pt'
import type { LandingContent } from './landing'

/**
 * ---------------------------------------------------------------------------
 * The page cannot say something the README does not
 * ---------------------------------------------------------------------------
 * Every English sentence on the public page that states something about the
 * system is checked, whole, against README.md. Edit one and not the other and
 * the build goes red.
 *
 * The README hard-wraps its prose and the page does not, so both sides are
 * compared with runs of whitespace flattened to single spaces. That is the only
 * difference allowed: not a reworded clause, not a fixed typo, not a shortened
 * sentence. A sentence worth changing gets changed in the README first, which
 * is the point -- the argument has one home.
 *
 * Interface labels are exempt and listed as such. "Copy" and "Scenario" have
 * nowhere in a README to come from.
 */

const README = readFileSync(
  fileURLToPath(new URL('../../../../README.md', import.meta.url)),
  'utf8',
)

const flat = (text: string): string => text.replace(/\s+/g, ' ').trim()
const FLATTENED_README = flat(README)

/** Every sentence the page borrows, and where on the page it sits. */
function borrowed(content: LandingContent): readonly (readonly [string, string])[] {
  const entries: (readonly [string, string])[] = [
    ['meta.description', content.meta.description],
    ['hero.thesis', content.hero.thesis],
    ['hero.lede', content.hero.lede],
    ['hero.claim', content.hero.claim],
    ['hero.demoAlt', content.hero.demoAlt],
    ...content.hero.caption.map((text, index) => [`hero.caption[${String(index)}]`, text] as const),
    ['access.lead', content.access.lead],
    ['access.pitch', content.access.pitch],
    // Rendered as four list items; the README writes them as one clause, and
    // it is the clause that has to still be there.
    ['access.pitchDetail', content.access.pitchDetail.join(', ')],
    ['guardrails.heading', content.guardrails.heading],
    ...content.guardrails.intro.map(
      (text, index) => [`guardrails.intro[${String(index)}]`, text] as const,
    ),
    ['evals.lead', content.evals.lead],
    ['evals.note', content.evals.note],
    ['firstRun.heading', content.firstRun.heading],
    ['firstRun.intro', content.firstRun.intro],
    ['firstRun.outro', content.firstRun.outro],
    ['absent.heading', content.absent.heading],
    ['absent.intro', content.absent.intro],
    ['absent.outro', content.absent.outro],
    ['architecture.note', content.architecture.note],
  ]

  for (const section of [content.mcp, content.agent]) {
    entries.push([`${section.heading} heading`, section.heading])
    for (const [index, block] of section.blocks.entries()) {
      if (block.text === undefined) continue
      entries.push([`${section.heading} block ${String(index)}`, block.text])
    }
  }

  for (const item of content.guardrails.items) {
    entries.push([`guardrails "${item.title}"`, item.title])
    for (const [index, block] of item.blocks.entries()) {
      if (block.text === undefined) continue
      entries.push([`guardrails "${item.title}" block ${String(index)}`, block.text])
    }
  }

  for (const finding of content.firstRun.findings) {
    entries.push([`firstRun "${finding.lead}"`, finding.lead])
    for (const [index, text] of finding.body.entries()) {
      entries.push([`firstRun "${finding.lead}" body ${String(index)}`, text])
    }
  }

  for (const row of content.absent.rows) {
    entries.push([`absent "${row.feature}" feature`, row.feature])
  }

  return entries
}

describe('the English on the public page', () => {
  it.each(borrowed(EN).map(([where, text]) => [where, text] as const))(
    'takes %s from the README, word for word',
    (_where, text) => {
      // Markdown links on the page point at github.com; the README's point at
      // repository-relative paths. The words are what is compared.
      const words = flat(text).replace(/\]\([^)]*\)/g, ']()')
      const readme = FLATTENED_README.replace(/\]\([^)]*\)/g, ']()')
      expect(readme).toContain(words)
    },
  )

  it('takes the header tagline from the one the sign-in screen already carries', () => {
    // The one sentence on the page that is not the README's. It is the header
    // line the sign-in screen has shown since before this page existed, and
    // the application's own dictionary already holds its translation -- so it
    // is pinned to that rather than exempted. A second tagline drifting from
    // the first would be the same failure in a smaller place.
    expect(translator('pt')(EN.nav.tagline)).toBe(PT.nav.tagline)
    expect(translator('pt')(EN.nav.tagline)).not.toBe(EN.nav.tagline)
  })

  it('states the four guardrail messages exactly as the system produces them', () => {
    const terminals = EN.guardrails.items.flatMap((item) =>
      item.blocks.filter((block) => block.kind === 'terminal').map((block) => block.text ?? ''),
    )
    expect(terminals.length).toBeGreaterThan(0)
    for (const message of terminals) {
      // Not flattened: a message shown in a monospaced block keeps its line
      // breaks, and a page that rewrapped one would be quoting something the
      // terminal never printed.
      expect(README).toContain(message)
    }
  })
})

describe('the numbers on the page', () => {
  it('are not in the content files at all', () => {
    // The registry decides how many operations there are and the eval summary
    // decides the rates. A digit typed into a sentence here is the drift this
    // repository spends its README arguing against.
    const counted = [String(OPERATION_COUNT), String(DESTRUCTIVE_COUNT)]
    const sentences = [
      ...borrowed(EN).map(([, text]) => text),
      ...borrowed(PT).map(([, text]) => text),
    ]
    for (const sentence of sentences) {
      for (const number of counted) {
        expect(sentence).not.toContain(` ${number} `)
      }
    }
  })

  it('agree with the README about how many operations each role may run', () => {
    // The README states three of the five in a code block. The page counts all
    // five from the registry, and these are the same numbers or one of the two
    // is wrong.
    for (const { role, operations } of OPERATIONS_BY_ROLE) {
      const stated = new RegExp(`^${role}\\s+${String(operations)} operations$`, 'm').test(README)
      const absent = !new RegExp(`^${role}\\s+\\d+ operations$`, 'm').test(README)
      expect(stated || absent).toBe(true)
    }
  })
})

describe('the Portuguese', () => {
  it('answers every key the English has', () => {
    const shapeOf = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map((entry: unknown) => shapeOf(entry))
      if (typeof value === 'object' && value !== null) {
        const described: [string, unknown][] = Object.entries(value).map(([key, nested]) => [
          key,
          shapeOf(nested),
        ])
        described.sort((a, b) => a[0].localeCompare(b[0]))
        return Object.fromEntries(described)
      }
      return typeof value
    }
    expect(shapeOf(PT)).toEqual(shapeOf(EN))
  })

  it('leaves untranslated what the system emits, and translates the labels around it', () => {
    const messages = (content: LandingContent): readonly string[] =>
      content.guardrails.items.flatMap((item) =>
        item.blocks.filter((block) => block.kind === 'terminal').map((block) => block.text ?? ''),
      )
    const labels = (content: LandingContent): readonly string[] =>
      content.guardrails.items.flatMap((item) =>
        item.blocks.filter((block) => block.kind === 'terminal').map((block) => block.label ?? ''),
      )

    // The ERP writes these in English and that is how a person receives them.
    // Translating them here would show somebody a message nobody is ever sent.
    expect(messages(PT)).toEqual(messages(EN))
    // The captions are the page's own voice, and those do translate.
    for (const [index, label] of labels(PT).entries()) {
      expect(label).not.toBe(labels(EN)[index])
    }
  })

  it('leaves tool and role names alone, because renaming them names nothing', () => {
    const portuguese = JSON.stringify(PT)
    for (const identifier of ['settle_receivable', 'idempotency_key', 'preview_operation']) {
      expect(portuguese).toContain(identifier)
    }
    for (const role of OPERATIONS_BY_ROLE.map((entry) => entry.role)) {
      expect(portuguese).toContain(role)
    }
  })
})

describe('the licence the page claims', () => {
  const LICENCE = readFileSync(
    fileURLToPath(new URL('../../../../LICENSE.md', import.meta.url)),
    'utf8',
  )

  /**
   * Licences whose terms let the page call this open source. The list is short
   * on purpose: what makes one belong here is approval by the OSI, not that it
   * felt generous to whoever added it.
   */
  const OPEN_SOURCE = ['Apache License', 'MIT License', 'GNU AFFERO', 'GNU GENERAL PUBLIC']

  it('is the licence the repository actually ships', () => {
    // The footer named PolyForm Noncommercial for as long as LICENSE.md was
    // PolyForm Noncommercial, and would have gone on naming it afterwards.
    for (const content of [EN, PT]) {
      expect(LICENCE).toContain(content.footer.licence.split(' ')[0] ?? '')
    }
  })

  it('does not call the project open source unless the licence is', () => {
    // PolyForm Noncommercial restricts the field of use, so it fails the sixth
    // clause of the Open Source Definition. It sat under a header that said
    // "An open-source ERP" on every page view, and nothing caught it.
    const claimsOpenSource = [EN, PT].some((content) =>
      /open[- ]source|c\u00f3digo aberto/i.test(content.nav.tagline),
    )
    if (!claimsOpenSource) return
    expect(
      OPEN_SOURCE.some((name) => LICENCE.toUpperCase().includes(name.toUpperCase())),
      'the tagline says open source; LICENSE.md is not an OSI-approved licence',
    ).toBe(true)
  })
})
