# 7. The fiscal document is simulated, and the seam is real

- Status: accepted
- Date: 2026-03-16

## Context

Invoicing in Brazil means issuing an NF-e: an XML document signed with an A1 or
A3 certificate, transmitted to SEFAZ, authorised asynchronously, and legally
binding. Implementing it properly is weeks of certificate handling, schema
versions and per-state endpoints.

None of that would teach a reader anything about this project, and a portfolio
that spends its effort there has no effort left for the parts that are actually
novel.

## Decision

`fiscal_documents` models the part that constrains the rest of the system and
stubs the part that does not.

Modelled faithfully:

- a **series** and a **gap-free sequential number**, unique per tenant and
  enforced by a unique index;
- the number is allocated **inside the invoicing transaction**, so a rolled
  back invoice does not burn one;
- the document is immutable once issued, and cancelling it is a reversal that
  stays on the record.

Not implemented: XML generation, certificate signing, SEFAZ transmission,
contingency mode.

The numbering is a locked row in `number_sequences` bumped with
`UPDATE ... RETURNING`, not a Postgres `SEQUENCE`. A sequence is faster and is
explicitly non-transactional: a rolled back invoice would leave a hole in the
series, which a tax authority does not accept. Invoicing is not a hot path;
correctness of the series matters more than the contention.

## Consequences

- `invoice_sales_order` is classified `destructive` for a concrete reason: it
  consumes a number that can never be reused.
- An integration test issues three invoices in series `B` and asserts the
  numbers are exactly `000001`, `000002`, `000003`.
- A real integration would replace `FiscalRepository.save` with a call to an
  authorisation service and add an `authorising` status between `issued` and
  the final state. The rest of the domain does not change, because nothing
  outside the fiscal module knows how the number is produced.

## Alternatives considered

- **A real NF-e integration.** Correct for a product, wrong for this
  repository's purpose, and untestable without a certificate.
- **Skipping the document entirely.** Then invoicing would be a status change
  with no irreversible consequence, and the human-approval demonstration would
  lose its most convincing example.
