import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['packages/*'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      // The domain is where the business rules live, so that is where the bar
      // is set. Adapters are covered by integration tests instead.
      include: ['packages/domain/src/**/*.ts'],
      exclude: [
        '**/index.ts',
        '**/*.test.ts',
        // Interfaces and type aliases only: they compile to an empty module.
        '**/ports/**',
        '**/kit/json.ts',
        // Test scaffolding, exercised by every test but not shipped.
        '**/testing/**',
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
      },
    },
  },
})
