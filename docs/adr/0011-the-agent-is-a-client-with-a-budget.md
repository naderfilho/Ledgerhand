# 11. The agent is an MCP client with a budget

- Status: accepted
- Date: 2026-08-25

## Context

The agent is the part of this repository that most invites hand-waving. It is
easy to write one that works on a good day: give a model the tools, tell it to
be careful, and watch it close the cash. What that produces is a demo whose
safety story is a paragraph in a prompt.

Three questions had to be answered in code instead:

- What stops a run that goes wrong -- loops, spends, or simply never finishes?
- Who confirms something irreversible, and what exactly do they see?
- Afterwards, how does anyone find out what a particular run changed?

## Decision

**The agent is an MCP client and nothing else.** It has no database driver, no
domain import, no table. ESLint forbids `@ledgerhand/db` and Drizzle in
`packages/agent`, so "the agent never holds database credentials" is a property
of the dependency graph. Its permissions are whatever role the ERP resolves for
the user the run acts for -- `MCP_USER_EMAIL=readonly@...` produces an agent
that cannot write, without a line of agent code changing.

**Five limits, enforced between steps** (`budget.ts`): tool calls, input
tokens, output tokens, dollars, wall clock. Any one ends the run with
`budget-exhausted`. They are checked between steps rather than predicted before
them, so a run overshoots by at most the step that broke the limit -- guessing
the size of a tool result that has not happened yet would put a guess inside
the safety mechanism. Cost is computed from a list-price table that ignores
promotional rates and prices an unknown model at the most expensive known rate:
a budget that stops counting is worse than one that overestimates.

**Approval is a protocol round trip, not a prompt instruction.** The ERP
refuses a destructive tool until a person confirms, and asks over MCP
elicitation. The agent carries the question to an `Approver` and the answer
back. It does not decide what needs approving (ADR 0006 did) and it does not
write the description (the domain generates it from the arguments), so the
party whose account of its own intentions cannot be trusted is not the party
describing the operation. Unattended runs default to refusing.

**Every call names its run.** The agent mints a run id and puts it in the tool
call's `_meta`; the MCP server turns it into an agent actor for that
transaction, and the ERP stamps it on every event the call records. "Everything
this run changed" is one query on `domain_events`, and the user the agent
borrowed stays on the row next to it. The id is an assertion, not a credential:
it says which of its own runs an authenticated identity is performing, and a
caller can only ever mislabel itself.

**The transcript records requests, not effects.** What the agent asked for,
what it was told, what was approved. What actually changed is in the ERP's
event log, joined by the run id -- because a transcript is written by the party
whose self-report should not be the last word.

## Consequences

- The whole loop is testable without a network or an API key: a scripted model,
  a real MCP client and server over an in-memory pipe, and the real domain over
  in-memory storage. The cases worth pinning down -- asking for something
  forbidden, looping, trying to proceed after a refused approval -- can be
  provoked on demand, which a real model cannot.
- Phase 5 scores runs from the transcripts, and can join them to the events.
- An agent run costs a round trip per tool call in the HTTP configuration. That
  is what a real boundary costs.
- There is no `agent_runs` table. The run id lives on the events and in the
  transcript file; a table would add a migration and a use case for something
  no reader has asked for yet. The seam is the run id itself.

## Alternatives considered

- **The SDK tool runner.** It drives the loop for tools you define at compile
  time; these arrive at runtime from the ERP, filtered by role. Owning the loop
  is also what makes the budget check between steps possible.
- **A prompt-level guardrail** ("always ask before doing anything
  irreversible"). A request, not a mechanism, and unfalsifiable in review.
- **Letting the agent hold its own permission list.** Two sources of truth for
  authorisation, one of them in the process being guarded.
- **Approving inside the ERP UI instead of over MCP.** A better product, and a
  worse demonstration: the confirmation would happen out of band, where the
  protocol cannot show it happening.
