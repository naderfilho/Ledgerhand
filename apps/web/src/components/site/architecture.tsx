import type * as React from 'react'
import type { Graph, GraphNode, LabelLine } from '@/lib/mermaid'

/**
 * ---------------------------------------------------------------------------
 * The dependency graph, drawn twice and checked once
 * ---------------------------------------------------------------------------
 * The README renders this from Mermaid, which GitHub understands. This page
 * cannot use that image: Mermaid bakes its colours in, and this site has two
 * themes chosen by a class rather than by `prefers-color-scheme`, so a rendered
 * PNG or SVG would be right in one of them and wrong in the other.
 *
 * So the drawing is by hand, in the site's own colour tokens -- and the graph
 * it draws is declared as data below, which `architecture.test.ts` compares
 * against the Mermaid in the README. Add an arrow in one place and not the
 * other and the build goes red. The layout is the only authored part; the nodes,
 * the edges and every label come from the same graph the README states.
 */

interface Placed {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  /** The README emphasises two nodes with a `style` line; this is that, in tokens. */
  readonly emphasis?: 'domain' | 'agent'
}

const WIDTH = 620
const HEIGHT = 616

/** Where each node sits. Top-down, the way `graph TD` reads. */
const PLACED: readonly Placed[] = [
  { id: 'evals', x: 330, y: 8, width: 250, height: 52 },
  { id: 'agent', x: 330, y: 104, width: 250, height: 52, emphasis: 'agent' },
  { id: 'web', x: 30, y: 216, width: 250, height: 52 },
  { id: 'mcp', x: 330, y: 216, width: 250, height: 52 },
  { id: 'domain', x: 165, y: 344, width: 290, height: 72, emphasis: 'domain' },
  { id: 'db', x: 180, y: 464, width: 260, height: 52 },
  { id: 'pg', x: 245, y: 560, width: 130, height: 44 },
]

/** The box around the two adapters, from the `subgraph` in the source. */
const GROUP = { label: 'Adapters', x: 12, y: 186, width: 586, height: 110 }

type Anchor = readonly [x: number, y: number]

interface Drawn {
  readonly from: string
  readonly to: string
  readonly start: Anchor
  readonly end: Anchor
  /** Where the edge's own label sits, when it has one. */
  readonly label?: Anchor
}

const at = (id: string): Placed => {
  const node = PLACED.find((placed) => placed.id === id)
  if (node === undefined) throw new Error(`no box was placed for "${id}"`)
  return node
}

/** A point on a node's edge, `across` being 0 at its left and 1 at its right. */
const bottom = (id: string, across = 0.5): Anchor => {
  const node = at(id)
  return [node.x + node.width * across, node.y + node.height]
}
const top = (id: string, across = 0.5): Anchor => {
  const node = at(id)
  return [node.x + node.width * across, node.y]
}

const DRAWN: readonly Drawn[] = [
  { from: 'evals', to: 'agent', start: bottom('evals'), end: top('agent') },
  {
    from: 'agent',
    to: 'mcp',
    start: bottom('agent'),
    end: top('mcp'),
    label: [463, 190],
  },
  { from: 'web', to: 'domain', start: bottom('web'), end: top('domain', 0.2) },
  { from: 'mcp', to: 'domain', start: bottom('mcp'), end: top('domain', 0.8) },
  {
    from: 'domain',
    to: 'db',
    start: bottom('domain'),
    end: top('db'),
    label: [318, 444],
  },
  { from: 'db', to: 'pg', start: bottom('db'), end: top('pg') },
]

/**
 * The graph this drawing claims to be, in the shape `parseGraph` returns.
 *
 * Exported for the test rather than for rendering: it is the assertion that the
 * picture and the README describe one system.
 */
export const ARCHITECTURE: Graph = {
  nodes: [
    node('web', ['apps/web', 'Next.js UI + API'], 'Adapters'),
    node('mcp', ['packages/mcp-server', 'tools, resources, prompts'], 'Adapters'),
    node('agent', ['packages/agent', 'guardrails, approvals, audit']),
    node('evals', ['packages/evals', 'scenarios and scoring']),
    node('domain', ['packages/domain', 'use cases, invariants, events'], null, [
      'no database, no framework',
    ]),
    node('db', ['packages/db', 'Drizzle adapters, RLS, migrations']),
    { id: 'pg', label: [{ text: 'Postgres 17', italic: false }], shape: 'cylinder', group: null },
  ],
  edges: [
    { from: 'web', to: 'domain', label: null, dotted: false },
    { from: 'mcp', to: 'domain', label: null, dotted: false },
    { from: 'agent', to: 'mcp', label: 'MCP protocol only', dotted: false },
    { from: 'evals', to: 'agent', label: null, dotted: false },
    { from: 'domain', to: 'db', label: 'ports', dotted: true },
    { from: 'db', to: 'pg', label: null, dotted: false },
  ],
}

