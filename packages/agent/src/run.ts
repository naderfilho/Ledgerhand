import Anthropic from '@anthropic-ai/sdk'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { consoleApprover, denyAll, type Approver } from './approvals.js'
import { limitsFromEnvironment, RunBudget } from './budget.js'
import { ErpClient, type ErpConnection } from './erp-client.js'
import { runTask } from './loop.js'
import { Transcript, type RunTranscript } from './transcript.js'
import { isPriced } from './pricing.js'

/**
 * ---------------------------------------------------------------------------
 * The composition root
 * ---------------------------------------------------------------------------
 * Reads the environment, opens the connection to the ERP, and runs one task.
 * Everything above this file takes its dependencies as arguments, which is why
 * the loop can be tested against a scripted model and an in-memory ERP without
 * a network, an API key or a database.
 */

export interface AgentRunOptions {
  readonly task: string
  /** Defaults to asking on the terminal, or refusing when there is no terminal. */
  readonly approver?: Approver
  readonly runId?: string
  readonly onEvent?: (line: string) => void
  readonly environment?: Readonly<Record<string, string | undefined>>
}

export const DEFAULT_MODEL = 'claude-sonnet-5'

function mcpServerEntryPoint(): string {
  const require = createRequire(import.meta.url)
  const entry = require.resolve('@ledgerhand/mcp-server')
  return entry.replace(/index\.js$/, 'bin/stdio.js')
}

/**
 * `stdio` launches the MCP server as a child process; `http` connects to one
 * already running. The child inherits only the variables the ERP needs -- an
 * agent process that happens to hold other secrets does not hand them on.
 */
export function connectionFromEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): ErpConnection {
  const kind = environment['AGENT_ERP'] ?? 'stdio'

  if (kind === 'http') {
    const url = environment['AGENT_MCP_URL'] ?? 'http://127.0.0.1:3333/mcp'
    const token = environment['MCP_HTTP_TOKEN']
    return token === undefined || token === ''
      ? { kind: 'http', url }
      : { kind: 'http', url, token }
  }

  if (kind !== 'stdio') {
    throw new Error(`AGENT_ERP must be "stdio" or "http". Received "${kind}".`)
  }

  const passthrough = [
    'DATABASE_URL',
    'DATABASE_AUTH_URL',
    'MCP_USER_EMAIL',
    'MCP_GATEWAY',
    'ERP_BASE_URL',
    'ERP_API_TOKEN',
    'MCP_APPROVAL',
    'PATH',
  ]
  const env: Record<string, string> = {}
  for (const name of passthrough) {
    const value = environment[name]
    if (value !== undefined) env[name] = value
  }

  return {
    kind: 'stdio',
    command: environment['AGENT_MCP_COMMAND'] ?? process.execPath,
    args: [environment['AGENT_MCP_ENTRY'] ?? mcpServerEntryPoint()],
    env,
  }
}

function createAnthropic(): Anthropic {
  try {
    return new Anthropic()
  } catch (error: unknown) {
    throw new Error(
      `No Anthropic credentials were found. Set ANTHROPIC_API_KEY in .env, or sign in with the Anthropic CLI. (${error instanceof Error ? error.message : String(error)})`,
    )
  }
}

/** Refusing is the right default when nothing is attached to answer. */
function defaultApprover(): Approver {
  return process.stdin.isTTY
    ? consoleApprover()
    : denyAll('Nothing is attached to this run that could approve an irreversible operation.')
}

export async function runAgentTask(options: AgentRunOptions): Promise<RunTranscript> {
  const environment = options.environment ?? process.env
  const runId = options.runId ?? randomUUID()
  const model = environment['AGENT_MODEL'] ?? DEFAULT_MODEL
  const note = options.onEvent ?? ((): void => undefined)

  if (!isPriced(model)) {
    note(
      `warning: ${model} is not in the pricing table, so the cost limit is applied at the most expensive known rate.`,
    )
  }

  // Checked before the ERP connection is opened, so a missing key fails in one
  // clear sentence rather than after spawning a server and reaching the API.
  const anthropic = createAnthropic()
  const approver = options.approver ?? defaultApprover()
  // eslint-disable-next-line no-restricted-syntax -- the composition root's clock
  const now = (): number => Date.now()
  const transcript = new Transcript(runId, options.task, model, now)

  const erp = await ErpClient.connect({
    connection: connectionFromEnvironment(environment),
    approver,
    runId,
    // Approvals arrive out of band -- the ERP asks the client, not the loop --
    // so they are written straight into the record, in the order they happened.
    onApproval: (approval) => {
      transcript.asked(approval.message, approval.approved, approval.by, approval.reason)
      note(`approval ${approval.approved ? 'granted' : 'refused'} by ${approval.by}`)
    },
  })

  try {
    return await runTask(options.task, {
      transcript,
      anthropic,
      erp,
      model,
      runId,
      budget: new RunBudget(limitsFromEnvironment(environment), now),
      maxOutputTokens: Number(environment['AGENT_MAX_OUTPUT_TOKENS'] ?? '16000'),
      effort: (environment['AGENT_EFFORT'] ?? 'high') as
        'low' | 'medium' | 'high' | 'xhigh' | 'max',
      now,
      ...(options.onEvent === undefined ? {} : { onEvent: options.onEvent }),
    })
  } finally {
    await erp.close()
  }
}
