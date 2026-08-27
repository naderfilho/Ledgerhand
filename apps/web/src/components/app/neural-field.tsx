'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * ---------------------------------------------------------------------------
 * Something is thinking behind this
 * ---------------------------------------------------------------------------
 * Signals do not cross one edge and stop. Each is a traveller: it runs a link,
 * lights the node it reaches in its own colour, waits, chooses somewhere else
 * to go, and carries on until it runs out of hops. What crosses the field is a
 * route being walked -- forking, doubling back, dying out in one corner while
 * another lights up.
 *
 * The waiting is what keeps the rhythm. Every traveller has its own speed and
 * pauses for its own length at each stop, so nothing fires on a beat and the
 * field never pulses in time with itself.
 *
 * Restraint is the other half of the design, and the harder half. This sits
 * under content: a mesh dense enough to notice is a mesh that competes with
 * the words on top of it, and content it obscures is a net loss however good it
 * looks. So the lattice is sparse, the resting links are barely drawn, and only
 * the few signals actually moving are allowed to be bright.
 *
 * It is decoration, and it says so. It is not a visualisation of the agent --
 * that would be a lie, because the agent is a language model and not a graph.
 * It is here for the impression a static page cannot give: that the screen is
 * attached to something working.
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
 * be RGB, a muddy brown where the accent should be. So the colour is painted
 * onto one pixel and read back through the canvas's own conversion, which is
 * the only one guaranteed to agree with what it draws.
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

/**
 * Deliberately not theme tokens. These read as something signalling rather
 * than as interface, and they have to stay apart from each other at two pixels
 * wide on a near-black ground, which the semantic palette is not built for.
 */
const NEON: readonly Rgb[] = [
  [64, 255, 170],
  [255, 78, 112],
  [255, 214, 64],
  [88, 214, 255],
  [178, 132, 255],
]

function rgba(colour: Rgb, alpha: number): string {
  const clamped = Math.min(Math.max(alpha, 0), 1)
  return `rgba(${String(colour[0])}, ${String(colour[1])}, ${String(colour[2])}, ${String(clamped)})`
}

interface Node {
  readonly x: number
  readonly y: number
  readonly neighbours: number[]
  /** 1 the instant a signal lands, decaying towards 0. */
  charge: number
  /** Whatever colour last arrived here. */
  colour: Rgb
}

interface Traveller {
  from: number
  to: number
  progress: number
  /** Seconds still to wait at the node it just reached. */
  waiting: number
  readonly speed: number
  readonly colour: Rgb
  hops: number
}

const REACH = 165
const LEAN = 7
/** Slow enough to follow with your eyes, with a long tail behind the head. */
const SLOWEST = 0.2
const FASTEST = 0.55
const TAIL = 0.5
const DECAY_PER_SECOND = 0.8
/** Few, on purpose. Traffic is what is allowed to be bright, so there is not
 *  much of it. */
const MOST_TRAVELLERS = 9
const FEWEST_TRAVELLERS = 4

function buildLattice(columns: number, rows: number, seed: number): Node[] {
  const random = createRandom(seed)
  const nodes: Node[] = []
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      nodes.push({
        x: (column + 0.5 + (random() - 0.5) * 0.8) / columns,
        y: (row + 0.5 + (random() - 0.5) * 0.8) / rows,
        neighbours: [],
        charge: 0,
        colour: NEON[3] ?? [88, 214, 255],
      })
    }
  }

  // Two nearest each. Three made a web; two makes a path, which is what a
  // traveller needs and all the eye should have to untangle.
  nodes.forEach((node, index) => {
    const ranked = nodes
      .map((other, otherIndex) => ({
        otherIndex,
        distance: Math.hypot(node.x - other.x, node.y - other.y),
      }))
      .filter((entry) => entry.otherIndex !== index)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 2)
    node.neighbours.push(...ranked.map((entry) => entry.otherIndex))
  })

  // A link is mutual: if A kept B, B can walk back to A, or a traveller can
  // arrive somewhere with nowhere to go.
  nodes.forEach((node, index) => {
    for (const neighbour of node.neighbours) {
      const other = nodes[neighbour]
      if (other !== undefined && !other.neighbours.includes(index)) {
        other.neighbours.push(index)
      }
    }
  })

  return nodes
}