function node(
  id: string,
  plain: readonly string[],
  group: string | null = null,
  italic: readonly string[] = [],
): GraphNode {
  return {
    id,
    label: [
      ...plain.map((text) => ({ text, italic: false })),
      ...italic.map((text) => ({ text, italic: true })),
    ],
    shape: 'box',
    group,
  }
}

const EDGE_BY_ENDS = new Map(
  ARCHITECTURE.edges.map((edge) => [`${edge.from}->${edge.to}`, edge] as const),
)
const NODE_BY_ID = new Map(ARCHITECTURE.nodes.map((entry) => [entry.id, entry] as const))

function labelOf(id: string): readonly LabelLine[] {
  const found = NODE_BY_ID.get(id)
  if (found === undefined) throw new Error(`no node declared for "${id}"`)
  return found.label
}

/**
 * The whole graph as one sentence, for a screen reader and for anybody whose
 * browser did not draw the SVG. It is generated from the same data, so it
 * cannot describe a different diagram either.
 */
function describe(): string {
  const named = (id: string): string => labelOf(id)[0]?.text ?? id
  return ARCHITECTURE.edges
    .map((edge) => {
      const how = edge.dotted ? 'depends on' : 'uses'
      const via = edge.label === null ? '' : ` through ${edge.label}`
      return `${named(edge.from)} ${how} ${named(edge.to)}${via}`
    })
    .join('. ')
}

export function Architecture({ className }: { readonly className?: string }): React.JSX.Element {
  return (
    <svg
      viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
      className={className}
      role="img"
      aria-labelledby="architecture-title architecture-desc"
    >
      <title id="architecture-title">
        The dependency graph: six packages, one direction, and no arrow from the agent to the
        database
      </title>
      <desc id="architecture-desc">{describe()}</desc>

      <defs>
        <marker
          id="architecture-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-border-strong" />
        </marker>
      </defs>

      {/* The subgraph box, behind everything it contains. */}
      <g>
        <rect
          x={GROUP.x}
          y={GROUP.y}
          width={GROUP.width}
          height={GROUP.height}
          rx="12"
          className="fill-surface-sunken stroke-border"
          strokeDasharray="4 4"
        />
        <text
          x={GROUP.x + 14}
          y={GROUP.y + 20}
          className="fill-muted-foreground text-[11px] font-semibold tracking-wide uppercase"
        >
          {GROUP.label}
        </text>
      </g>

      {DRAWN.map((edge) => {
        const declared = EDGE_BY_ENDS.get(`${edge.from}->${edge.to}`)
        if (declared === undefined) throw new Error(`drew an edge nobody declared: ${edge.from}`)
        return (
          <g key={`${edge.from}->${edge.to}`}>
            <line
              x1={edge.start[0]}
              y1={edge.start[1]}
              x2={edge.end[0]}
              y2={edge.end[1]}
              className="stroke-border-strong"
              strokeWidth="1.5"
              strokeDasharray={declared.dotted ? '5 4' : undefined}
              markerEnd="url(#architecture-arrow)"
            />
            {declared.label === null || edge.label === undefined ? null : (
              <text
                x={edge.label[0]}
                y={edge.label[1]}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px]"
              >
                {declared.label}
              </text>
            )}
          </g>
        )
      })}

      {PLACED.map((placed) => {
        const lines = labelOf(placed.id)
        const isCylinder = NODE_BY_ID.get(placed.id)?.shape === 'cylinder'
        const centre = placed.x + placed.width / 2
        // Vertically centred as a block, so a two-line box and a three-line box
        // both sit level with the arrows that meet them.
        const firstBaseline = placed.y + placed.height / 2 - (lines.length - 1) * 8 + 5

        return (
          <g key={placed.id}>
            {isCylinder ? (
              <ellipse
                cx={centre}
                cy={placed.y + placed.height / 2}
                rx={placed.width / 2}
                ry={placed.height / 2}
                className="fill-surface stroke-border-strong"
              />
            ) : (
              <rect
                x={placed.x}
                y={placed.y}
                width={placed.width}
                height={placed.height}
                rx="10"
                className={
                  placed.emphasis === 'domain'
                    ? 'fill-primary stroke-primary'
                    : placed.emphasis === 'agent'
                      ? 'fill-info stroke-info'
                      : 'fill-surface stroke-border-strong'
                }
              />
            )}
            {lines.map((line, index) => (
              <text
                key={line.text}
                x={centre}
                y={firstBaseline + index * 16}
                textAnchor="middle"
                fontStyle={line.italic ? 'italic' : undefined}
                className={
                  placed.emphasis === undefined
                    ? index === 0
                      ? 'fill-foreground text-[13px] font-medium'
                      : 'fill-muted-foreground text-[11px]'
                    : index === 0
                      ? 'fill-primary-foreground text-[13px] font-medium'
                      : 'fill-primary-foreground/85 text-[11px]'
                }
              >
                {line.text}
              </text>
            ))}
          </g>
        )
      })}
    </svg>
  )
}
