#!/usr/bin/env node
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { createErpServer } from '../server/build.js'
import {
  approvalFactory,
  approvalMode,
  gatewayFromEnvironment,
  warnIfUnattended,
} from '../runtime/config.js'

/**
 * The Streamable HTTP transport, for clients that connect over the network
 * instead of launching a process.
 *
 * Two things are deliberate here. It binds to the loopback interface unless
 * told otherwise, because an MCP endpoint is an endpoint that runs business
 * operations. And it requires a bearer token when one is configured, checked
 * before the protocol is spoken at all -- authentication that only happens
 * after a session exists is not authentication.
 */

const PATH = '/mcp'

function unauthorised(response: ServerResponse): void {
  response.writeHead(401, { 'content-type': 'application/json' })
  response.end(JSON.stringify({ error: 'unauthorized' }))
}

function authorised(request: IncomingMessage, token: string | undefined): boolean {
  if (token === undefined || token === '') return true
  const header = request.headers.authorization
  return header === `Bearer ${token}`
}

async function main(): Promise<void> {
  const mode = approvalMode()
  warnIfUnattended(mode)

  const running = await gatewayFromEnvironment()
  const token = process.env['MCP_HTTP_TOKEN']
  const port = Number(process.env['MCP_HTTP_PORT'] ?? '3333')
  const host = process.env['MCP_HTTP_HOST'] ?? '127.0.0.1'

  const sessions = new Map<string, StreamableHTTPServerTransport>()

  const http = createServer((request, response) => {
    void (async (): Promise<void> => {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? host}`)
      if (url.pathname !== PATH) {
        response.writeHead(404, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: 'not found' }))
        return
      }
      if (!authorised(request, token)) {
        unauthorised(response)
        return
      }

      const sessionId = request.headers['mcp-session-id']
      const existing = typeof sessionId === 'string' ? sessions.get(sessionId) : undefined
      if (existing !== undefined) {
        await existing.handleRequest(request, response)
        return
      }

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, transport)
        },
        enableDnsRebindingProtection: true,
        allowedHosts: [`${host}:${String(port)}`, `localhost:${String(port)}`],
      })
      transport.onclose = (): void => {
        const id = transport.sessionId
        if (id !== undefined) sessions.delete(id)
      }

      const server = createErpServer({
        gateway: running.gateway,
        approval: approvalFactory(mode),
      })
      // The SDK types this transport with optional callbacks that our stricter
      // exactOptionalPropertyTypes rejects. The shape is right; the variance is not.
      await server.connect(transport as Transport)
      await transport.handleRequest(request, response)
    })().catch((error: unknown) => {
      console.error('[ledgerhand-mcp] request failed:', error)
      if (!response.headersSent) {
        response.writeHead(500, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: 'internal error' }))
      }
    })
  })

  const shutdown = (): void => {
    void (async (): Promise<void> => {
      http.close()
      for (const transport of sessions.values()) await transport.close()
      await running.close()
      process.exit(0)
    })()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  http.listen(port, host, () => {
    console.error(
      `[ledgerhand-mcp] ready on http://${host}:${String(port)}${PATH}, ${running.describe}, approval: ${mode}${token === undefined ? ' (no token required)' : ''}`,
    )
  })
}

main().catch((error: unknown) => {
  console.error('[ledgerhand-mcp] failed to start:', error)
  process.exit(1)
})