export function NeuralField({
  className,
  columns = 6,
  rows = 3,
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
    const mesh = resolve(
      getComputedStyle(canvas).getPropertyValue('--primary').trim(),
      [108, 133, 255],
    )

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

    const travellers: Traveller[] = []

    const stepFrom = (node: Node, avoid: number): number | null => {
      const options = node.neighbours.filter((candidate) => candidate !== avoid)
      const pool = options.length > 0 ? options : node.neighbours
      return pool[Math.floor(random() * pool.length)] ?? null
    }

    const release = (): void => {
      if (travellers.length >= MOST_TRAVELLERS) return
      const from = Math.floor(random() * nodes.length)
      const node = nodes[from]
      if (node === undefined) return
      const to = stepFrom(node, -1)
      if (to === null) return
      travellers.push({
        from,
        to,
        progress: 0,
        waiting: random() * 2.2,
        speed: SLOWEST + random() * (FASTEST - SLOWEST),
        colour: NEON[Math.floor(random() * NEON.length)] ?? [88, 214, 255],
        // Long enough to read as a route rather than a blink.
        hops: 6 + Math.floor(random() * 10),
      })
    }
    for (let n = 0; n < FEWEST_TRAVELLERS + 2; n += 1) release()

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

      // The resting mesh: the road, not the traffic. Barely there until the
      // pointer is near it.
      context.lineWidth = 1
      for (const [index, node] of nodes.entries()) {
        const from = placed[index]
        if (from === undefined) continue
        for (const neighbour of node.neighbours) {
          if (neighbour <= index) continue
          const to = placed[neighbour]
          if (to === undefined) continue
          const lit = Math.max(from.close, to.close)
          context.strokeStyle = rgba(mesh, (0.06 + lit * 0.16) * power)
          context.beginPath()
          context.moveTo(from.x, from.y)
          context.lineTo(to.x, to.y)
          context.stroke()
        }
      }

      context.lineCap = 'round'
      for (let index = travellers.length - 1; index >= 0; index -= 1) {
        const traveller = travellers[index]
        if (traveller === undefined) continue

        if (traveller.waiting > 0) {
          traveller.waiting -= delta
          continue
        }

        traveller.progress += traveller.speed * delta

        const from = placed[traveller.from]
        const to = placed[traveller.to]
        if (from === undefined || to === undefined) {
          travellers.splice(index, 1)
          continue
        }

        if (traveller.progress >= 1) {
          const arrived = nodes[traveller.to]
          if (arrived === undefined) {
            travellers.splice(index, 1)
            continue
          }
          arrived.charge = 1
          arrived.colour = traveller.colour
          traveller.hops -= 1
          const next = traveller.hops <= 0 ? null : stepFrom(arrived, traveller.from)
          if (next === null) {
            travellers.splice(index, 1)
            continue
          }
          traveller.from = traveller.to
          traveller.to = next
          traveller.progress = 0
          traveller.waiting = 0.12 + random() * 0.9
          continue
        }

        const head = traveller.progress
        const tail = Math.max(0, head - TAIL)
        const hx = from.x + (to.x - from.x) * head
        const hy = from.y + (to.y - from.y) * head
        const tx = from.x + (to.x - from.x) * tail
        const ty = from.y + (to.y - from.y) * tail

        const gradient = context.createLinearGradient(tx, ty, hx, hy)
        gradient.addColorStop(0, rgba(traveller.colour, 0))
        gradient.addColorStop(1, rgba(traveller.colour, 0.6 * power))
        context.strokeStyle = gradient
        context.lineWidth = 1.7
        context.beginPath()
        context.moveTo(tx, ty)
        context.lineTo(hx, hy)
        context.stroke()

        context.fillStyle = rgba(traveller.colour, 0.8 * power)
        context.beginPath()
        context.arc(hx, hy, 1.6, 0, Math.PI * 2)
        context.fill()
      }
      context.lineWidth = 1

      // The nodes, wearing whatever colour last reached them.
      for (const [index, point] of placed.entries()) {
        const node = nodes[index]
        if (node === undefined) continue
        node.charge = Math.max(0, node.charge - DECAY_PER_SECOND * delta)
        const heat = node.charge

        if (heat > 0.02) {
          context.fillStyle = rgba(node.colour, heat * 0.12 * power)
          context.beginPath()
          context.arc(point.x, point.y, 4 + heat * 10, 0, Math.PI * 2)
          context.fill()
        }

        context.fillStyle = rgba(
          heat > 0.05 ? node.colour : mesh,
          (0.14 + heat * 0.5 + point.close * 0.25) * power,
        )
        context.beginPath()
        context.arc(point.x, point.y, 1.4 + heat * 1.8 + point.close * 1.6, 0, Math.PI * 2)
        context.fill()
      }

      // Keep a few routes in play, released at uneven moments.
      if (travellers.length < FEWEST_TRAVELLERS && random() < 0.04) release()
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
