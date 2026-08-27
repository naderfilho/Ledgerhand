/**
 * ---------------------------------------------------------------------------
 * Reading the palette the way a browser does
 * ---------------------------------------------------------------------------
 * The colours in `globals.css` are written in `oklch`, which is the right thing
 * to write them in and the wrong thing to eyeball a contrast ratio from: a
 * lightness of 0.58 is not 58% of the way to white, and two tokens with the same
 * L can land on opposite sides of the WCAG threshold once chroma is in play.
 *
 * So the ratios are computed rather than judged. This converts oklch to sRGB by
 * the same arithmetic a browser uses, which is what lets `palette.test.ts`
 * assert that the pairs this application actually renders stay legible after
 * somebody nudges a colour.
 */

export interface Srgb {
  readonly r: number
  readonly g: number
  readonly b: number
}

const OKLCH = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/

/** oklch -> oklab -> LMS -> linear sRGB -> gamma-encoded sRGB. */
export function parseOklch(value: string): Srgb {
  const match = OKLCH.exec(value.trim())
  if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) {
    throw new Error(`not an oklch() colour: ${value}`)
  }
  const lightness = Number(match[1])
  const chroma = Number(match[2])
  const hue = (Number(match[3]) * Math.PI) / 180

  const a = chroma * Math.cos(hue)
  const b = chroma * Math.sin(hue)

  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3

  const encode = (linear: number): number => {
    const clamped = Math.min(1, Math.max(0, linear))
    const gamma = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055
    return Math.round(gamma * 255)
  }

  return {
    r: encode(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: encode(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: encode(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  }
}

function relativeLuminance({ r, g, b }: Srgb): number {
  const channel = (value: number): number => {
    const v = value / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** The WCAG 2.1 contrast ratio, between 1 and 21. */
export function contrastRatio(one: Srgb, two: Srgb): number {
  const [lighter, darker] = [relativeLuminance(one), relativeLuminance(two)].sort((a, b) => b - a)
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05)
}

/**
 * The custom properties declared in one CSS rule.
 *
 * A deliberately small parser: it wants the `:root` and `.dark` blocks in
 * `globals.css` and nothing else, and it throws rather than returning an empty
 * palette that would make every assertion below it pass by accident.
 */
export function readTokens(css: string, selector: string): Readonly<Record<string, string>> {
  const start = css.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`globals.css has no "${selector}" rule`)
  const end = css.indexOf('\n}', start)
  if (end === -1) throw new Error(`the "${selector}" rule in globals.css is not closed`)

  const tokens: Record<string, string> = {}
  for (const line of css.slice(start, end).split('\n')) {
    const declaration = /^\s*(--[\w-]+):\s*([^;]+);/.exec(line)
    if (declaration?.[1] !== undefined && declaration[2] !== undefined) {
      tokens[declaration[1]] = declaration[2].trim()
    }
  }
  if (Object.keys(tokens).length === 0) throw new Error(`no custom properties in "${selector}"`)
  return tokens
}
