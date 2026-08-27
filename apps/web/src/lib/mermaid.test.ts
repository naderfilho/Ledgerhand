import { describe, expect, it } from 'vitest'
import { extractGraph, parseGraph } from './mermaid'

/**
 * The parser that keeps the drawing honest.
 *
 * Most of what matters about it is that it refuses. A checker that shrugs at a
 * line it does not understand reports agreement it never verified, and this one
 * exists specifically so that a change to the README cannot pass unnoticed --
 * so a new Mermaid feature appearing in that block has to fail loudly rather
 * than be skipped.
 */

describe('parseGraph', () => {
  it('reads nodes, their shapes and the subgraph they sit in', () => {
    const graph = parseGraph(`
      graph TD
        subgraph adapters["Adapters"]
          web["apps/web<br/>Next.js UI + API"]
        end
        db["packages/db"]
        pg[("Postgres 17")]
        web --> db
        db --> pg
    `)

    expect(graph.nodes).toEqual([
      {
        id: 'web',
        label: [
          { text: 'apps/web', italic: false },
          { text: 'Next.js UI + API', italic: false },
        ],
        shape: 'box',
        group: 'Adapters',
      },
      { id: 'db', label: [{ text: 'packages/db', italic: false }], shape: 'box', group: null },
      { id: 'pg', label: [{ text: 'Postgres 17', italic: false }], shape: 'cylinder', group: null },
    ])
  })

  it('reads an italic line inside a label', () => {
    const graph = parseGraph('graph TD\n  a["one<br/><i>two</i>"]')
    expect(graph.nodes[0]?.label).toEqual([
      { text: 'one', italic: false },
      { text: 'two', italic: true },
    ])
  })

  it('tells a dotted edge from a solid one, and keeps the edge label', () => {
    const graph = parseGraph(`
      graph TD
        a["a"]
        b["b"]
        c["c"]
        a -->|over MCP| b
        b -.->|ports| c
    `)
    expect(graph.edges).toEqual([
      { from: 'a', to: 'b', label: 'over MCP', dotted: false },
      { from: 'b', to: 'c', label: 'ports', dotted: true },
    ])
  })

  it('ignores style directives, which the page decides for itself', () => {
    const graph = parseGraph('graph TD\n  a["a"]\n  style a fill:#1f6feb,color:#fff')
    expect(graph.nodes).toHaveLength(1)
  })

  it('throws on a line it was never taught rather than skipping it', () => {
    expect(() => parseGraph('graph TD\n  a{{"a hexagon"}}')).toThrow('was not taught')
  })

  it('throws on an edge to a node nobody declared', () => {
    expect(() => parseGraph('graph TD\n  a["a"]\n  a --> ghost')).toThrow('undeclared node')
  })

  it('throws on a subgraph left open', () => {
    expect(() => parseGraph('graph TD\n  subgraph s["S"]\n  a["a"]')).toThrow('never closed')
  })
})

describe('extractGraph', () => {
  it('takes the flowchart and not the entity diagram beside it', () => {
    const markdown = [
      '```mermaid',
      'erDiagram',
      '  TENANTS ||--o{ USERS : "has"',
      '```',
      'prose',
      '```mermaid',
      'graph TD',
      '  a["a"]',
      '```',
    ].join('\n')
    expect(extractGraph(markdown).trim()).toBe('graph TD\n  a["a"]')
  })

  it('says so when there is no flowchart at all', () => {
    expect(() => extractGraph('# just prose')).toThrow('graph TD')
  })
})
