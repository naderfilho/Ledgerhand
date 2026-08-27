/**
 * ---------------------------------------------------------------------------
 * A brain, from numbers
 * ---------------------------------------------------------------------------
 * No mesh is loaded and none is shipped. The shape is generated, which is why
 * the magic numbers below need explaining -- in three months they will look
 * arbitrary, and they are not.
 *
 * The build, in order:
 *
 *   1. Points spread evenly on a unit sphere by the Fibonacci spiral. Even is
 *      the whole point: random points clump, and clumps read as noise rather
 *      than as tissue.
 *
 *   2. The sphere is squashed to (1.00, 0.72, 0.84). A cerebrum is longer than
 *      it is tall and slightly narrower than it is long, and those three
 *      numbers are that sentence.
 *
 *   3. The profile is bent. The front (+x) is lifted and rounded, the back
 *      (-x) is pulled in and tapered, and a bulge is added low on the side for
 *      the temporal lobe. Seen from the side -- the angle this is almost always
 *      viewed from -- that trio is the difference between a brain and an egg.
 *
 *   4. Folding, as two octaves of value noise displacing each point along its
 *      own normal. The low octave makes lobes; the high one makes gyri. The
 *      amplitude stays near 5% of the radius, because past roughly 10% the
 *      silhouette stops reading as a brain and starts reading as a rock.
 *
 *   5. A medial fissure: points near the sagittal plane are pulled inward, so
 *      turning past the front shows two hemispheres instead of one loaf.
 *
 *   6. A cerebellum -- a second, smaller, more finely folded ellipsoid at the
 *      lower rear -- and a brainstem tapering down from it.
 *
 * Everything is seeded. The same seed gives the same brain on every machine
 * and every reload, which is what lets this render identically on the server
 * and the client, and is why `Math.random` is not used (nor available: the
 * lint forbids it).
 */

export interface BrainPoint {
  readonly x: number
  readonly y: number
  readonly z: number
  /** 0 at the back, 1 at the front. Drives the colour blend. */
  readonly along: number
  /** Cerebellum and stem are dimmer and finer than the cerebrum. */
  readonly region: 'cerebrum' | 'cerebellum' | 'stem'
}

export interface BrainEdge {
  readonly a: number
  readonly b: number
}

export interface BrainGeometry {
  readonly points: readonly BrainPoint[]
  readonly edges: readonly BrainEdge[]
  /** Outgoing edges per point, for propagating a pulse without searching. */
  readonly links: readonly (readonly number[])[]
}

/** Deterministic PRNG (mulberry32), the one the demo seed already uses. */
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
 * Value noise over a seeded lattice. Not Perlin: gradients would be smoother
 * and this is displacing a surface by five per cent, where the difference is
 * invisible and the extra table is not worth carrying.
 */
function createNoise(seed: number): (x: number, y: number, z: number) => number {
  const random = createRandom(seed)
  const SIZE = 64
  const lattice = new Float32Array(SIZE * SIZE * SIZE)
  for (let index = 0; index < lattice.length; index += 1) lattice[index] = random() * 2 - 1

  const at = (x: number, y: number, z: number): number => {
    const wrap = (value: number): number => ((value % SIZE) + SIZE) % SIZE
    return lattice[wrap(x) * SIZE * SIZE + wrap(y) * SIZE + wrap(z)] ?? 0
  }
  // Smoothstep between lattice corners, so folds have no visible facets.
  const ease = (t: number): number => t * t * (3 - 2 * t)
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

  return (x, y, z) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const zi = Math.floor(z)
    const tx = ease(x - xi)
    const ty = ease(y - yi)
    const tz = ease(z - zi)

    const c00 = lerp(at(xi, yi, zi), at(xi + 1, yi, zi), tx)
    const c10 = lerp(at(xi, yi + 1, zi), at(xi + 1, yi + 1, zi), tx)
    const c01 = lerp(at(xi, yi, zi + 1), at(xi + 1, yi, zi + 1), tx)
    const c11 = lerp(at(xi, yi + 1, zi + 1), at(xi + 1, yi + 1, zi + 1), tx)

    return lerp(lerp(c00, c10, ty), lerp(c01, c11, ty), tz)
  }
}

/** Evenly spread directions on the unit sphere. */
function fibonacciSphere(count: number, offset: number): { x: number; y: number; z: number }[] {
  const points: { x: number; y: number; z: number }[] = []
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let index = 0; index < count; index += 1) {
    const y = 1 - ((index + offset) / (count - 1 + 2 * offset)) * 2
    const radius = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = golden * index
    points.push({ x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius })
  }
  return points
}

/** Cerebrum proportions: long, low, and a little narrow. */
const SCALE = { x: 1.0, y: 0.72, z: 0.84 }
/** Folding: one octave for lobes, one for gyri, both kept subtle. */
const FOLD = { lowFrequency: 1.7, highFrequency: 4.6, lowAmount: 0.05, highAmount: 0.022 }

