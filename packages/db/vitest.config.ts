import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  esbuild: { target: 'es2022' },
  resolve: {
    alias: {
      '@ledgerhand/domain/testing': fileURLToPath(
        new URL('../domain/src/testing/index.ts', import.meta.url),
      ),
      '@ledgerhand/domain': fileURLToPath(new URL('../domain/src/index.ts', import.meta.url)),
    },
  },
  test: {
    name: 'db',
    globalSetup: ['./src/integration/global-setup.ts'],
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Integration tests share one Postgres schema; running them in parallel
    // would have them truncate each other's fixtures.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
