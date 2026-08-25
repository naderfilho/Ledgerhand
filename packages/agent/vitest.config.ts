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
      '@ledgerhand/mcp-server': fileURLToPath(
        new URL('../mcp-server/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    name: 'agent',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
