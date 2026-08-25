import { asId, runOperation, type AgentRunId, type OperationDependencies } from '@ledgerhand/domain'
import { and, eq, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { domainEvents } from '../schema/index.js'
import { withScope, type Session, type Transaction } from '../unit-of-work.js'
import {
  createTenant,
  FIXED_NOW,
  postgresIsAvailable,
  SKIP_MESSAGE,
  startIntegration,
  type IntegrationContext,
  type IntegrationTenant,
} from './harness.js'

/**
 * The audit link an agent run depends on.
 *
 * `domain_events.agent_run_id` is what makes "show me everything that run
 * changed" a single query. It is set from the actor on the session, which the
 * MCP server swaps when a call names a run -- so this test is the far end of
 * that plumbing: the row on disk, with the run on it, next to the user who
 * remains accountable for it.
 */

const available = await postgresIsAvailable()

describe.skipIf(!available)('attributing events to an agent run', () => {
  let context: IntegrationContext
  let tenant: IntegrationTenant

  const dependencies = (
    idempotency: OperationDependencies['idempotency'],
  ): OperationDependencies => ({
    idempotency,
    hash: (canonical) => canonical,
  })

  const asAgent = (runId: string): Session => ({
    ...tenant.session,
    actor: { kind: 'agent', userId: tenant.session.userId, agentRunId: asId<AgentRunId>(runId) },
  })

  const call = async (session: Session, name: string, input: unknown): Promise<unknown> =>
    await withScope(
      context.app.db,
      session,
      async (scope) => {
        const outcome = await runOperation(
          { name, input },
          scope.context,
          dependencies(scope.idempotency),
        )
        if (!outcome.ok) throw new Error(`${outcome.error.code}: ${outcome.error.message}`)
        return outcome.value
      },
      { now: FIXED_NOW },
    )

  const eventsFor = async (
    aggregateId: string,
  ): Promise<readonly (typeof domainEvents.$inferSelect)[]> =>
    await context.app.db.transaction(async (tx: Transaction) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${tenant.tenantId}, true)`)
      return await tx
        .select()
        .from(domainEvents)
        .where(
          and(
            eq(domainEvents.tenantId, tenant.tenantId),
            eq(domainEvents.aggregateId, aggregateId),
          ),
        )
    })

  beforeAll(async () => {
    if (!available) {
      console.warn(SKIP_MESSAGE)
      return
    }
    context = startIntegration()
    tenant = await createTenant(context, 'Attribution Ltda')
  })

  afterAll(async () => {
    await context.close()
  })

  it('records the run and the person it acted for', async () => {
    const runId = randomUUID()
    const product = (await call(asAgent(runId), 'create_product', {
      sku: 'AGT-01',
      name: 'Agent widget',
      salePrice: '10.00',
    })) as { id: string }

    const events = await eventsFor(product.id)

    expect(events).toHaveLength(1)
    expect(events[0]?.actorKind).toBe('agent')
    expect(events[0]?.agentRunId).toBe(runId)
    // The agent borrowed a person's identity; the person stays on the record.
    expect(events[0]?.actorId).toBe(tenant.session.userId)
  })

  it('leaves the run empty when a person did the work', async () => {
    const product = (await call(tenant.session, 'create_product', {
      sku: 'AGT-02',
      name: 'Human widget',
      salePrice: '10.00',
    })) as { id: string }

    const events = await eventsFor(product.id)

    expect(events[0]?.actorKind).toBe('user')
    expect(events[0]?.agentRunId).toBeNull()
  })
})
