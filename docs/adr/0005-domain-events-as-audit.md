# 5. Domain events written in the same transaction as the change

- Status: accepted
- Date: 2026-03-16

## Context

The project's central claim is that an agent operating a business system is
only acceptable if everything it did can be reconstructed afterwards. That
needs a record which cannot disagree with the data, and which links a stock
movement back to the run that caused it.

A log written after the commit can be lost. A log written before it can
describe something that never happened. An audit trail assembled by diffing
tables tells you what changed but not why.

## Decision

Use cases record facts; the unit of work persists them inside the same
transaction as the state change.

- `context.uow.events.record(domainEvent(type, aggregateType, id, payload))`
  appends to an in-memory list.
- `withUnitOfWork` flushes that list into `domain_events` before the commit.
- The row carries `actor_kind`, `actor_id` and, when an agent was acting,
  `agent_run_id`.

Payloads are JSON with decimals as strings, so an event survives a round trip
through any consumer without a `bigint` dying in `JSON.stringify`. Event types
are a closed union (`DomainEventPayloads`), so a payload shape is checked at
compile time and a new event has to be named before it can be emitted.

`UPDATE` and `DELETE` on `domain_events` are revoked from the application role.

## Consequences

- The log and the tables commit or roll back together. A test asserts exactly
  this: a handler that throws after a successful write leaves no product and no
  event behind.
- The ERP's audit screen, the agent's run history and the eval suite's
  state-diff assertions all read the same table.
- `agent_run_id` makes the interesting question answerable in one query: what
  did the agent change yesterday, and which instruction caused it?
- Events are append-only, so a correction is a new event. Nothing is ever
  rewritten to look tidier than it was.

## Alternatives considered

- **Event sourcing proper**, with state rebuilt by replay. A much larger
  commitment, and it would make the ERP harder to read for a reviewer without
  making the agent any safer.
- **Postgres triggers writing an audit table.** Captures row changes reliably
  and loses intent: `sales_order.confirmed` is a business fact,
  `UPDATE sales_orders SET status` is not.
- **Application logs.** Unstructured, unqueryable, and not transactional.
