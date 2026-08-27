import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { extractGraph, parseGraph } from '@/lib/mermaid'
import { ARCHITECTURE } from './architecture'

/**
 * The page's drawing and the README's Mermaid are the same graph.
 *
 * This is the whole reason the diagram is hand-drawn rather than rendered: a
 * Mermaid image cannot follow a theme chosen by a class, so the page draws its
 * own -- and a second drawing of one graph is the drift this repository spends
 * its README arguing against. So neither is the authority. They are compared.
 *
 * Labels are compared too, not just the shape of the graph. Renaming a package
 * in the README and leaving the page naming the old one would be a page that
 * describes a repository that no longer exists, which is a worse failure than a
 * missing arrow because it looks fine.
 */

const README = readFileSync(
  fileURLToPath(new URL('../../../../../README.md', import.meta.url)),
  'utf8',
)
const source = parseGraph(extractGraph(README))

const byId = <T extends { readonly id: string }>(entries: readonly T[]): readonly T[] =>
  [...entries].sort((a, b) => a.id.localeCompare(b.id))

const edgeKey = (edge: { from: string; to: string }): string => `${edge.from}->${edge.to}`

describe('the architecture diagram', () => {
  it('draws every node the README declares, with the same labels', () => {
    expect(byId(ARCHITECTURE.nodes)).toEqual(byId(source.nodes))
  })

  it('draws every edge the README declares, with the same labels and the same dotted arrow', () => {
    const sorted = (graph: typeof source): unknown =>
      [...graph.edges].sort((a, b) => edgeKey(a).localeCompare(edgeKey(b)))
    expect(sorted(ARCHITECTURE)).toEqual(sorted(source))
  })

  it('still has no arrow from the agent to the database, which is the point of it', () => {
    // ESLint fails the build if that dependency ever appears in the code. This
    // fails the build if the picture starts claiming it does.
    const reachable = new Set(
      ARCHITECTURE.edges.filter((edge) => edge.from === 'agent').map((edge) => edge.to),
    )
    expect(reachable).not.toContain('db')
    expect(reachable).not.toContain('domain')
    expect(reachable).toEqual(new Set(['mcp']))
  })
})
