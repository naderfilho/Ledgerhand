# 8. Business dates and instants are different types

- Status: accepted
- Date: 2026-03-16

## Context

A payment taken at 21:00 in Sao Paulo is 00:00 the next day in UTC. If the cash
session stores a timestamp, that payment is counted on the wrong day, the
closing balance does not match what the cashier counted, and the person who
notices is an auditor.

The same distinction applies to due dates: a title falls due on a day, not at
an instant.

## Decision

Two types, and they do not mix.

- **`BusinessDate`** -- a branded `YYYY-MM-DD` string, the calendar date in the
  tenant's own timezone. Stored as Postgres `date`. Used for cash sessions, due
  dates, issue dates and report ranges.
- **`Date`** -- an instant. Stored as `timestamptz`. Used for `occurredAt`,
  `createdAt` and every other "when did this actually happen".

`businessDateIn(instant, timeZone)` is the only conversion, and it goes one
way. The tenant's timezone lives on the tenant row; the execution context
carries it, so a use case never has to guess.

The clock is injected: `ExecutionContext.now` rather than `new Date()` inside a
use case. ESLint forbids `new Date()`, `Date.now()` and `Math.random()` in
source, with one documented exception in the composition root that provides
them.

## Consequences

- `close_daily_cash` closes a day that means the same thing to the cashier, the
  report and the agent.
- Tests and eval scenarios pin the clock, so a scenario that ran on the 16th
  produces the same due dates when it runs again in June.
- The seed simulates ninety days by advancing an injected clock, which is why
  the demo database is reproducible from one command.
- Arithmetic on dates is explicit (`addDays`, `daysBetween`) instead of
  implicit millisecond maths, and both are property-tested for reversibility.

## Alternatives considered

- **Storing everything as `timestamptz` and converting on read.** Every report
  then needs a timezone argument, and forgetting it is silent.
- **A date library (Luxon, a Temporal polyfill).** More capable than needed.
  The three operations required here are twenty lines, and
  `Intl.DateTimeFormat` with `en-CA` already yields `YYYY-MM-DD` in any
  timezone.
- **Assuming UTC everywhere.** Correct only for a business that trades in UTC,
  which is none of them.
