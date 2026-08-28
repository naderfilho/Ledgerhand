/**
 * Turns `docs/brand/lhlogo.png` into the mark the site can actually use.
 *
 * ```sh
 * pnpm brand          # rewrites apps/web/src/assets/logo.png
 * pnpm brand:check    # fails if it is stale; verify runs this
 * ```
 *
 * The original is a 1254px square with the mark floating in the middle of an
 * opaque near-white field and no alpha channel at all. Dropped into the header
 * as it is, it is a white tile on the dark theme, and a quarter of a megabyte
 * to draw something 44 pixels wide.
 *
 * So the original is committed untouched -- it is the artwork, and artwork that
 * lives only on somebody's desktop is artwork that gets lost -- and this
 * derives the web copy from it: the background dropped to transparent, the
 * padding trimmed to the mark's own bounding box, and nothing else changed. The
 * two colours are the artwork's colours, not the theme's, because it is a logo
 * and not an icon.
 *
 * Written against `node:zlib` rather than an image library. A PNG of one flat
 * background and two flat inks is inflate, unfilter, threshold, refilter,
 * deflate -- and a dependency that pulls a native binary into this repository
 * to do that would cost more than it saves.
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { deflateSync, inflateSync } from 'node:zlib'

const at = (path: string): string => fileURLToPath(new URL(`../${path}`, import.meta.url))

const SOURCE = at('docs/brand/lhlogo.png')
const TARGET = at('apps/web/src/assets/logo.png')

/** How close to the corner colour a pixel must be to count as background. */
const BACKGROUND_TOLERANCE = 18
/** Breathing room kept around the mark, as a fraction of its longest side. */
const MARGIN = 0.06

interface Raster {
  readonly width: number
  readonly height: number
  /** RGBA, four bytes per pixel. */
  readonly pixels: Uint8Array
}

function chunks(png: Buffer): { readonly type: string; readonly data: Buffer }[] {
  const found: { type: string; data: Buffer }[] = []
  let offset = 8
  while (offset < png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.toString('ascii', offset + 4, offset + 8)
    found.push({ type, data: png.subarray(offset + 8, offset + 8 + length) })
    offset += length + 12
  }
  return found
}

