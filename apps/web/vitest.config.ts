import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const at = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

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
      // A marker package whose whole job is to throw when it is imported from
      // somewhere that is not a Server Component. A test runner is exactly
      // that somewhere, and the guarantee it enforces is a bundler concern
      // rather than something worth reproducing here.
      'server-only': at('./src/testing/server-only.ts'),
    },
  },
})
