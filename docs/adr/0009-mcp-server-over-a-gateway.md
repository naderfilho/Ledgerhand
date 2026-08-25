# 9. The MCP server reaches the ERP through a gateway

- Status: accepted
- Date: 2026-08-25

## Context

The MCP server exposes the ERP's use cases as tools. The obvious
implementation calls the domain directly, opens its own transaction and holds
its own database credentials. It is also the implementation that makes the
central claim of this repository unverifiable: if the process that speaks to
the language model is the same process that can write to `settlements`, then
"the agent only reaches the ERP through tools" is a statement about discipline,
not about the system.

Two other things had to be decided here rather than left to each transport:
what happens when a client retries a call it is not sure about, and what
happens before an irreversible operation runs.

## Decision

**One port, two adapters.** `UseCaseGateway` is the only thing the server knows
about the ERP: `identity`, `tools`, `call`, `preview`. Everything crossing it
is JSON.

- `inProcessGateway` calls the domain inside a transaction. Fast and
  deterministic; this is what development and the eval suite use.
- `httpGateway` calls the ERP's own API (`/api/erp/*` in `apps/web`) with a
  bearer token. The MCP server then has no database URL at all, and the trust
  boundary in the README is a process boundary.

ESLint enforces the separation: outside `src/runtime` and `src/bin`, nothing in
`packages/mcp-server` may import `@ledgerhand/db` or Drizzle.

**The token names a user; the ERP decides the role.** `ERP_API_TOKENS` maps a
token to an email. Tenant and role are read from that user's row on every
request. A caller cannot ask to be an administrator.

**Tools are published with the domain's own JSON Schema.** The server is built
on the SDK's low-level `Server` rather than `McpServer`, because the high-level
API converts the zod schema itself and that conversion cannot represent the
cross-field rules several inputs carry ("from must not be after to", "give me
an id or a number"). Publishing a schema that is not the schema doing the
rejecting is the exact drift this repository exists to avoid.

**`tools/list` is filtered by role, and `tools/call` checks the same list
again.** A name that is not on it is refused with one message whether it is
forbidden or invented, so a client cannot enumerate what it is not allowed to
see. The ERP then checks the capability a third time, because the MCP process
is not the authority on authorisation -- the domain is.

**Every write takes an `idempotency_key`.** The record is written in the same
transaction as the effect, so no crash can separate them. A repeat with the
same key returns the stored response; the same key with different arguments is
an error. Reads ignore the key: replaying a read would answer with a stale
number. Only successes are recorded, so a caller may correct a rejected input
and try again with the same key.

**Destructive tools stop for a person, over MCP elicitation.** The confirmation
carries `preview` -- the sentence the domain generates from the arguments,
never the model's account of its own intentions. A client that does not support
elicitation gets destructive tools refused rather than allowed: failing closed
is the only safe default when the human cannot be reached. `MCP_APPROVAL=auto`
exists for the eval suite, warns on startup, and is not a deployment mode.

## Consequences

- The whole tool surface is testable against the in-memory domain harness, with
  a real MCP client over an in-memory transport and no database.
- Adding a use case adds a tool, with its schema, its risk and its approval
  requirement, with no edit here.
- The HTTP adapter costs a round trip per call. That is the price of the
  boundary being real, and it is paid only in the demo configuration.
- Two deployments have to be documented and kept working instead of one.

## Alternatives considered

- **Direct domain access from the MCP server.** Simpler, and it makes the
  security story a promise rather than a property.
- **`McpServer` with the zod schemas.** Less code, but the schema the model
  sees stops being the schema that validates, and several tools would fail to
  publish at all.
- **Idempotency in the transport.** It would have to be written once per
  transport, and the record could not share the transaction with the effect.
- **Approval as a prompt instruction.** "Ask before doing anything
  irreversible" is a request; the gate is a mechanism.