/** Undoes the per-row filters PNG applies before compression. */
function decode(png: Buffer): Raster {
  const header = chunks(png).find((chunk) => chunk.type === 'IHDR')?.data
  if (header === undefined) throw new Error('the source PNG has no IHDR')
  const width = header.readUInt32BE(0)
  const height = header.readUInt32BE(4)
  const depth = header[8]
  const colour = header[9]
  const interlace = header[12]
  if (depth !== 8 || colour !== 2 || interlace !== 0) {
    throw new Error(
      `this reader handles 8-bit non-interlaced RGB only; got depth ${String(depth)}, colour type ${String(colour)}, interlace ${String(interlace)}`,
    )
  }

  const raw = inflateSync(
    Buffer.concat(
      chunks(png)
        .filter((chunk) => chunk.type === 'IDAT')
        .map((chunk) => chunk.data),
    ),
  )

  const channels = 3
  const stride = width * channels
  const pixels = new Uint8Array(width * height * 4)
  const previous = new Uint8Array(stride)
  const current = new Uint8Array(stride)

  for (let row = 0; row < height; row += 1) {
    const start = row * (stride + 1)
    const filter = raw[start]
    for (let index = 0; index < stride; index += 1) {
      const value = raw[start + 1 + index] ?? 0
      const left = index >= channels ? (current[index - channels] ?? 0) : 0
      const up = previous[index] ?? 0
      const upLeft = index >= channels ? (previous[index - channels] ?? 0) : 0
      let reconstructed: number
      switch (filter) {
        case 0:
          reconstructed = value
          break
        case 1:
          reconstructed = value + left
          break
        case 2:
          reconstructed = value + up
          break
        case 3:
          reconstructed = value + ((left + up) >> 1)
          break
        case 4: {
          const p = left + up - upLeft
          const dLeft = Math.abs(p - left)
          const dUp = Math.abs(p - up)
          const dUpLeft = Math.abs(p - upLeft)
          reconstructed =
            value + (dLeft <= dUp && dLeft <= dUpLeft ? left : dUp <= dUpLeft ? up : upLeft)
          break
        }
        case undefined:
        default:
          throw new Error(`unknown PNG row filter ${String(filter)}`)
      }
      current[index] = reconstructed & 0xff
    }

    for (let column = 0; column < width; column += 1) {
      const to = (row * width + column) * 4
      pixels[to] = current[column * 3] ?? 0
      pixels[to + 1] = current[column * 3 + 1] ?? 0
      pixels[to + 2] = current[column * 3 + 2] ?? 0
      pixels[to + 3] = 255
    }
    previous.set(current)
  }

  return { width, height, pixels }
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encode({ width, height, pixels }: Raster): Buffer {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let row = 0; row < height; row += 1) {
    raw[row * (stride + 1)] = 0
    Buffer.from(pixels.subarray(row * stride, (row + 1) * stride)).copy(raw, row * (stride + 1) + 1)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const source = decode(readFileSync(SOURCE))

/** The corner is background by definition: nothing is drawn there. */
const background = [source.pixels[0] ?? 0, source.pixels[1] ?? 0, source.pixels[2] ?? 0]
const isBackground = (index: number): boolean =>
  Math.abs((source.pixels[index] ?? 0) - (background[0] ?? 0)) <= BACKGROUND_TOLERANCE &&
  Math.abs((source.pixels[index + 1] ?? 0) - (background[1] ?? 0)) <= BACKGROUND_TOLERANCE &&
  Math.abs((source.pixels[index + 2] ?? 0) - (background[2] ?? 0)) <= BACKGROUND_TOLERANCE

let top = source.height
let left = source.width
let bottom = -1
let right = -1
for (let y = 0; y < source.height; y += 1) {
  for (let x = 0; x < source.width; x += 1) {
    if (isBackground((y * source.width + x) * 4)) continue
    if (y < top) top = y
    if (y > bottom) bottom = y
    if (x < left) left = x
    if (x > right) right = x
  }
}
if (bottom < 0) throw new Error('the source PNG is entirely background')

const margin = Math.round(Math.max(right - left, bottom - top) * MARGIN)
const x0 = Math.max(0, left - margin)
const y0 = Math.max(0, top - margin)
const x1 = Math.min(source.width - 1, right + margin)
const y1 = Math.min(source.height - 1, bottom + margin)

const width = x1 - x0 + 1
const height = y1 - y0 + 1
const pixels = new Uint8Array(width * height * 4)

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const from = ((y + y0) * source.width + (x + x0)) * 4
    const to = (y * width + x) * 4
    const r = source.pixels[from] ?? 0
    const g = source.pixels[from + 1] ?? 0
    const b = source.pixels[from + 2] ?? 0
    pixels[to] = r
    pixels[to + 1] = g
    pixels[to + 2] = b
    /**
     * Alpha from how far the pixel is from the background, so the anti-aliased
     * rim of every stroke fades out instead of turning into a white fringe --
     * which is what a hard threshold leaves behind, and it is visible against a
     * dark ground at any size.
     */
    const distance = Math.max(
      Math.abs(r - (background[0] ?? 0)),
      Math.abs(g - (background[1] ?? 0)),
      Math.abs(b - (background[2] ?? 0)),
    )
    pixels[to + 3] = Math.min(255, Math.round((distance / BACKGROUND_TOLERANCE) * 255))
  }
}

const produced = encode({ width, height, pixels })
const digest = (buffer: Buffer): string => createHash('sha256').update(buffer).digest('hex')

let existing: Buffer | null = null
try {
  existing = readFileSync(TARGET)
} catch {
  existing = null
}

const summary =
  `${String(source.width)}x${String(source.height)} -> ${String(width)}x${String(height)}, ` +
  `${String(Math.round(produced.length / 1024))}KB with alpha`

if (existing !== null && digest(existing) === digest(produced)) {
  console.log(`up to date: ${summary}`)
} else if (process.argv.includes('--check')) {
  console.error(`apps/web/src/assets/logo.png is stale: the source says ${summary}.`)
  console.error('Run `pnpm brand` and commit the result.')
  process.exit(1)
} else {
  writeFileSync(TARGET, produced)
  console.log(`written: ${summary}`)
}
