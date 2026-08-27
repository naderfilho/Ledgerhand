'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * ---------------------------------------------------------------------------
 * Something is thinking behind this
 * ---------------------------------------------------------------------------
 * Signals travel the edges as streaks. When one arrives, the node it reaches
 * takes the charge -- flaring, shifting colour -- and fires onward down its own
 * edges. So what crosses the field is a cascade rather than a loop: it spreads,
 * it forks, it dies out, and it is seeded again where it has gone quiet.
 *
 * It is decoration, and it says so. It is not a visualisation of the agent --
 * that would be a lie, because the agent is a language model and not a graph.
 * What it is for is the impression a static page cannot give: that the screen
 * is attached to something working.
 *
 * The layout is a jittered lattice: even coverage, so no corner is bare, and
 * no two nodes in a row, so it never reads as graph paper. It comes from the
 * seeded generator the demo data already uses, because `Math.random` is not
 * available in this repository and the field has to be the same on the server
 * and the client anyway.
 *
 * Near the pointer, nodes swell, lines pick up, and the field leans very
 * slightly away, so moving across it disturbs something rather than sliding
 * over a picture.
 */

/** Deterministic PRNG (mulberry32), the same one the seed uses. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

type Rgb = readonly [number, number, number]

/**
 * The theme tokens are oklch(), and `fillStyle` hands them back as lab() --
 * reading the numbers out of that string yields lab coordinates pretending to
 * be RGB, which is a muddy brown where the accent should be. So the colour is
 * painted onto a single pixel and read back through the canvas's own
 * conversion, which is the only one guaranteed to agree with what it draws.
 * Once at setup, never per frame.
 */
function resolve(value: string, fallback: Rgb): Rgb {
  if (value === '') return fallback
  const probe = document.createElement('canvas')
  probe.width = 1
  probe.height = 1
  const context = probe.getContext('2d', { willReadFrequently: true })
  if (context === null) return fallback
  try {
    context.fillStyle = value
    context.fillRect(0, 0, 1, 1)
    const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
    if (red === undefined || green === undefined || blue === undefined) return fallback
    return [red, green, blue]
  } catch {
    return fallback
  }
}

function mix(a: Rgb, b: Rgb, amount: number): string {
  const t = Math.min(Math.max(amount, 0), 1)
  const channel = (index: 0 | 1 | 2): number => Math.round(a[index] + (b[index] - a[index]) * t)
  return `rgb(${String(channel(0))} ${String(channel(1))} ${String(channel(2))})`
}

interface Node {
  readonly x: number
  readonly y: number
  readonly neighbours: number[]
  /** 1 the instant a signal lands, decaying towards 0. */
  charge: number
}

interface Signal {
  readonly from: number
  readonly to: number
  readonly speed: number
  progress: number
}

const REACH = 170
const LEAN = 9
/** How long a node stays lit, and how far a streak trails behind its head. */
const DECAY_PER_SECOND = 1.9
const TAIL = 0.34
const MAX_SIGNALS = 120

function buildLattice(columns: number, rows: number, seed: number): Node[] {
  const random = createRandom(seed)
  const nodes: Node[] = []
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      // Jitter is most of a cell, so the lattice never shows through.
      nodes.push({
        x: (column + 0.5 + (random() - 0.5) * 0.85) / columns,
        y: (row + 0.5 + (random() - 0.5) * 0.85) / rows,
        neighbours: [],
        charge: 0,
      })
    }
  }

  // Each node keeps its three nearest, which makes a connected mesh without
  // the distance threshold that leaves lonely nodes at low densities.
  nodes.forEach((node, index) => {
    const ranked = nodes
      .map((other, otherIndex) => ({
        otherIndex,
        distance: Math.hypot(node.x - other.x, node.y - other.y),
      }))
      .filter((entry) => entry.otherIndex !== index)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3)
    node.neighbours.push(...ranked.map((entry) => entry.otherIndex))
  })

  return nodes
}

