import type Anthropic from '@anthropic-ai/sdk'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { ElicitRequestSchema, type Tool } from '@modelcontextprotocol/sdk/types.js'
import type { Approver, ApprovalOutcome } from './approvals.js'

/**
 * ---------------------------------------------------------------------------
 * The ERP, as the agent sees it
 * ---------------------------------------------------------------------------
 * An MCP client and nothing else. This is the file that makes the dependency
 * graph in the README true: there is no database here, no domain use case, no
 * table -- only a protocol connection to a server that decides what this
 * agent's role is allowed to do.
 *
 * Two responsibilities beyond connecting:
 *
 *  - Translating the tool list into Anthropic tool definitions. The schema is
 *    passed through untouched: it is the domain's, and the model should be
 *    shown the one that will actually reject it.
 *  - Answering elicitation. The ERP asks for a human before anything
 *    irreversible; the answer comes from the approver, and every question and
 *    answer is handed to the caller for the transcript.
 */

export interface ErpConnection {
  readonly kind: 'stdio' | 'http'
  /** stdio: the command to launch. http: the endpoint URL. */
  readonly command?: string
  readonly args?: readonly string[]
  readonly env?: Readonly<Record<string, string>>
  readonly url?: string
  readonly token?: string
}

export interface ToolOutcome {
  readonly text: string
  readonly isError: boolean
}

export interface RecordedApproval extends ApprovalOutcome {
  readonly message: string
}

export interface ErpClientOptions {
  readonly connection?: ErpConnection
  /**
   * An already-built transport, for tests: the whole agent can then run
   * against a real MCP server over an in-memory pipe, with no process to
   * spawn and no socket to open.
   */
  readonly transport?: Transport
  readonly approver: Approver
  /** Stamped on every tool call so the ERP can attribute its events to this run. */
  readonly runId: string
  readonly onApproval?: (approval: RecordedApproval) => void
}

/** The key the MCP server reads the run id from. Namespaced, as `_meta` requires. */
export const AGENT_RUN_META_KEY = 'dev.ledgerhand/agent-run-id'

export class ErpClient {
  private constructor(
    private readonly client: Client,
    private readonly runId: string,
  ) {}

  static async connect(options: ErpClientOptions): Promise<ErpClient> {
    const client = new Client(
      { name: 'ledgerhand-agent', version: '0.1.0' },
      // Declaring elicitation is what makes destructive tools reachable at
      // all: a client that cannot ask anyone is refused them by the server.
      { capabilities: { elicitation: {} } },
    )

    client.setRequestHandler(ElicitRequestSchema, async (request) => {
      const message = request.params.message
      const outcome = await options.approver.decide({ message, runId: options.runId })
      options.onApproval?.({ ...outcome, message })
      return outcome.approved
        ? { action: 'accept' as const, content: { confirm: true } }
        : { action: 'decline' as const }
    })

    await client.connect(options.transport ?? transportFor(options.connection))
    return new ErpClient(client, options.runId)
  }

  /** The server's own description of itself, handed to the model as context. */
  instructions(): string {
    return this.client.getInstructions() ?? ''
  }

  async tools(): Promise<readonly Anthropic.Tool[]> {
    const listed = await this.client.listTools()
    return listed.tools.map(toAnthropicTool)
  }

  async call(name: string, input: unknown): Promise<ToolOutcome> {
    const result = await this.client.callTool({
      name,
      arguments: (input ?? {}) as Record<string, unknown>,
      _meta: { [AGENT_RUN_META_KEY]: this.runId },
    })

    const blocks = Array.isArray(result.content) ? result.content : []
    const text = blocks
      .map((block) => {
        const candidate = block as { type?: unknown; text?: unknown }
        return candidate.type === 'text' && typeof candidate.text === 'string' ? candidate.text : ''
      })
      .filter((part) => part !== '')
      .join('\n')

    return {
      text: text === '' ? '(the tool returned nothing)' : text,
      isError: result.isError === true,
    }
  }

  async close(): Promise<void> {
    await this.client.close()
  }
}

function toAnthropicTool(tool: Tool): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description ?? tool.title ?? tool.name,
    // The domain's JSON Schema, unmodified. Rewriting it here would mean the
    // model is shown one contract and judged against another.
    input_schema: tool.inputSchema as Anthropic.Tool['input_schema'],
  }
}

// The SDK types its transports with optional callbacks that this repository's
// stricter exactOptionalPropertyTypes rejects. The shape is right; the
// variance is not.
function transportFor(connection: ErpConnection | undefined): Transport {
  if (connection === undefined) {
    throw new Error('An ErpClient needs either a connection or a transport.')
  }
  if (connection.kind === 'http') {
    if (connection.url === undefined) {
      throw new Error('An http connection needs a url.')
    }
    const headers =
      connection.token === undefined ? {} : { authorization: `Bearer ${connection.token}` }
    return new StreamableHTTPClientTransport(new URL(connection.url), {
      requestInit: { headers },
    }) as Transport
  }

  if (connection.command === undefined) {
    throw new Error('A stdio connection needs a command to launch.')
  }
  return new StdioClientTransport({
    command: connection.command,
    args: [...(connection.args ?? [])],
    env: { ...connection.env },
    // The server writes diagnostics to stderr; letting them through is what
    // makes a misconfigured ERP visible instead of a silent hang.
    stderr: 'inherit',
  })
}
