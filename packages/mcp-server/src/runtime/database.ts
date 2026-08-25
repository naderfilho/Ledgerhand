import { createAuthLookup, createDatabase, withScope, type Session } from '@ledgerhand/db'
import { asId, type AgentRunId, type TenantId, type UserId } from '@ledgerhand/domain'
import { inProcessGateway, type ExecutionScope, type ScopeOptions } from '../gateway/in-process.js'
import type { UseCaseGateway } from '../gateway/gateway.js'

/**
 * The composition root for the in-process gateway: the only file in this
 * package that knows Postgres exists. Everything above it works against
 * `ScopeRunner`, which is why the tool surface can be tested against the
 * in-memory harness with no database at all.
 *
 * The identity is resolved from the database, never from configuration. The
 * environment names a user by email; the tenant and the role come from the
 * `users` row. Setting `MCP_USER_EMAIL=readonly@...` therefore produces a
 * server that genuinely cannot write, rather than one that has been asked
 * nicely not to.
 */

export interface InProcessConfig {
  readonly databaseUrl: string
  /** Connection used for the identity lookup only; defaults to `databaseUrl`. */
  readonly authUrl?: string
  readonly userEmail: string
  readonly poolSize?: number
}

export interface RunningGateway {
  readonly gateway: UseCaseGateway
  readonly describe: string
  close(): Promise<void>
}

export async function createInProcessGateway(config: InProcessConfig): Promise<RunningGateway> {
  const accounts = createAuthLookup(config.authUrl ?? config.databaseUrl)
  const account = await accounts.findActiveByEmail(config.userEmail)
  if (account === null) {
    throw new Error(
      `No active user with the email ${config.userEmail}. Set MCP_USER_EMAIL to a user that exists, for example admin@ledgerhand.dev after "pnpm db:seed".`,
    )
  }

  const handle = createDatabase(config.databaseUrl, { max: config.poolSize ?? 5 })
  const session: Session = {
    tenantId: asId<TenantId>(account.tenantId),
    userId: asId<UserId>(account.userId),
    role: account.role,
    // The default actor. A call that names an agent run swaps it below.
    actor: { kind: 'user', userId: asId<UserId>(account.userId) },
    timeZone: account.timeZone,
    currency: account.currency,
  }

  /**
   * The agent borrows the identity and the role of the user it acts for; only
   * the actor changes, so the audit trail can name both the run and the person
   * accountable for it.
   */
  const sessionFor = (agentRunId: string | null | undefined): Session =>
    agentRunId === null || agentRunId === undefined
      ? session
      : {
          ...session,
          actor: {
            kind: 'agent',
            userId: session.userId,
            agentRunId: asId<AgentRunId>(agentRunId),
          },
        }

  const run = async <T>(
    handler: (scope: ExecutionScope) => Promise<T>,
    options?: ScopeOptions,
  ): Promise<T> => await withScope(handle.db, sessionFor(options?.agentRunId), handler)

  return {
    gateway: inProcessGateway(run),
    describe: `in-process as ${account.email} (${account.role}) in ${account.tenantName}`,
    close: async () => {
      await handle.close()
    },
  }
}
