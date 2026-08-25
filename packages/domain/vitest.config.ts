import { defineConfig } from 'vitest/config'

export default defineConfig({
  // BigInt literals and `**` need a modern target; the default is older than
  // the Node version this package supports.
  esbuild: { target: 'es2022' },
  test: {
    name: 'domain',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
