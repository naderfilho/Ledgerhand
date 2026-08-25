#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createErpServer } from '../server/build.js'
import {
  approvalFactory,
  approvalMode,
  gatewayFromEnvironment,
  warnIfUnattended,
} from '../runtime/config.js'

/**
 * The stdio transport: what a desktop MCP client launches.
 *
 * Everything diagnostic goes to stderr. stdout carries the protocol, and a
 * stray console.log there corrupts the stream -- a mistake worth naming,
 * because it is invisible until a client refuses to connect for no stated
 * reason.
 */
async function main(): Promise<void> {
  const mode = approvalMode()
  warnIfUnattended(mode)

  const running = await gatewayFromEnvironment()
  const server = createErpServer({ gateway: running.gateway, approval: approvalFactory(mode) })

  const shutdown = (): void => {
    void (async (): Promise<void> => {
      await server.close()
      await running.close()
      process.exit(0)
    })()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  await server.connect(new StdioServerTransport())
  console.error(`[ledgerhand-mcp] ready on stdio, ${running.describe}, approval: ${mode}`)
}

main().catch((error: unknown) => {
  console.error('[ledgerhand-mcp] failed to start:', error)
  process.exit(1)
})
