import {
  asId,
  type Actor,
  type DomainEventDraft,
  type EventRecorder,
  type ExecutionContext,
  type IdGenerator,
  type Role,
  type TenantId,
  type UnitOfWork,
  type UserId,
} from '@ledgerhand/domain'
import { sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { Database } from './client.js'
import { SqlCustomers, SqlProducts, SqlSuppliers } from './adapters/catalog.js'
import { SqlCash, SqlFinance, SqlFiscal } from './adapters/finance.js'
import { SqlPurchaseOrders } from './adapters/purchasing.js'
import { SqlReporting } from './adapters/reporting.js'
import { SqlSalesOrders } from './adapters/sales.js'
import { SqlSequences } from './adapters/sequences.js'
import { SqlStock } from './adapters/stock.js'
import { domainEvents } from './schema/index.js'

/** A drizzle transaction handle. Every repository is built over one of these. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export interface Session {
  readonly tenantId: TenantId
  readonly userId: UserId
  readonly role: Role
  readonly actor: Actor
  readonly timeZone: string
  readonly currency: string
}

export interface RunOptions {
  /** Overrides the clock. Tests and the eval suite pin it; production does not. */
  readonly now?: Date
}

class UuidGenerator implements IdGenerator {
  next(): string {
    return randomUUID()
  }
}

class CollectingEventRecorder implements EventRecorder {
  private readonly drafts: DomainEventDraft[] = []

  record(event: DomainEventDraft): void {
    this.drafts.push(event)
  }

  get recorded(): readonly DomainEventDraft[] {
    return this.drafts
  }
}

export function buildUnitOfWork(
  tx: Transaction,
  session: Session,
  events: EventRecorder,
  ids: IdGenerator,
  now: Date,
): UnitOfWork {
  return {
    products: new SqlProducts(tx, session.tenantId),
    customers: new SqlCustomers(tx, session.tenantId),
    suppliers: new SqlSuppliers(tx, session.tenantId),
    stock: new SqlStock(tx, session.tenantId, now),
    salesOrders: new SqlSalesOrders(tx, session.tenantId),
    purchaseOrders: new SqlPurchaseOrders(tx, session.tenantId),
    finance: new SqlFinance(tx, session.tenantId),
    cash: new SqlCash(tx, session.tenantId),
    fiscal: new SqlFiscal(tx, session.tenantId),
    reporting: new SqlReporting(tx, session.tenantId),
    sequences: new SqlSequences(tx, session.tenantId),
    ids,
    events,
  }
}

/**
 * Runs one use case inside one transaction.
 *
 * Three things happen here that the domain is deliberately unaware of:
 *
 *  1. `set_config('app.tenant_id', ..., true)` scopes row level security to
 *     this tenant. The `true` makes it transaction-local, which is what keeps
 *     it correct behind a transaction-mode connection pooler: the setting dies
 *     with the transaction rather than leaking into whoever borrows the
 *     connection next.
 *
 *  2. The events the use case recorded are written before the commit, so the
 *     log and the tables can never disagree.
 *
 *  3. A thrown error rolls everything back, including the events. A refusal --
 *     a `Result` that is not ok -- does not: the caller decides whether a
 *     business rejection should discard the work, and in practice a rejected
 *     use case has written nothing anyway.
 */
export async function withUnitOfWork<T>(
  db: Database,
  session: Session,
  handler: (context: ExecutionContext) => Promise<T>,
  options: RunOptions = {},
): Promise<T> {
  // The composition root is the one place allowed to read the wall clock:
  // everything downstream receives it through the execution context.
  // eslint-disable-next-line no-restricted-syntax -- this IS the clock
  const now = options.now ?? new Date()
  const ids = new UuidGenerator()

  return await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${session.tenantId}, true)`)

    const events = new CollectingEventRecorder()
    const context: ExecutionContext = {
      tenantId: session.tenantId,
      userId: session.userId,
      role: session.role,
      actor: session.actor,
      now,
      timeZone: session.timeZone,
      currency: session.currency,
      uow: buildUnitOfWork(tx, session, events, ids, now),
    }

    const result = await handler(context)
    await flushEvents(tx, session, events.recorded, now)
    return result
  })
}

async function flushEvents(
  tx: Transaction,
  session: Session,
  drafts: readonly DomainEventDraft[],
  occurredAt: Date,
): Promise<void> {
  if (drafts.length === 0) return

  await tx.insert(domainEvents).values(
    drafts.map((draft) => ({
      tenantId: session.tenantId,
      type: draft.type,
      version: draft.version ?? 1,
      aggregateType: draft.aggregateType,
      aggregateId: draft.aggregateId,
      payload: draft.payload,
      actorKind: session.actor.kind,
      actorId: session.actor.userId,
      agentRunId: session.actor.kind === 'agent' ? session.actor.agentRunId : null,
      occurredAt,
    })),
  )
}

/** Convenience for scripts and tests that act as the tenant administrator. */
export function systemSession(
  tenantId: string,
  userId: string,
  overrides: Partial<Session> = {},
): Session {
  return {
    tenantId: asId<TenantId>(tenantId),
    userId: asId<UserId>(userId),
    role: 'admin',
    actor: { kind: 'user', userId: asId<UserId>(userId) },
    timeZone: 'America/Sao_Paulo',
    currency: 'BRL',
    ...overrides,
  }
}
