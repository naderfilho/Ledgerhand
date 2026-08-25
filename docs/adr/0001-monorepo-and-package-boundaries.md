# 1. Monorepo and package boundaries

- Status: accepted
- Date: 2026-03-16

## Context

Ledgerhand is three products that share one model of a business: an ERP, an MCP
server that exposes the ERP's operations as tools, and an agent that drives
those tools. If the three drift apart, the project's whole claim -- that an
agent can operate a real system safely -- stops being demonstrable, because the
agent would be operating something the UI does not.

They also have genuinely different runtimes. The ERP is a Next.js application.
The MCP server is a long-lived Node process speaking stdio or Streamable HTTP.
The eval suite is a batch job that needs an ephemeral database and an API key.

## Decision

One pnpm workspace, six packages, one direction of dependency:

```
apps/web ──┐
           ├──> packages/domain <── packages/db
packages/mcp-server ──┘                  ▲
           ▲                             │
packages/agent ──> (MCP protocol only)   │
           ▲                             │
packages/evals ──────────────────────────┘
```

- `packages/domain` depends on nothing but `zod`. No database, no framework.
- `packages/db` implements the domain's ports against Postgres.
- `packages/mcp-server` and `apps/web` are adapters over the same use cases.
- `packages/agent` may not import `@ledgerhand/db` at all. It reaches the ERP
  through MCP, which is what makes "the agent never holds database
  credentials" a fact about the dependency graph rather than a promise.

The boundaries are linted, not merely documented: `tooling/eslint-config`
declares `no-restricted-imports` groups for `packages/domain` (no
infrastructure) and `packages/agent` (no database). Violating the architecture
fails CI.

## Consequences

- A single `pnpm install` and a single `pnpm verify` cover everything.
- Shared types cross package boundaries without a publish step.
- Each package builds with `tsc -b tsconfig.build.json` and type-checks a wider
  `tsconfig.json` that also covers its tests -- the tests are held to the same
  strictness as the code they test, which caught several real type errors that
  a tests-excluded setup would have hidden.
- The cost is TypeScript project references and two tsconfigs per package.
  Worth it: without them, `noUnusedLocals` and `exactOptionalPropertyTypes`
  would never have been applied to the test suite.

## Alternatives considered

- **A single package.** Simpler to start, but nothing would stop the domain
  from importing Drizzle, and the agent's isolation from the database would be
  unenforceable.
- **Separate repositories.** Realistic for a company, wrong for a portfolio:
  a reviewer would have to clone four repositories to read one idea.
- **Nx or Turborepo.** Both earn their keep at a scale this project does not
  have. `pnpm -r` and `tsc -b` do the same job here with no extra concepts.
