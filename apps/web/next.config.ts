import type { NextConfig } from 'next'
import { fileURLToPath } from 'node:url'

const config: NextConfig = {
  reactStrictMode: true,
  // Produces .next/standalone: the server plus only the files it actually
  // needs, which is what the Docker image copies. Without the tracing root
  // Next would stop at apps/web and leave the workspace packages behind.
  output: 'standalone',
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
