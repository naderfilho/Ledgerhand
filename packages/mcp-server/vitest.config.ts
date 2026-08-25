import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  esbuild: { target: 'es2022' },
  resolve: {
    // The domain is read from source rather than from dist, so a test failure
    // points at the line that caused it and never at a stale build.
    alias: {
      '@ledgerhand/domain/testing': fileURLToPath(
        new URL('../domain/src/testing/index.ts', import.meta.url),
      ),
      '@ledgerhand/domain': fileURLToPath(new URL('../domain/src/index.ts', import.meta.url)),
    },
  },
  test: {
    name: 'mcp-server',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
