# 10. Every use case knows how to present itself

- Status: accepted
- Date: 2026-08-25

## Context

Money is a `bigint` number of cents, a quantity is thousandths, a unit price is
millionths (ADR 0003). None of that survives `JSON.stringify`, and none of it
should ever reach a reader as a raw integer: `123450` is not `1234.50`, and a
language model that receives the first will reason with it.

Phase 2 solved this for the web application with a set of presenters in
`apps/web/src/server/present.ts`. Phase 3 needed the same conversion for the
MCP server and for the HTTP API, and a second implementation of "how to show a
receivable" is a second implementation that can disagree with the first.

There is also a structural version of the problem: an HTTP API cannot ask the
domain "what does this result look like as JSON?" if the answer lives in the
caller.

## Decision

The presenters move into `packages/domain/src/views`, and every use case
declares a `present` in its definition. It is required, not optional -- a use
case whose result cannot leave the process is not finished.

`descriptor.runJson` is therefore `run` followed by the use case's own
presenter, and it is what every remote caller uses. `descriptor.run` stays for
callers that want the typed result.

The views are type aliases rather than interfaces, against the house style,
because an interface has no implicit index signature and so cannot be assigned
to `JsonValue`. Being JSON is the entire purpose of the module, so the compiler
wins the argument.

Formatting for a locale deliberately stays out: `"1234.50"` is unambiguous
everywhere, and `"1.234,50"` is a decision for the layer that knows who is
reading.

## Consequences

- The number a model reads through a tool is the number on the screen, produced
  by the same function.
- The HTTP API can serialise any use case result without knowing which one it
  ran.
- `apps/web/src/server/present.ts` keeps only what is genuinely about this UI:
  which badge tone a status deserves.
- Adding a use case now requires answering "what does this look like to a
  reader?" at the same moment as "what does it do?".

## Alternatives considered

- **Presenters in the MCP server.** The duplication a reviewer notices, and the
  drift a reader eventually hits.
- **A generic serialiser that walks the result.** At runtime every branded
  bigint is just a bigint; the scale is not recoverable, so it would guess.
- **Returning cents and letting the model divide.** It would divide wrongly,
  and the failure would be silent and financial.