function shapeCerebrum(
  direction: { x: number; y: number; z: number },
  noise: (x: number, y: number, z: number) => number,
): BrainPoint {
  let x = direction.x * SCALE.x
  let y = direction.y * SCALE.y
  let z = direction.z * SCALE.z

  // 0 at the occipital end, 1 at the frontal end.
  const along = (direction.x + 1) / 2

  // The front is taller and rounder; the back tapers.
  const taper = 0.78 + 0.32 * along
  y *= taper
  z *= 0.86 + 0.28 * along
  // and the frontal pole lifts, which is most of the side-on silhouette.
  y += 0.06 * along * along

  // Temporal lobe: a bulge low on the flank, forward of centre.
  const lowAndForward = Math.max(0, -direction.y) * Math.max(0, direction.x + 0.25)
  const flank = Math.abs(direction.z)
  const temporal = lowAndForward * flank * 0.34
  y -= temporal * 0.5
  z += Math.sign(direction.z || 1) * temporal * 0.5

  // Folding, along the point's own normal, which for a deformed sphere is
  // close enough to the direction it came from.
  const low = noise(
    direction.x * FOLD.lowFrequency + 8,
    direction.y * FOLD.lowFrequency + 8,
    direction.z * FOLD.lowFrequency + 8,
  )
  const high = noise(
    direction.x * FOLD.highFrequency + 24,
    direction.y * FOLD.highFrequency + 24,
    direction.z * FOLD.highFrequency + 24,
  )
  const displacement = 1 + low * FOLD.lowAmount + high * FOLD.highAmount
  x *= displacement
  y *= displacement
  z *= displacement

  // The medial fissure: pull the midline in, so the hemispheres separate.
  const midline = 1 - Math.min(1, Math.abs(direction.z) / 0.28)
  z *= 1 - midline * 0.42
  y -= midline * 0.05

  return { x, y, z, along, region: 'cerebrum' }
}

function shapeCerebellum(
  direction: { x: number; y: number; z: number },
  noise: (x: number, y: number, z: number) => number,
): BrainPoint {
  // Smaller, rounder, tucked under the back of the cerebrum. Its folding is
  // finer and stronger, which is what tells it apart at a glance.
  const fine = noise(direction.x * 11 + 60, direction.y * 11 + 60, direction.z * 11 + 60)
  const swell = 1 + fine * 0.06
  return {
    x: -0.62 + direction.x * 0.3 * swell,
    y: -0.42 + direction.y * 0.21 * swell,
    z: direction.z * 0.3 * swell,
    along: 0.08,
    region: 'cerebellum',
  }
}

function shapeStem(index: number, count: number, random: () => number): BrainPoint {
  // A short tapered tube descending from under the cerebellum.
  const t = index / Math.max(1, count - 1)
  const radius = 0.11 * (1 - t * 0.55)
  const angle = t * Math.PI * 5 + random() * 0.4
  return {
    x: -0.56 + Math.cos(angle) * radius - t * 0.05,
    y: -0.56 - t * 0.42,
    z: Math.sin(angle) * radius,
    along: 0.04,
    region: 'stem',
  }
}

/**
 * Nearest neighbours through a uniform grid rather than by comparing every
 * pair. At 640 points the naive version is 400,000 distance checks at mount,
 * and there is no reason to pay for them.
 */
function connect(points: readonly BrainPoint[], k: number, cutoff: number): BrainEdge[] {
  const cell = cutoff
  const buckets = new Map<string, number[]>()
  const key = (x: number, y: number, z: number): string =>
    `${String(Math.floor(x / cell))}:${String(Math.floor(y / cell))}:${String(Math.floor(z / cell))}`

  points.forEach((point, index) => {
    const id = key(point.x, point.y, point.z)
    const bucket = buckets.get(id)
    if (bucket === undefined) buckets.set(id, [index])
    else bucket.push(index)
  })

  const seen = new Set<number>()
  const edges: BrainEdge[] = []

  points.forEach((point, index) => {
    const near: { index: number; distance: number }[] = []
    const cx = Math.floor(point.x / cell)
    const cy = Math.floor(point.y / cell)
    const cz = Math.floor(point.z / cell)

    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const bucket = buckets.get(`${String(cx + dx)}:${String(cy + dy)}:${String(cz + dz)}`)
          if (bucket === undefined) continue
          for (const other of bucket) {
            if (other === index) continue
            const candidate = points[other]
            if (candidate === undefined) continue
            const distance = Math.hypot(
              point.x - candidate.x,
              point.y - candidate.y,
              point.z - candidate.z,
            )
            // The cutoff is what stops the front of the head from joining the
            // back through the middle, which would fill the silhouette in.
            if (distance <= cutoff) near.push({ index: other, distance })
          }
        }
      }
    }

    near.sort((left, right) => left.distance - right.distance)
    for (const neighbour of near.slice(0, k)) {
      const low = Math.min(index, neighbour.index)
      const high = Math.max(index, neighbour.index)
      const pair = low * points.length + high
      if (seen.has(pair)) continue
      seen.add(pair)
      edges.push({ a: low, b: high })
    }
  })

  return edges
}

export function buildBrain(pointCount: number, seed: number): BrainGeometry {
  const noise = createNoise(seed)
  const random = createRandom(seed ^ 0x5eed)

  // Budgets: the cerebrum carries the silhouette, the other two are detail.
  const cerebellumCount = Math.max(24, Math.round(pointCount * 0.17))
  const stemCount = Math.max(12, Math.round(pointCount * 0.06))
  const cerebrumCount = Math.max(64, pointCount - cerebellumCount - stemCount)

  const points: BrainPoint[] = [
    ...fibonacciSphere(cerebrumCount, 0.5).map((direction) => shapeCerebrum(direction, noise)),
    ...fibonacciSphere(cerebellumCount, 0.5).map((direction) => shapeCerebellum(direction, noise)),
    ...Array.from({ length: stemCount }, (_, index) => shapeStem(index, stemCount, random)),
  ]

  // The cutoff scales with density: more points means closer neighbours, and a
  // fixed cutoff would web the whole thing together at high counts.
  const cutoff = 0.42 * Math.sqrt(520 / Math.max(64, pointCount))
  const edges = connect(points, 4, cutoff)

  const links: number[][] = points.map(() => [])
  for (const edge of edges) {
    links[edge.a]?.push(edge.b)
    links[edge.b]?.push(edge.a)
  }

  return { points, edges, links }
}
