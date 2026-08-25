import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
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
