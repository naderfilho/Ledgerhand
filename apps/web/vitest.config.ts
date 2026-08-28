import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vitest/config'

const at = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

/**
 * What Next gives you for `import demo from './demo.svg'`, without Next.
 *
 * The dimensions are read from the file rather than invented, because a page
 * that forgot to set `width` and `height` on the image would still render in a
 * test told the numbers by a stub, and the missing attributes are precisely
 * what makes the layout jump while the image loads.
 */
function staticImages(): Plugin {
  return {
    name: 'ledgerhand:static-images',
    enforce: 'pre',
    load(id: string) {
      const path = id.split('?')[0] ?? id
      const name = path.split(/[\\/]/).at(-1) ?? 'image'
      const src = `/_next/static/media/${name}`

      if (path.endsWith('.svg')) {
        const svg = readFileSync(path, 'utf8')
        const number = (attribute: string): number =>
          Number(new RegExp(`${attribute}="([\\d.]+)"`).exec(svg)?.[1] ?? 0)
        return `export default ${JSON.stringify({
          src,
          width: Math.round(number('width')),
          height: Math.round(number('height')),
        })}`
      }

      if (path.endsWith('.png')) {
        // The IHDR chunk starts at byte 8; width and height are the two 32-bit
        // integers that open it. Read rather than assumed, for the same reason
        // the SVG's are: an image whose dimensions a test invented is an image
        // whose missing dimensions a test cannot catch.
        const png = readFileSync(path)
        return `export default ${JSON.stringify({
          src,
          width: png.readUInt32BE(16),
          height: png.readUInt32BE(20),
        })}`
      }

      return null
    },
  }
}

/**
 * ---------------------------------------------------------------------------
 * Tests for the web application
 * ---------------------------------------------------------------------------
 * There were none until the landing page arrived, and the reason was defensible
 * while every screen was a Server Component doing a database read: the domain
 * is where the rules are, and the only thing standing behind this directory was
 * the demo image in CI, which proves the application compiles and nothing about
 * what it does.
 *
 * The landing page changes that. It is the one page in this application with
 * no session, no database and no request-time work at all, which makes it the
 * one page that can be rendered in a test and asserted on -- and it is also the
 * page whose numbers must not drift from the artefacts they were measured
 * from. So the tests here cover exactly two things: the routing contract that
 * decides who is sent where, and the public page.
 */
export default defineConfig({
  plugins: [staticImages()],
  test: {
    name: 'web',
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  // `jsx: preserve` in tsconfig is what Next wants and what esbuild cannot
  // run. The tests need the transform done rather than deferred.
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': at('./src'),
      // The committed measurements, outside the application on purpose: they
      // are read by the README's own tooling as well as by this page, and a
      // file that lives inside `apps/web` would look like the page's private
      // copy of a number rather than the one everybody quotes.
      '@metrics': at('../../docs/metrics'),
      // A marker package whose whole job is to throw when it is imported from
      // somewhere that is not a Server Component. A test runner is exactly
      // that somewhere, and the guarantee it enforces is a bundler concern
      // rather than something worth reproducing here.
      'server-only': at('./src/testing/server-only.ts'),
    },
  },
})
