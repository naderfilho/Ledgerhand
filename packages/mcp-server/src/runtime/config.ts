import { approveEverything, elicitApproval, refuseDestructive } from '../server/approval.js'
import type { ErpServerOptions } from '../server/build.js'
import { httpGateway } from '../gateway/http.js'
import { createInProcessGateway, type RunningGateway } from './database.js'

/**
 * Reading the environment, in one place, with errors that say what to set.
 *
 * The two gateways are a deployment choice rather than a code path: the same
 * server object is built either way. `in-process` is for development and for
 * the eval suite; `http` is what the demo runs, because that is the shape
 * where the MCP server holds no database credentials.
 */

export type ApprovalMode = 'elicit' | 'refuse' | 'auto'

function required(name: string): string {
  const value = process.env[name]
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is not set. See .env.example.`)
  }
  return value
}

export function approvalFactory(mode: ApprovalMode): NonNullable<ErpServerOptions['approval']> {
  switch (mode) {
    case 'elicit':
      return elicitApproval
    case 'refuse':
      return refuseDestructive
    case 'auto':
      return approveEverything
  }
}

export function approvalMode(): ApprovalMode {
  const raw = process.env['MCP_APPROVAL'] ?? 'elicit'
  if (raw === 'elicit' || raw === 'refuse' || raw === 'auto') return raw
  throw new Error(`MCP_APPROVAL must be one of elicit, refuse, auto. Received "${raw}".`)
}

/**
 * `auto` exists for the eval suite, which measures what the agent decides to
 * do rather than what a human allows. Turning it on outside that context would
 * hand an agent the irreversible operations unattended, so it says so.
 */
export function warnIfUnattended(mode: ApprovalMode): void {
  if (mode === 'auto') {
    console.warn(
      '[ledgerhand-mcp] MCP_APPROVAL=auto: destructive operations will run without asking anyone. Intended for the eval suite only.',
    )
  }
}

export async function gatewayFromEnvironment(): Promise<RunningGateway> {
  const kind = process.env['MCP_GATEWAY'] ?? 'in-process'

  if (kind === 'http') {
    const baseUrl = required('ERP_BASE_URL')
    return await Promise.resolve({
      gateway: httpGateway({ baseUrl, token: required('ERP_API_TOKEN') }),
      describe: `over HTTP against ${baseUrl}`,
      close: () => Promise.resolve(),
    })
  }

  if (kind !== 'in-process') {
    throw new Error(`MCP_GATEWAY must be "in-process" or "http". Received "${kind}".`)
  }

  const databaseUrl = required('DATABASE_URL')
  return await createInProcessGateway({
    databaseUrl,
    authUrl: process.env['DATABASE_AUTH_URL'] ?? databaseUrl,
    userEmail: required('MCP_USER_EMAIL'),
  })
}
