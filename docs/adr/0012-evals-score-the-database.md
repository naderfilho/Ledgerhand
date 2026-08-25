# 12. Evals score the database, not the answer

- Status: accepted
- Date: 2026-08-25

## Context

The thesis of this repository ends with "a measured success rate". A number
like that is easy to produce and easy to make meaningless. Two ways it usually
goes wrong:

- **The judge is a model.** A second model reads the transcript and decides
  whether the first one did well. It grades fluent answers highly, which is
  precisely the failure mode -- an agent that says "I have closed the cash
  session" and did not.
- **The number has no denominator.** "100% success" over one run of three happy
  paths says nothing about a system whose whole point is what happens when
  things are not happy.

There is also a question of what a failing suite should mean. A build that goes
red because a language model phrased something differently teaches people to
ignore the build.

## Decision

**Every check reads the business.** A scenario ends by looking at the database
and the event log: is there a purchase order, did stock move, is the cash
session closed, was anything recorded at all. The agent's summary is consulted
in exactly one place -- `mentions`, for scenarios that asked a question rather
than requested a change -- and even there it only checks that a figure the ERP
produced reached the reply.

**Scenarios come in two kinds, reported differently.**

- `guardrail`: the system must refuse, stop, or stay put. Pass or fail, and CI
  fails with them. A guardrail that holds four times out of five does not hold.
- `capability`: the agent has to get something done. Scored as a rate over k
  runs, with k printed next to it, because a language model is not a function.

Guardrail scenarios are written so the failure would be _plausible_: the
request is reasonable, and there is an obvious workaround nearby -- settle the
titles instead of asking, create an order because you cannot register a
payment, ship the goods by hand because the invoice was not approved. A
guardrail scenario with no available workaround measures nothing.

**The fixture is built through the domain and then forgotten.** The event log
is cleared after setup, so "changed nothing" means the agent changed nothing.

**Runs are hermetic.** The suite runs the real agent loop, a real MCP client
and server, and the real domain over in-memory storage with a pinned clock and
sequential ids. Every run starts from an identical state, so the only thing
that varies between run one and run three is the model.

**k=1 in CI, k=3 for the README.** One run per scenario is enough to catch a
broken guardrail on every push, and cheap enough to leave on. The rate quoted
in the README is measured over three.

## Consequences

- The scoring machinery is itself testable, and is tested: a scripted agent
  that claims to have closed the cash and did nothing must score zero, and one
  that finds a workaround must fail the guardrail. An eval suite that reports a
  pass because it never looked is worse than no suite.
- Adding a scenario is adding a fixture, a sentence and a list of checks.
- The suite needs an Anthropic key and costs real money to run; nothing else in
  the repository does. CI skips it, with a note, when the key is absent -- a
  contributor from a fork cannot fix a missing secret.
- Checks are coarse by design. "Ordered at least the shortfall from the right
  supplier" is not "wrote the ideal purchase order"; the suite measures
  outcomes it can defend, not craftsmanship.

## Alternatives considered

- **An LLM judge.** Cheap to write, and it grades the very thing that should
  not be trusted: the agent's account of itself. It would also make the number
  depend on two models rather than one.
- **Snapshot the transcript.** Brittle against wording, blind to effects.
- **One kind of scenario, one number.** It would either fail the build on model
  variance or let a broken guardrail hide inside an 80% average.
