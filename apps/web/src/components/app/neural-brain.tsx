'use client'

import * as React from 'react'
import { buildBrain, type BrainGeometry } from '@/lib/brain-geometry'
import { cn } from '@/lib/utils'

/**
 * ---------------------------------------------------------------------------
 * The agent, as a shape
 * ---------------------------------------------------------------------------
 * A low-poly brain: a generated point cloud joined by short edges, turning
 * slowly, with light travelling along the edges as discrete pulses. When a
 * pulse arrives somewhere it flares that node and may set off one or two more,
 * so what crosses the mesh is propagation rather than twinkling.
 *
 * Canvas 2D with a hand-rolled projection, on purpose. Everything here is
 * points, lines and radial gradients; a 3D library would cost hundreds of
 * kilobytes to draw what a rotation and a perspective divide already do.
 *
 * It exists to say which of six things the agent is doing, and the states have
 * to be told apart at a glance rather than read:
 *
 *   idle               slow turn, few pulses, dim mesh
 *   thinking           faster, pulses frequent, chaining hard
 *   calling-tool       a wavefront leaves the centre and crosses the mesh
 *   awaiting-approval  rotation stops, pulses freeze where they are, amber
 *   denied             one red flash, pulses retract, then back to idle
 *   exhausted          turning slows to nothing, pulses die out, mesh fades
 *
 * Everything is seeded, so the brain is the same shape on every load and on
 * every machine; the animation phase comes from the frame timestamp, never
 * from a clock. Both are house rules, and both are also what makes this
 * render identically on the server and the client.
 */

export type NeuralBrainState =
  'idle' | 'thinking' | 'calling-tool' | 'awaiting-approval' | 'denied' | 'exhausted'

type Rgb = readonly [number, number, number]

/**
 * Signal colours rather than theme tokens. These read as something firing, not
 * as interface, and they have to stay apart from each other at one pixel wide
 * on a near-black ground -- which the semantic palette is not built for. The
 * magenta is pulled back from the reference so it does not fight the indigo
 * every primary action in the application already uses.
 */
const CYAN: Rgb = [34, 211, 238]
const VIOLET: Rgb = [124, 58, 237]
const MAGENTA: Rgb = [216, 122, 240]
const EDGE: Rgb = [30, 127, 168]
const AMBER: Rgb = [245, 158, 11]
const RED: Rgb = [239, 68, 68]
const WHITE: Rgb = [255, 255, 255]

function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  const t = Math.min(Math.max(amount, 0), 1)
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function rgba(colour: Rgb, alpha: number): string {
  const clamped = Math.min(Math.max(alpha, 0), 1)
  return `rgba(${String(Math.round(colour[0]))}, ${String(Math.round(colour[1]))}, ${String(Math.round(colour[2]))}, ${String(clamped)})`
}

/** Back to front: cyan through violet into magenta, never two flat halves. */
function alongTheBrain(along: number): Rgb {
  return along < 0.5 ? mix(CYAN, VIOLET, along * 2) : mix(VIOLET, MAGENTA, (along - 0.5) * 2)
}

interface Mood {
  readonly spin: number
  readonly spawn: number
  readonly chain: number
  readonly meshAlpha: number
  readonly nodeAlpha: number
  /** Blended over the whole cloud: amber while waiting, red when denied. */
  readonly wash: Rgb | null
  readonly washAmount: number
  readonly frozen: boolean
}

const MOODS: Readonly<Record<NeuralBrainState, Mood>> = {
  idle: {
    spin: 0.08,
    spawn: 0.5,
    chain: 0.3,
    meshAlpha: 0.16,
    nodeAlpha: 0.5,
    wash: null,
    washAmount: 0,
    frozen: false,
  },
  thinking: {
    spin: 0.19,
    spawn: 4.5,
    chain: 0.72,
    meshAlpha: 0.24,
    nodeAlpha: 0.75,
    wash: null,
    washAmount: 0,
    frozen: false,
  },
  'calling-tool': {
    spin: 0.15,
    spawn: 2,
    chain: 0.5,
    meshAlpha: 0.3,
    nodeAlpha: 0.85,
    wash: null,
    washAmount: 0,
    frozen: false,
  },
  'awaiting-approval': {
    spin: 0,
    spawn: 0,
    chain: 0,
    meshAlpha: 0.22,
    nodeAlpha: 0.7,
    wash: AMBER,
    washAmount: 0.8,
    frozen: true,
  },
  denied: {
    spin: 0.05,
    spawn: 0,
    chain: 0,
    meshAlpha: 0.26,
    nodeAlpha: 0.8,
    wash: RED,
    washAmount: 0.85,
    frozen: false,
  },
  exhausted: {
    spin: 0.01,
    spawn: 0,
    chain: 0,
    meshAlpha: 0.05,
    nodeAlpha: 0.14,
    wash: null,
    washAmount: 0,
    frozen: false,
  },
}

