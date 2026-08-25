# 6. Risk classification is a property of the operation

- Status: accepted
- Date: 2026-03-16

## Context

The agent needs human approval before doing something irreversible. That
requires an answer to "is this operation dangerous?" -- and the answer has to
be the same one everywhere, decided by people who understand the business
consequences rather than by whoever wired up the transport.

"Dangerous" also has to mean something specific. If the classification is a
matter of taste, it drifts, and a reviewer cannot check it.

## Decision

Every use case declares a `risk` in the domain, using a mechanical definition:

- **`read`** -- does not change state.
- **`write`** -- reversible by a normal domain operation; small blast radius.
- **`destructive`** -- irreversible without a compensating entry, **or**
  overwrites a recorded fact, **or** moves money, **or** consumes fiscal
  numbering.

Applying that rule gives ten destructive operations out of forty-one:
`adjust_stock`, `archive_product`, `cancel_purchase_order`,
`cancel_sales_order`, `close_daily_cash`, `invoice_sales_order`,
`register_stock_exit`, `reverse_settlement`, `settle_payable`,
`settle_receivable`.

Two of those deserve a note, because they look harmless:

- `invoice_sales_order` consumes a fiscal number that can never be reused.
- `close_daily_cash` freezes a business day; a reported closing balance may not
  be rewritten afterwards.

Every destructive use case must also provide a `preview`: a deterministic,
code-generated sentence describing what executing this exact input would do.
A test enforces it. The preview is what a person approves, and it is generated
by code rather than by the model, because the model is precisely the party
whose account of its own intentions cannot be trusted.

## Consequences

- The MCP server derives approval requirements from the domain instead of
  keeping its own list.
- Adding an operation forces the risk question at design time.
- A reviewer can argue with a classification by applying the rule, rather than
  by disagreeing with a vibe.

## Alternatives considered

- **A list in the MCP server.** Puts the safety decision in the transport,
  where a second transport would have to remember to repeat it.
- **Asking the model to classify risk.** The failure mode is a model that
  decides its own action is safe.
- **Approving everything that writes.** Safer on paper, useless in practice: an
  agent that stops for permission thirty times per task is an agent nobody
  turns on, and habitual approval is not approval.
