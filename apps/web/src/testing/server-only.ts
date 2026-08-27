/**
 * Stands in for the `server-only` package under Vitest.
 *
 * That package exists to fail a build when server code is pulled into a client
 * bundle, which it does by throwing on import outside the `react-server`
 * condition. A test runner is outside it, so the real module would turn every
 * import of `server/context.ts` into a crash about a mistake nobody made.
 */
export {}
