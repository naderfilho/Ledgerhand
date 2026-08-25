import type { IdempotencyRecord, IdempotencyStore, JsonValue, TenantId } from '@ledgerhand/domain'
import { and, eq } from 'drizzle-orm'
import { idempotencyRecords } from '../schema/index.js'
import type { Transaction } from '../unit-of-work.js'

/**
 * Idempotency keys, stored in the same transaction as the work they describe.
 *
 * That is the whole point: if the record and the effect could commit
 * separately, a crash between them would either replay a settlement that
 * already happened or refuse one that never did. Inside one transaction there
 * is no window.
 *
 * The unique index on (tenant, key, operation) is what makes two concurrent
 * calls with the same key safe. One of them loses the insert and is told to
 * retry rather than being allowed to run the operation twice.
 */
export class SqlIdempotencyStore implements IdempotencyStore {
  constructor(
    private readonly tx: Transaction,
    private readonly tenantId: TenantId,
  ) {}

  async find(key: string, operation: string): Promise<IdempotencyRecord | null> {
    const [row] = await this.tx
      .select()
      .from(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.tenantId, this.tenantId),
          eq(idempotencyRecords.key, key),
          eq(idempotencyRecords.operation, operation),
        ),
      )
      .limit(1)

    if (row === undefined) return null
    return {
      key: row.key,
      operation: row.operation,
      requestHash: row.requestHash,
      response: row.response as JsonValue,
      createdAt: row.createdAt,
    }
  }

  async save(record: IdempotencyRecord): Promise<void> {
    await this.tx.insert(idempotencyRecords).values({
      tenantId: this.tenantId,
      key: record.key,
      operation: record.operation,
      requestHash: record.requestHash,
      response: record.response,
      createdAt: record.createdAt,
    })
  }
}