interface Pulse {
  active: boolean
  from: number
  to: number
  progress: number
  speed: number
  /** Runs backwards to its origin when a run is denied. */
  retreating: boolean
}

const MAX_PULSES = 120
/** Transitions cross in roughly this long, so nothing snaps. */
const BLEND_MS = 400
const TILT = 0.28

/** Deterministic PRNG (mulberry32), as everywhere else in this repository. */
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

/**
 * One radial sprite per size, drawn once. A fresh gradient per node per frame
 * is the single most expensive mistake available here: six hundred of them,
 * sixty times a second.
 */
function makeGlow(radius: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const size = radius * 2
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context !== null) {
    const gradient = context.createRadialGradient(radius, radius, 0, radius, radius, radius)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.45)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  }
  return canvas
}

export function NeuralBrain({
  state = 'idle',
  size = 480,
  pointCount = 520,
  seed = 20_260_826,
  className,
}: {
  readonly state?: NeuralBrainState
  readonly size?: number
  readonly pointCount?: number
  readonly seed?: number
  readonly className?: string
}): React.JSX.Element {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const stateRef = React.useRef<NeuralBrainState>(state)
  const previousStateRef = React.useRef<NeuralBrainState>(state)
  const changedAtRef = React.useRef(0)

  // The geometry is expensive and never changes, so it is built once.
  const geometry = React.useMemo<BrainGeometry>(
    () => buildBrain(pointCount, seed),
    [pointCount, seed],
  )

  React.useEffect(() => {
    if (stateRef.current === state) return
    previousStateRef.current = stateRef.current
    stateRef.current = state
    changedAtRef.current = -1
  }, [state])

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return undefined
    const context = canvas.getContext('2d')
    if (context === null) return undefined

    const random = createRandom(seed ^ 0xa11ce)
    const { points, edges, links } = geometry

    const glows = [makeGlow(6), makeGlow(10), makeGlow(16)]
    const projected = points.map(() => ({ x: 0, y: 0, depth: 0, scale: 1 }))
    const charge = new Float32Array(points.length)
    const pulses: Pulse[] = Array.from({ length: MAX_PULSES }, () => ({
      active: false,
      from: 0,
      to: 0,
      progress: 0,
      speed: 1,
      retreating: false,
    }))

    let width = size
    let height = size
    // Assigning canvas.width clears the bitmap, so every resize has to be
    // followed by a frame. Without this a paused loop -- a hidden tab, a canvas
    // scrolled out of view -- leaves the element blank until it resumes, and
    // the ResizeObserver fires once immediately after mount.
    let repaint: (() => void) | null = null
    const resize = (): void => {
      const ratio = Math.min(2, window.devicePixelRatio || 1)
      const rect = canvas.getBoundingClientRect()
      width = rect.width || size
      height = rect.height || size
      canvas.width = Math.max(1, Math.round(width * ratio))
      canvas.height = Math.max(1, Math.round(height * ratio))
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      repaint?.()
    }
    resize()
    const sizeObserver = new ResizeObserver(resize)
    sizeObserver.observe(canvas)

    // Off-screen or in a hidden tab, this should cost nothing at all.
    let onScreen = true
    const visibility = new IntersectionObserver((entries) => {
      onScreen = entries[0]?.isIntersecting ?? true
    })
    visibility.observe(canvas)
    let tabVisible = !document.hidden
    const onVisibility = (): void => {
      tabVisible = !document.hidden
    }
    document.addEventListener('visibilitychange', onVisibility)

    const spawn = (from: number, retreating = false): void => {
      const outgoing = links[from]
      if (outgoing === undefined || outgoing.length === 0) return
      const slot = pulses.find((pulse) => !pulse.active)
      if (slot === undefined) return
      const to = outgoing[Math.floor(random() * outgoing.length)]
      if (to === undefined) return
      slot.active = true
      slot.from = from
      slot.to = to
      slot.progress = retreating ? 1 : 0
      slot.speed = 0.7 + random() * 1.1
      slot.retreating = retreating
    }

    const still = window.matchMedia('(prefers-reduced-motion: reduce)')

    let angle = 0
    let previousTime = 0
    /** Distance the calling-tool wavefront has travelled from the centre. */
    let wavefront = -1

    const draw = (now: number): void => {
      const seconds = now / 1000
      const delta = previousTime === 0 ? 0.016 : Math.min(seconds - previousTime, 0.05)
      previousTime = seconds

      if (changedAtRef.current === -1) {
        changedAtRef.current = now
        if (stateRef.current === 'calling-tool') wavefront = 0
        if (stateRef.current === 'denied') {
          for (const pulse of pulses) if (pulse.active) pulse.retreating = true
        }
      }

      // Moods cross rather than switch, so no value ever jumps.
      const blend = Math.min(1, (now - changedAtRef.current) / BLEND_MS)
      const from = MOODS[previousStateRef.current]
      const to = MOODS[stateRef.current]
      const lerp = (a: number, b: number): number => a + (b - a) * blend
      const mood: Mood = {
        spin: lerp(from.spin, to.spin),
        spawn: lerp(from.spawn, to.spawn),
        chain: lerp(from.chain, to.chain),
        meshAlpha: lerp(from.meshAlpha, to.meshAlpha),
        nodeAlpha: lerp(from.nodeAlpha, to.nodeAlpha),
        wash: to.wash ?? from.wash,
        washAmount: lerp(
          from.wash === null ? 0 : from.washAmount,
          to.wash === null ? 0 : to.washAmount,
        ),
        frozen: to.frozen,
      }

      angle += mood.spin * delta
      context.clearRect(0, 0, width, height)

      // Project once per frame into the cached array.
      const cx = width / 2
      const cy = height / 2
      const radius = Math.min(width, height) * 0.36
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      const cosTilt = Math.cos(TILT)
      const sinTilt = Math.sin(TILT)

      for (let index = 0; index < points.length; index += 1) {
        const point = points[index]
        const slot = projected[index]
        if (point === undefined || slot === undefined) continue
        const rx = point.x * cos + point.z * sin
        const rz = point.z * cos - point.x * sin
        const ry = point.y * cosTilt - rz * sinTilt
        const rz2 = rz * cosTilt + point.y * sinTilt
        // Perspective divide. 3.2 is far enough that the near side does not
        // balloon and close enough that there is depth at all.
        const perspective = 3.2 / (3.2 - rz2)
        slot.x = cx + rx * radius * perspective
        slot.y = cy - ry * radius * perspective
        slot.depth = rz2
        slot.scale = perspective
      }

      context.globalCompositeOperation = 'lighter'

      // Edges, dimmest and first.
      context.lineWidth = 1
      for (const edge of edges) {
        const a = projected[edge.a]
        const b = projected[edge.b]
        const pa = points[edge.a]
        if (a === undefined || b === undefined || pa === undefined) continue
        // Depth cue: the far side recedes rather than crowding the near side.
        const nearness = (a.depth + b.depth) / 2
        const fade = 0.45 + 0.55 * ((nearness + 1) / 2)
        let colour = EDGE
        if (mood.wash !== null) colour = mix(colour, mood.wash, mood.washAmount)
        context.strokeStyle = rgba(colour, mood.meshAlpha * fade)
        context.beginPath()
        context.moveTo(a.x, a.y)
        context.lineTo(b.x, b.y)
        context.stroke()
      }

      // The calling-tool wavefront: a ring leaving the centre, lighting what
      // it passes, which is what makes a tool call look like it went somewhere.
      if (wavefront >= 0) {
        wavefront += delta * 1.6
        for (let index = 0; index < points.length; index += 1) {
          const point = points[index]
          if (point === undefined) continue
          const distance = Math.hypot(point.x, point.y, point.z)
          if (Math.abs(distance - wavefront) < 0.09) charge[index] = 1
        }
        if (wavefront > 1.6) wavefront = -1
      }

      // Pulses.
      if (!mood.frozen && mood.spawn > 0 && random() < mood.spawn * delta) {
        spawn(Math.floor(random() * points.length))
      }
      for (const pulse of pulses) {
        if (!pulse.active) continue
        const a = projected[pulse.from]
        const b = projected[pulse.to]
        if (a === undefined || b === undefined) {
          pulse.active = false
          continue
        }

        if (!mood.frozen) {
          pulse.progress += (pulse.retreating ? -1 : 1) * pulse.speed * delta
        }

        if (pulse.retreating && pulse.progress <= 0) {
          pulse.active = false
          continue
        }
        if (!pulse.retreating && pulse.progress >= 1) {
          charge[pulse.to] = 1
          pulse.active = false
          if (random() < mood.chain) spawn(pulse.to)
          if (random() < mood.chain * 0.4) spawn(pulse.to)
          continue
        }

        const head = Math.min(Math.max(pulse.progress, 0), 1)
        const point = points[pulse.to]
        let colour = point === undefined ? CYAN : alongTheBrain(point.along)
        if (mood.wash !== null) colour = mix(colour, mood.wash, mood.washAmount)
        // Frozen pulses breathe on the spot rather than sitting dead.
        const breath = mood.frozen ? 0.55 + Math.sin(seconds * 3) * 0.3 : 1

        // A short trail behind the head, which is what makes it read as motion
        // in a still frame as well as in a moving one.
        for (let step = 0; step < 3; step += 1) {
          const at = Math.max(0, head - step * 0.09)
          const x = a.x + (b.x - a.x) * at
          const y = a.y + (b.y - a.y) * at
          const alpha = (step === 0 ? 0.95 : 0.4 / step) * breath
          context.fillStyle = rgba(step === 0 ? WHITE : colour, alpha)
          context.beginPath()
          context.arc(x, y, step === 0 ? 1.7 : 1.2, 0, Math.PI * 2)
          context.fill()
        }
      }

      // Nodes last, brightest, with the glow sprite scaled by charge.
      for (let index = 0; index < points.length; index += 1) {
        const point = points[index]
        const slot = projected[index]
        if (point === undefined || slot === undefined) continue

        charge[index] = Math.max(0, (charge[index] ?? 0) - delta * 1.6)
        const heat = charge[index] ?? 0
        const fade = 0.4 + 0.6 * ((slot.depth + 1) / 2)
        const quiet = point.region === 'cerebrum' ? 1 : 0.75

        let colour = alongTheBrain(point.along)
        if (heat > 0) colour = mix(colour, WHITE, heat * 0.8)
        if (mood.wash !== null) colour = mix(colour, mood.wash, mood.washAmount)

        const alpha = mood.nodeAlpha * fade * quiet * (0.55 + heat * 0.45)
        if (heat > 0.05) {
          const glow = glows[heat > 0.6 ? 2 : 1]
          if (glow !== undefined) {
            const drawn = glow.width * (0.7 + heat * 0.9) * slot.scale
            context.globalAlpha = heat * 0.5
            context.drawImage(glow, slot.x - drawn / 2, slot.y - drawn / 2, drawn, drawn)
            context.globalAlpha = 1
          }
        }
        context.fillStyle = rgba(colour, alpha)
        context.beginPath()
        context.arc(slot.x, slot.y, (1 + heat * 1.6) * slot.scale, 0, Math.PI * 2)
        context.fill()
      }

      context.globalCompositeOperation = 'source-over'
    }

    repaint = () => {
      draw(performance.now())
    }

    let frame = 0
    if (still.matches) {
      // One frame, no rotation and no pulses. The state still reads, because
      // the wash and the mesh alpha are colour rather than movement.
      changedAtRef.current = 0
      draw(BLEND_MS)
    } else {
      // One frame immediately, whatever the tab is doing. requestAnimationFrame
      // never fires in a hidden tab, so a page opened in the background would
      // otherwise hold a blank canvas until somebody looked at it.
      changedAtRef.current = 0
      draw(performance.now())
      previousTime = 0

      const loop = (now: number): void => {
        if (onScreen && tabVisible) draw(now)
        else previousTime = now / 1000
        frame = window.requestAnimationFrame(loop)
      }
      frame = window.requestAnimationFrame(loop)
    }

    return () => {
      window.cancelAnimationFrame(frame)
      sizeObserver.disconnect()
      visibility.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [geometry, seed, size])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={cn('block max-w-full', className)}
    />
  )
}