export function NeuralField({
  className,
  columns = 7,
  rows = 4,
  seed = 20_260_316,
  /** 0 is barely there, 1 is as loud as this is allowed to get. */
  intensity = 0.5,
}: {
  readonly className?: string
  readonly columns?: number
  readonly rows?: number
  readonly seed?: number
  readonly intensity?: number
}): React.JSX.Element {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const intensityRef = React.useRef(intensity)
  intensityRef.current = intensity

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return undefined
    const context = canvas.getContext('2d')
    if (context === null) return undefined

    const nodes = buildLattice(columns, rows, seed)
    const random = createRandom(seed ^ 0x9e37)
    const styles = getComputedStyle(canvas)
    const idle = resolve(styles.getPropertyValue('--primary').trim(), [108, 133, 255])
    const hot = resolve(styles.getPropertyValue('--info').trim(), [122, 190, 255])

    let width = 0
    let height = 0
    const resize = (): void => {
      const ratio = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      canvas.width = Math.max(1, Math.round(width * ratio))
      canvas.height = Math.max(1, Math.round(height * ratio))
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    let pointerX = Number.NaN
    let pointerY = Number.NaN
    const follow = (event: PointerEvent): void => {
      const rect = canvas.getBoundingClientRect()
      pointerX = event.clientX - rect.left
      pointerY = event.clientY - rect.top
    }
    const forget = (): void => {
      pointerX = Number.NaN
      pointerY = Number.NaN
    }
    window.addEventListener('pointermove', follow, { passive: true })
    window.addEventListener('pointerleave', forget)

    const signals: Signal[] = []
    const fire = (from: number): void => {
      const node = nodes[from]
      if (node === undefined || signals.length >= MAX_SIGNALS) return
      // One or two ways onward: enough to fork, not enough to flood.
      const forks = random() < 0.35 ? 2 : 1
      for (let n = 0; n < forks; n += 1) {
        const to = node.neighbours[Math.floor(random() * node.neighbours.length)]
        if (to === undefined) continue
        signals.push({ from, to, speed: 0.5 + random() * 0.9, progress: 0 })
      }
    }
    // Start it mid-cascade, so the first frame is already alive.
    for (let n = 0; n < 14; n += 1) fire(Math.floor(random() * nodes.length))

    const still = window.matchMedia('(prefers-reduced-motion: reduce)')
    let previous = 0

    const draw = (seconds: number): void => {
      const delta = previous === 0 ? 0.016 : Math.min(seconds - previous, 0.05)
      previous = seconds
      const power = intensityRef.current

      context.clearRect(0, 0, width, height)
      if (width === 0 || height === 0) return

      const hasPointer = !Number.isNaN(pointerX)
      const nearness = (x: number, y: number): number => {
        if (!hasPointer) return 0
        const distance = Math.hypot(x - pointerX, y - pointerY)
        return distance > REACH ? 0 : 1 - distance / REACH
      }

      const placed = nodes.map((node) => {
        let x = node.x * width
        let y = node.y * height
        const close = nearness(x, y)
        if (close > 0) {
          const angle = Math.atan2(y - pointerY, x - pointerX)
          x += Math.cos(angle) * close * LEAN
          y += Math.sin(angle) * close * LEAN
        }
        return { x, y, close }
      })

      // The resting mesh, faint: it is the road, not the traffic.
      context.lineWidth = 1
      for (const [index, node] of nodes.entries()) {
        const from = placed[index]
        if (from === undefined) continue
        for (const neighbour of node.neighbours) {
          if (neighbour <= index) continue
          const to = placed[neighbour]
          if (to === undefined) continue
          const lit = Math.max(from.close, to.close)
          context.globalAlpha = (0.26 + lit * 0.34) * power
          context.strokeStyle = mix(idle, hot, 0)
          context.beginPath()
          context.moveTo(from.x, from.y)
          context.lineTo(to.x, to.y)
          context.stroke()
        }
      }

      // The traffic: a streak with a bright head and a fading tail.
      context.lineCap = 'round'
      for (let index = signals.length - 1; index >= 0; index -= 1) {
        const signal = signals[index]
        if (signal === undefined) continue
        signal.progress += signal.speed * delta

        const from = placed[signal.from]
        const to = placed[signal.to]
        if (from === undefined || to === undefined) {
          signals.splice(index, 1)
          continue
        }

        if (signal.progress >= 1) {
          const arrived = nodes[signal.to]
          if (arrived !== undefined) {
            arrived.charge = 1
            fire(signal.to)
          }
          signals.splice(index, 1)
          continue
        }

        const head = signal.progress
        const tail = Math.max(0, head - TAIL)
        const gradient = context.createLinearGradient(
          from.x + (to.x - from.x) * tail,
          from.y + (to.y - from.y) * tail,
          from.x + (to.x - from.x) * head,
          from.y + (to.y - from.y) * head,
        )
        gradient.addColorStop(0, mix(idle, hot, 0.2).replace('rgb(', 'rgba(').replace(')', ' / 0)'))
        gradient.addColorStop(1, mix(idle, hot, 1))
        context.globalAlpha = Math.min(1, 1.15 * power)
        context.strokeStyle = gradient
        context.lineWidth = 2.4
        context.beginPath()
        context.moveTo(from.x + (to.x - from.x) * tail, from.y + (to.y - from.y) * tail)
        context.lineTo(from.x + (to.x - from.x) * head, from.y + (to.y - from.y) * head)
        context.stroke()
      }
      context.lineWidth = 1

      // The nodes, which carry whatever charge last reached them.
      for (const [index, point] of placed.entries()) {
        const node = nodes[index]
        if (node === undefined) continue
        node.charge = Math.max(0, node.charge - DECAY_PER_SECOND * delta)
        const heat = node.charge

        if (heat > 0.02) {
          context.globalAlpha = heat * 0.4 * power
          context.fillStyle = mix(idle, hot, heat)
          context.beginPath()
          context.arc(point.x, point.y, 6 + heat * 12, 0, Math.PI * 2)
          context.fill()
        }

        context.globalAlpha = Math.min(1, (0.45 + heat * 0.55 + point.close * 0.5) * power)
        context.fillStyle = mix(idle, hot, heat)
        context.beginPath()
        context.arc(point.x, point.y, 2 + heat * 2.4 + point.close * 2.6, 0, Math.PI * 2)
        context.fill()
      }
      context.globalAlpha = 1

      // Never let it go out: if the cascade dies, light it again elsewhere.
      // Kept busy rather than merely alive: a field with three signals in it
      // reads as broken, not as calm.
      if (signals.length < 22) fire(Math.floor(random() * nodes.length))
    }

    let frame = 0
    if (still.matches) {
      draw(0)
    } else {
      const loop = (now: number): void => {
        draw(now / 1000)
        frame = window.requestAnimationFrame(loop)
      }
      frame = window.requestAnimationFrame(loop)
    }

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('pointermove', follow)
      window.removeEventListener('pointerleave', forget)
    }
  }, [columns, rows, seed])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 size-full', className)}
    />
  )
}
