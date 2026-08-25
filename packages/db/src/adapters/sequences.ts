import type { NumberSequence, TenantId } from '@ledgerhand/domain'
import { and, eq, sql } from 'drizzle-orm'
import { numberSequences } from '../schema/index.js'
import type { Transaction } from '../unit-of-work.js'

/**
 * Gap-free numbering.
 *
 * A Postgres SEQUENCE is faster and is the usual answer, but it is explicitly
 * non-transactional: a rolled back invoice would burn its number and leave a
 * hole in the fiscal series, which a tax authority does not accept. So the
 * counter is an ordinary row, bumped with `UPDATE ... RETURNING` inside the
 * caller transaction. The row lock serialises concurrent invoicing, and a
 * rollback takes the number back with it.
 *
 * The trade-off is deliberate: invoicing is not a hot path, and correctness of
 * the series matters more than the contention.
 */
export class SqlSequences implements NumberSequence {
  constructor(
    private readonly tx: Transaction,
    private readonly tenantId: TenantId,
  ) {}

  async next(name: string): Promise<number> {
    const updated = await this.tx
      .update(numberSequences)
      .set({ nextValue: sql`${numberSequences.nextValue} + 1` })
      .where(and(eq(numberSequences.tenantId, this.tenantId), eq(numberSequences.name, name)))
      .returning({ value: numberSequences.nextValue })

    const bumped = updated[0]
    if (bumped !== undefined) return bumped.value - 1

    // First use of this counter for this tenant. `onConflictDoNothing` covers
    // the race where two transactions create it at the same moment; the loser
    // falls through to a second attempt at the update.
    const inserted = await this.tx
      .insert(numberSequences)
      .values({ tenantId: this.tenantId, name, nextValue: 2 })
      .onConflictDoNothing({ target: [numberSequences.tenantId, numberSequences.name] })
      .returning({ value: numberSequences.nextValue })

    if (inserted[0] !== undefined) return 1
    return await this.next(name)
  }
}
