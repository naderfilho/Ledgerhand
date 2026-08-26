import type { NextConfig } from 'next'
import { fileURLToPath } from 'node:url'

const config: NextConfig = {
  reactStrictMode: true,
  // Produces .next/standalone: the server plus only the files it actually
  // needs, which is what the Docker image copies.
  //
  // Not on Vercel, though. There the platform traces the build itself and
  // packages each route as a function, and a standalone build hides the trace
  // it is looking for: the build fails on a missing next-server.js.nft.json,
  // which says nothing about the cause. One build output cannot be both, so
  // the target decides.
  ...(process.env['VERCEL'] === undefined ? { output: 'standalone' as const } : {}),
  // Either way tracing has to start at the workspace root, or it stops at
  // apps/web and leaves the workspace packages behind.
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  // The domain and database packages ship TypeScript sources; Next compiles
  // them alongside the app rather than requiring a build step during dev.
  transpilePackages: ['@ledgerhand/domain', '@ledgerhand/db'],
  typedRoutes: true,
  experimental: {
    // Server Actions receive form data from the browser; keeping the body
    // small is a cheap limit on what a hostile client can push through them.
    serverActions: { bodySizeLimit: '1mb' },
  },
}

export default config
