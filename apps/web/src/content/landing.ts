import type { Lang } from '@/lib/i18n'
import { EN } from './landing.en'
import { PT } from './landing.pt'

/**
 * ---------------------------------------------------------------------------
 * What the public page says
 * ---------------------------------------------------------------------------
 * The English here is the README's English, sentence for sentence, and
 * `landing.test.ts` fails the build if a string stops appearing in it. That is
 * the whole arrangement: the argument was written once and calibrated once, and
 * a second copy of it that drifts is worse than no copy at all.
 *
 * Two things are deliberately not here.
 *
 * No numbers. Every figure on the page is computed where it is rendered --
 * from the use case registry, or from the committed eval summary -- because a
 * number in a content file is a number somebody typed.
 *
 * And no prose that is not in the README. If a sentence is needed that the
 * README does not have, the README is where it gets written first.
 */

export interface Block {
  /**
   * `role-counts` renders the operations-per-role listing, which is counted
   * from the use case registry rather than written down. It is a block kind
   * rather than something the component splices in at a remembered position,
   * so the content decides where it goes and nothing has to remember.
   */
  /**
   * `mcp-surface` renders what the server advertises: the tool count from the
   * registry, and the resource, template and prompt names. The names are
   * identifiers rather than copy, so they live in the content file; the count
   * does not, for the same reason no other count does.
   */
  /**
   * `budget-limits` renders the five axes a run is bounded on. Like the two
   * above it is a block kind rather than something the component splices in at
   * a remembered index, so the content decides where it sits.
   */
  readonly kind: 'text' | 'terminal' | 'role-counts' | 'mcp-surface' | 'budget-limits'
  readonly text?: string
  /** Terminal blocks only: whose words these are, for a screen reader. */
  readonly label?: string
  /**
   * Prefixes the paragraph with "<destructive> of the <total> ", both counted
   * from the registry. The README spells them as words and this renders digits;
   * what must not differ is the count, and that is the half nobody types.
   */
  readonly opensWithCounts?: boolean
}

export interface Guardrail {
  readonly title: string
  readonly blocks: readonly Block[]
}

export interface Finding {
  /** The bold sentence that opens it: what went wrong, in one line. */
  readonly lead: string
  readonly body: readonly string[]
}

export interface AbsentRow {
  readonly feature: string
  readonly why: string
}

export interface LandingContent {
  readonly meta: {
    readonly title: string
    readonly description: string
  }
  readonly nav: {
    readonly tagline: string
    readonly source: string
    readonly signIn: string
    readonly skipToContent: string
    readonly otherLanguage: string
  }
  readonly hero: {
    /**
     * The line above the headline. Three labels rather than a sentence: the
     * thesis stays the headline because it is the better line, and this is what
     * puts the protocol and the agent in front of it for somebody skimming.
     * Stored as parts so the separator is the design's decision and never a
     * character a screen reader has to read out.
     */
    readonly eyebrow: readonly string[]
    readonly thesis: string
    readonly lede: string
    readonly claim: string
    readonly demoAlt: string
    readonly caption: readonly string[]
  }
  readonly access: {
    readonly heading: string
    readonly lead: string
    /** Why the agent screen, and not the dashboard, is where the button points. */
    readonly pitch: string
    /** What the agent screen shows, as items rather than as a run-on sentence. */
    readonly pitchDetail: readonly string[]
    readonly emailLabel: string
    readonly passwordLabel: string
    readonly copy: string
    readonly copied: string
    readonly primary: string
    readonly secondary: string
  }
  readonly guardrails: {
    readonly heading: string
    readonly intro: readonly string[]
    readonly items: readonly Guardrail[]
    readonly outro: string
  }
  /** What the server advertises, and why it is assembled the way it is. */
  readonly mcp: {
    readonly heading: string
    readonly blocks: readonly Block[]
    readonly surfaceLabel: string
    readonly toolsSuffix: string
    readonly resources: readonly string[]
    readonly templates: readonly string[]
    readonly prompts: readonly string[]
  }
  /** The five ways a run is bounded, which is the part a budget holder asks about. */
  readonly agent: {
    readonly heading: string
    readonly blocks: readonly Block[]
    readonly limitsLabel: string
    /**
     * The limits by name and by environment variable, with no defaults. The
     * numbers live in `packages/agent`, and the web application may not import
     * it -- the agent's dependencies are its own. Naming the five axes is the
     * claim; the values are in the README, next to the code that holds them.
     */
    readonly limits: readonly { readonly name: string; readonly variable: string }[]
  }
  readonly evals: {
    readonly heading: string
    readonly lead: string
    readonly note: string
    readonly columns: {
      readonly scenario: string
      readonly asks: string
      readonly result: string
    }
    readonly guardrailGroup: string
    readonly capabilityGroup: string
    /** `held` and the rate are built from the numbers, not from a sentence. */
    readonly held: string
    readonly rateLabel: string
    readonly intervalLabel: string
    readonly sampleLabel: string
    readonly costLabel: string
  }
  readonly firstRun: {
    readonly heading: string
    readonly intro: string
    readonly findings: readonly Finding[]
    readonly outro: string
  }
  readonly absent: {
    readonly heading: string
    readonly intro: string
    readonly columns: { readonly feature: string; readonly why: string }
    readonly rows: readonly AbsentRow[]
    readonly outro: string
  }
  readonly architecture: {
    readonly heading: string
    readonly note: string
  }
  readonly footer: {
    readonly builtBy: string
    readonly repository: string
    readonly decisions: string
    readonly licence: string
    readonly measured: string
  }
}

export function contentFor(lang: Lang): LandingContent {
  return lang === 'pt' ? PT : EN
}
