# 2. Use cases described as data, executed through one registry

- Status: accepted
- Date: 2026-03-16

## Context

Three adapters need to know the same things about every operation the system
can perform: what it is called, what input it takes, who may call it, and how
dangerous it is. The UI renders a form and hides forbidden buttons. The MCP
server advertises a tool with a JSON Schema, filters `tools/list` by role, and
decides whether human approval is required. The eval suite asserts on which
tools were called.

Restating that in three places guarantees they eventually disagree, and the
disagreement will be silent. The dangerous version of the failure is specific:
the MCP server exposing as harmless something the domain considers
irreversible.

## Decision

Every operation is a `UseCaseSpec` -- a plain object carrying `name`, `title`,
`summary` (written for a language model), `capability`, `risk`, an
`inputSchema`, an `execute` function and, for destructive operations, a
`preview`.

`defineUseCase` wraps that spec and returns two views of it:

- the **typed** view, `USE_CASES.confirm_sales_order.execute({ orderId }, ctx)`,
  with full inference for application code;
- the **erased** view, `descriptor`, whose `run(rawInput: unknown, ctx)` parses
  the input with the zod schema before it can reach the body.

`packages/domain/src/use-cases/registry.ts` collects all 41 of them.
`DESCRIPTORS` is what the MCP server iterates; `descriptorsForRole(role)` is
what it advertises.

Two guards are structural rather than conventional:

1. **Authorisation.** `defineUseCase` wraps `execute` with the capability
   check. There is no path to a use case body that skips it -- a test proves a
   `sales` user is refused `adjust_stock` even when the tool list is bypassed.
2. **Validation.** The descriptor's `run` takes `unknown`. Input from a model
   cannot reach the domain without passing a schema.

## Consequences

- The permission matrix in the README is generated from the same table the
  runtime uses (`describePermissionMatrix()`), so it cannot be out of date.
- Adding an operation is one file plus one registry line; every adapter picks
  it up.
- `z.toJSONSchema` produces the tool schema, so the description the model sees
  is derived from the validator that will actually reject it. A test asserts
  every tool's schema is a plain object -- which is how the `.and()` in
  `report_sales_by_period` was caught producing an `allOf` with no top-level
  `"type"`.

## Alternatives considered

- **Classes with decorators.** Metadata via decorators reads well but needs
  `reflect-metadata`, complicates tree-shaking, and makes the registry magic
  rather than a list you can read.
- **Generating the registry from the filesystem.** Less to type, but the set of
  operations stops being greppable, and "which tools exist" becomes a runtime
  question instead of a compile-time one.
- **Declaring risk in the MCP server.** Rejected precisely because it puts the
  safety classification in the transport, where a second transport would have
  to remember to repeat it.
