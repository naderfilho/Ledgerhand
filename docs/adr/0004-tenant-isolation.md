# 4. Tenant isolation enforced by Postgres row level security

- Status: accepted
- Date: 2026-03-16

## Context

"Multi-tenant" is easy to claim and easy to get wrong. The common implementation
adds `WHERE tenant_id = $1` to every query and calls it isolation. It holds
until somebody writes one query without the clause -- a report, an admin
screen, a quick fix at the end of a Friday -- and then one customer sees
another customer's ledger.

This project has a second reason to care: an autonomous agent issues the
queries. If isolation lives in application code, the blast radius of a
prompt-injection or a logic error is every tenant in the database.

## Decision

Isolation is enforced by the database, and the application's filtering is a
second layer rather than the only one.

1. The application connects as **`ledgerhand_app`**: not the owner of the
   tables, and explicitly `NOBYPASSRLS`. Migrations and the seed connect as the
   owner and are never used by the running application.
2. Every business table has `ENABLE ROW LEVEL SECURITY` **and**
   `FORCE ROW LEVEL SECURITY`, so even the owner is subject to the policies.
3. The policy compares `tenant_id` against a transaction-local setting:

   ```sql
   USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
   ```

4. `withUnitOfWork` opens a transaction and issues
   `select set_config('app.tenant_id', $1, true)`. The `true` makes it
   transaction-local, so it dies with the transaction and cannot leak into
   whoever borrows the pooled connection next.
5. History is not merely append-only by convention: `UPDATE` and `DELETE` are
   revoked from the application role on `domain_events` and `stock_movements`,
   and `DELETE` on `settlements`.

### The `nullif` is not decoration

`current_setting('app.tenant_id', true)` returns NULL only until the setting
has been assigned once on that connection. After a transaction that used
`SET LOCAL` ends, Postgres resets it to the **empty string**, and `''::uuid`
raises `22P02`. On a pooled connection that turns the next unscoped query into
a 500 instead of an empty result. Wrapping it in `nullif` keeps the failure
closed _and_ quiet: the predicate evaluates to NULL, so no rows come back.

This was found by a test, not by reasoning, which is the argument for the test.

## Consequences

- A query that forgets its tenant filter returns nothing rather than
  everything.
- `packages/db/src/integration/row-level-security.test.ts` attacks the boundary
  from five directions, all as `ledgerhand_app`: through the repositories, by
  primary key, with raw SQL that has no tenant clause at all, with no tenant
  set, and by trying to insert a row belonging to another tenant. The raw-SQL
  case is the one that matters -- the others would pass even with no policies,
  because the repositories filter anyway.
- Signing in cannot know the tenant yet, so the credential lookup runs on a
  separate, narrowly scoped connection. Adding an "anyone may read users"
  policy would undo the isolation for the one table holding password hashes.
- Every write path must go through `withUnitOfWork`. That is a real constraint
  and an intended one.

## Alternatives considered

- **Application-level filtering only.** One forgotten clause is a breach, and
  nothing tells you it happened.
- **A schema per tenant.** Strong isolation, and migrations become an
  N-times-per-deploy problem with no good story for a shared report.
- **A database per tenant.** Right answer for enterprise customers with
  contractual isolation requirements; disproportionate for a system whose
  tenants are small businesses.
