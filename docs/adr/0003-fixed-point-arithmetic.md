# 3. Fixed-point arithmetic with three scales

- Status: accepted
- Date: 2026-03-16

## Context

An ERP that loses cents is not an ERP. JavaScript's `number` is IEEE-754, so
`0.1 + 0.2 !== 0.3`, and any system that adds money in floating point will
eventually produce a total that does not match the sum of its lines.

Weighted average cost makes it worse than plain addition. It is a running
division:

```
newCost = (onHand * currentCost + incoming * incomingCost) / (onHand + incoming)
```

Rounding the result to cents after every receipt accumulates error, and after a
few hundred movements the inventory valuation no longer agrees with the ledger.

## Decision

Every quantitative value is a `bigint` holding an integer number of the
smallest unit it is allowed to have, branded so the compiler will not let one
be used as another:

| Type        | Scale | Holds                 | Used for                   |
| ----------- | ----- | --------------------- | -------------------------- |
| `Money`     | 1e2   | cents                 | totals, balances, payments |
| `Quantity`  | 1e3   | thousandths of a unit | kg, litres, boxes          |
| `UnitPrice` | 1e6   | millionths            | price per unit             |
| `UnitCost`  | 1e6   | millionths            | weighted average cost      |

Per-unit values carry four more digits than money on purpose. Rounding happens
once, at the edge, in `extend(quantity, perUnit) -> Money`, and nowhere else.

Rules that follow:

- Division rounds **half away from zero** (`roundDiv`), the rule an invoice is
  expected to follow. Banker's rounding is statistically nicer and surprises
  people reading a total.
- `mulDiv` multiplies at full width before its single rounding step.
- Parsing external input **rejects excess precision** rather than truncating
  it. An agent asking to settle `10.005` is told the field takes two decimals,
  not silently given a different intent.
- Splitting an amount uses the **largest remainder method** (`allocateMoney`),
  so instalments always add back up to the total.

In Postgres the columns are `numeric(18,2)`, `numeric(18,3)` and
`numeric(20,6)`, converted at the adapter boundary by the same parser the rest
of the system uses. `numeric` rather than `bigint` because reports aggregate in
SQL: `SUM(total)` has to mean the money it looks like it means when somebody
opens `psql`, and a column holding `123456` for "one thousand two hundred and
thirty four reais" is a trap for whoever writes the next query.

## Consequences

- No floating point anywhere in the money path, from form field to PDF.
- Arithmetic reads slightly more verbosely: `addMoney(a, b)` rather than
  `a + b`.
- Property tests hold the design honest. `sum(splitMoney(total, n)) === total`
  for arbitrary totals and instalment counts; weighted average cost stays
  between the two costs it averages and, over forty consecutive receipts, does
  not drift from an independently computed exact value.
- Values crossing a process boundary are formatted as decimal strings, since
  `JSON.stringify` cannot serialise a `bigint`.

## Alternatives considered

- **`decimal.js` / `big.js`.** Ergonomic and correct, but it puts a runtime
  dependency inside a domain package whose whole point is having none, and it
  is slower for the one operation that runs in a loop.
- **Postgres `numeric` with arithmetic delegated to SQL.** Correct, and it
  makes the domain untestable without a database -- which would undo the
  property tests that found the real bugs.
- **Integer cents everywhere, including per-unit values.** Simplest, and it
  reintroduces exactly the weighted-average drift this decision exists to
  prevent.
