import type {
  AuditRepository,
  EventFilter,
  Paginated,
  PersistedEvent,
  TenantId,
} from '@ledgerhand/domain'
import { and, count, desc, eq, getTableColumns, inArray, type SQL } from 'drizzle-orm'
import { domainEvents } from '../schema/index.js'
import type { Transaction } from '../unit-of-work.js'
import { limitOf, offsetOf, paginatedFrom, rowCount } from './shared.js'

type EventRow = typeof domainEvents.$inferSelect

function toEvent(row: EventRow): PersistedEvent {
  return {
    id: row.id,
    type: row.type,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    payload: row.payload as Readonly<Record<string, unknown>>,
    actorKind: row.actorKind,
    actorId: row.actorId,
    agentRunId: row.agentRunId,
    occurredAt: row.occurredAt,
  }
}

/**
 * Read-only, and not by convention: the application role has no UPDATE or
 * DELETE on `domain_events`, so there is no write method to implement.
 */
export class SqlAudit implements AuditRepository {
  constructor(
    private readonly tx: Transaction,
    private readonly tenantId: TenantId,
  ) {}

  async listEvents(filter: EventFilter): Promise<Paginated<PersistedEvent>> {
    const conditions: SQL[] = [eq(domainEvents.tenantId, this.tenantId)]
    if (filter.types !== undefined && filter.types.length > 0) {
      conditions.push(inArray(domainEvents.type, [...filter.types]))
    }
    if (filter.aggregateType !== undefined) {
      conditions.push(eq(domainEvents.aggregateType, filter.aggregateType))
    }
    if (filter.aggregateId !== undefined) {
      conditions.push(eq(domainEvents.aggregateId, filter.aggregateId))
    }
    if (filter.agentRunId !== undefined) {
      conditions.push(eq(domainEvents.agentRunId, filter.agentRunId))
    }
    if (filter.actorKind !== undefined) {
      conditions.push(eq(domainEvents.actorKind, filter.actorKind))
    }

    const rows = await this.tx
      .select({ ...getTableColumns(domainEvents), _rowCount: rowCount })
      .from(domainEvents)
      .where(and(...conditions))
      .orderBy(desc(domainEvents.occurredAt), desc(domainEvents.id))
      .limit(limitOf(filter.page))
      .offset(offsetOf(filter.page))

    return paginatedFrom(rows, toEvent)
  }

  async countByActorKind(): Promise<Readonly<Record<string, number>>> {
    const rows = await this.tx
      .select({ actorKind: domainEvents.actorKind, value: count() })
      .from(domainEvents)
      .where(eq(domainEvents.tenantId, this.tenantId))
      .groupBy(domainEvents.actorKind)

    return Object.fromEntries(rows.map((row) => [row.actorKind, row.value]))
  }
}
