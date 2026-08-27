/**
 * ---------------------------------------------------------------------------
 * Enough Mermaid to check a drawing against its source
 * ---------------------------------------------------------------------------
 * The architecture diagram exists twice: as a ```mermaid``` block in the README,
 * which GitHub renders, and as a hand-drawn SVG on the public page, which is
 * themed with the site's own colour tokens and therefore survives the dark and
 * light switch that a rendered image cannot.
 *
 * Two drawings of one graph is exactly the drift this repository argues
 * against, so neither is trusted: this reads the Mermaid, the SVG declares the
 * same nodes and edges as data, and a test fails the build when they disagree.
 * Adding an arrow to the README and not to the page is then a red build rather
 * than a page that quietly describes a different system.
 *
 * It is not a Mermaid parser. It is a parser for the eleven lines in this
 * repository's README, and it throws on anything it was not taught, because a
 * checker that silently ignores what it does not understand checks nothing.
 */

export type NodeShape = 'box' | 'cylinder'

export interface LabelLine {
  readonly text: string
  readonly italic: boolean
}

export interface GraphNode {
  readonly id: string
  readonly label: readonly LabelLine[]
  readonly shape: NodeShape
  /** The subgraph it was declared inside, by that subgraph's label. */
  readonly group: string | null
}

export interface GraphEdge {
  readonly from: string
  readonly to: string
  readonly label: string | null
  /** `-.->` rather than `-->`: a dependency inverted through a port. */
  readonly dotted: boolean
}

export interface Graph {
  readonly nodes: readonly GraphNode[]
  readonly edges: readonly GraphEdge[]
}

const SUBGRAPH = /^subgraph\s+\w+\["([^"]*)"\]$/
const CYLINDER = /^(\w+)\[\("([^"]*)"\)\]$/
const BOX = /^(\w+)\["([^"]*)"\]$/
const EDGE = /^(\w+)\s*(-->|-\.->)(?:\|([^|]*)\|)?\s*(\w+)$/

/** `a<br/>b<br/><i>c</i>` becomes three lines, the last one italic. */
function parseLabel(raw: string): readonly LabelLine[] {
  return raw.split(/<br\s*\/?>/).map((part) => {
    const italic = /^<i>[\s\S]*<\/i>$/.test(part.trim())
    return { text: italic ? part.trim().slice(3, -4) : part.trim(), italic }
  })
}

/**
 * Reads a `graph TD` block. Styling directives are skipped: `style domain
 * fill:#1f6feb` says which node the README wanted to emphasise, and the page
 * makes that decision again in its own palette rather than inheriting a hex
 * code that means nothing against a light background.
 */
export function parseGraph(source: string): Graph {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const groups: string[] = []

  for (const raw of source.split('\n')) {
    const line = raw.trim()
    if (line === '' || line === 'graph TD' || line.startsWith('style ')) continue

    if (line === 'end') {
      if (groups.pop() === undefined) throw new Error('an `end` with no open subgraph')
      continue
    }

    const subgraph = SUBGRAPH.exec(line)
    if (subgraph?.[1] !== undefined) {
      groups.push(subgraph[1])
      continue
    }

    const edge = EDGE.exec(line)
    if (edge?.[1] !== undefined && edge[4] !== undefined) {
      edges.push({
        from: edge[1],
        to: edge[4],
        label: edge[3] ?? null,
        dotted: edge[2] === '-.->',
      })
      continue
    }

    const cylinder = CYLINDER.exec(line)
    if (cylinder?.[1] !== undefined && cylinder[2] !== undefined) {
      nodes.push({
        id: cylinder[1],
        label: parseLabel(cylinder[2]),
        shape: 'cylinder',
        group: groups.at(-1) ?? null,
      })
      continue
    }

    const box = BOX.exec(line)
    if (box?.[1] !== undefined && box[2] !== undefined) {
      nodes.push({
        id: box[1],
        label: parseLabel(box[2]),
        shape: 'box',
        group: groups.at(-1) ?? null,
      })
      continue
    }

    throw new Error(`this parser was not taught the line: ${line}`)
  }

  if (groups.length > 0) throw new Error(`subgraph "${groups.join('", "')}" was never closed`)

  const declared = new Set(nodes.map((node) => node.id))
  for (const edge of edges) {
    for (const end of [edge.from, edge.to]) {
      if (!declared.has(end)) throw new Error(`edge refers to an undeclared node: ${end}`)
    }
  }

  return { nodes, edges }
}

/**
 * Pulls the `graph TD` block out of a markdown document.
 *
 * The README carries two Mermaid blocks -- the architecture and the entity
 * diagram -- so this asks for the one that opens with `graph TD` rather than
 * taking the first it finds.
 */
export function extractGraph(markdown: string): string {
  for (const match of markdown.matchAll(/```mermaid\n([\s\S]*?)```/g)) {
    const body = match[1]
    if (body?.trimStart().startsWith('graph TD') === true) return body
  }
  throw new Error('no ```mermaid``` block starting with `graph TD` was found')
}
