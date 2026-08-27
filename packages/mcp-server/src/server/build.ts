/* eslint-disable @typescript-eslint/no-deprecated -- the SDK reserves the low-level Server for advanced use cases; publishing the domain's own JSON Schema is one. See the note in build.ts. */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js'
import type { GatewayError, ToolSummary, UseCaseGateway } from '../gateway/gateway.js'
import { elicitApproval, type ApprovalGate } from './approval.js'
import { PROMPTS } from './prompts.js'
import {
  RESOURCES,
  RESOURCE_MIME_TYPE,
  RESOURCE_TEMPLATES,
  resolveResource,
  type ResourceContext,
} from './resources.js'
import { PREVIEW_TOOL, previewTool, splitArguments, toMcpTool } from './tools.js'

/**
 * ---------------------------------------------------------------------------
 * The server
 * ---------------------------------------------------------------------------
 * Assembled on the low-level `Server` rather than on `McpServer`, for one
 * reason: the tool schemas must be the ones the domain publishes. The
 * high-level API converts a zod schema itself, and that conversion cannot
 * express the cross-field rules several of these inputs carry. Publishing a
 * schema that is not the one enforcing the rules is exactly the drift this
 * repository is built to avoid.
 *
 * Three guarantees hold no matter what the client sends:
 *
 *  1. `tools/list` shows only what the caller's role may run.
 *  2. `tools/call` checks membership of that same list before dispatching, so
 *     a client that calls an unadvertised name gets nothing. The ERP then
 *     checks the capability again, because this process is not the authority.
 *  3. A destructive tool goes through the approval gate first, with the
 *     domain's own description of the effect.
 */

const INSTRUCTIONS = `Ledgerhand is a trading company's ERP: catalogue, stock, sales, purchasing and finance.

You are acting on behalf of a specific user, with that user's role. The tools you can see are the ones that role may run -- there is no hidden set, and asking for something outside it will be refused rather than negotiated.

Working rules:
- Dates: call get_current_context (or read erp://cash/today) before interpreting "today", "this month" or "yesterday". Your own sense of the date is not the tenant's.
- Money and quantities arrive as decimal strings ("1234.50"). Send them back the same way; never as floats.
- Writes accept an \`idempotency_key\`. Use a fresh key per intended action, and repeat the same key when retrying one you are unsure about.
- Destructive operations (settling, invoicing, cancelling, closing cash, stock exits and adjustments) require a person to confirm. Use ${PREVIEW_TOOL} to see the sentence they will be shown.
- A refusal from the ERP is a business rule, not an obstacle to route around. Report it and say what would make the request valid.`

export interface ErpServerOptions {
  readonly gateway: UseCaseGateway
  /** Defaults to asking the connected client's human over MCP elicitation. */
  readonly approval?: (server: Server) => ApprovalGate
  readonly name?: string
  readonly version?: string
}

/**
 * The MCP extension point for out-of-band context. An agent puts the id of the
 * run it is performing here, and the ERP attributes its events to it.
 */
export const AGENT_RUN_META_KEY = 'dev.ledgerhand/agent-run-id'

function agentRunIdOf(meta: Record<string, unknown> | undefined): string | null {
  const value = meta?.[AGENT_RUN_META_KEY]
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function errorResult(error: GatewayError): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: `${error.code}: ${error.message}` }],
  }
}

function jsonResult(value: unknown, replayed: boolean): CallToolResult {
  const body = JSON.stringify(value, null, 2)
  return {
    content: [
      {
        type: 'text',
        text: replayed
          ? `${body}\n\n(Replayed: this idempotency key had already been used for these arguments. Nothing was done a second time.)`
          : body,
      },
    ],
  }
}

export function createErpServer(options: ErpServerOptions): Server {
  const gateway = options.gateway
  const server = new Server(
    { name: options.name ?? 'ledgerhand-erp', version: options.version ?? '0.1.0' },
    {
      capabilities: { tools: { listChanged: false }, resources: {}, prompts: {} },
      instructions: INSTRUCTIONS,
    },
  )

  const gate = (options.approval ?? elicitApproval)(server)

  const permittedTools = async (): Promise<ReadonlyMap<string, ToolSummary>> =>
    new Map((await gateway.tools()).map((summary) => [summary.name, summary]))

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const summaries = await gateway.tools()
    return { tools: [...summaries.map(toMcpTool), previewTool] }
  })

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const name = request.params.name
    const allowed = await permittedTools()

    if (name === PREVIEW_TOOL) {
      const args = (request.params.arguments ?? {}) as { operation?: unknown; input?: unknown }
      if (typeof args.operation !== 'string') {
        return errorResult({
          code: 'VALIDATION_FAILED',
          message: 'Invalid input. operation: expected the name of a tool.',
        })
      }
      if (!allowed.has(args.operation)) {
        return errorResult({
          code: 'FORBIDDEN',
          message: `${args.operation} is not available to your role.`,
        })
      }
      const preview = await gateway.preview({ name: args.operation, input: args.input ?? {} })
      if (!preview.ok) return errorResult(preview.error)
      return jsonResult(
        preview.value ?? `${args.operation} changes nothing that needs describing first.`,
        false,
      )
    }

    const summary = allowed.get(name)
    if (summary === undefined) {
      // Deliberately one message for "no such tool" and "not yours": a client
      // should not be able to enumerate the operations it is not allowed to
      // see by watching which name produces which error.
      return errorResult({
        code: 'FORBIDDEN',
        message: `${name} is not available to your role, or does not exist.`,
      })
    }

    const { input, idempotencyKey } = splitArguments(request.params.arguments)
    const agentRunId = agentRunIdOf(request.params._meta)

    if (gate.requiresApproval(summary.risk)) {
      const preview = summary.hasPreview
        ? await gateway.preview({ name, input })
        : ({ ok: true, value: null, replayed: false } as const)
      // A preview that fails means the operation would fail too -- a missing
      // order, a closed day. Report that instead of asking for approval of
      // something that cannot happen.
      if (!preview.ok) return errorResult(preview.error)

      const decision = await gate.request({
        tool: name,
        title: summary.title,
        risk: summary.risk,
        preview: preview.value,
      })
      if (!decision.approved) {
        return errorResult({ code: 'APPROVAL_DENIED', message: decision.reason })
      }
    }

    const outcome = await gateway.call({ name, input, idempotencyKey, agentRunId })
    return outcome.ok ? jsonResult(outcome.value, outcome.replayed) : errorResult(outcome.error)
  })

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const allowed = await permittedTools()
    return {
      resources: RESOURCES.filter((resource) => allowed.has(resource.operation)).map(
        (resource) => ({
          uri: resource.uri,
          name: resource.name,
          title: resource.title,
          description: resource.description,
          mimeType: RESOURCE_MIME_TYPE,
        }),
      ),
    }
  })

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
    const allowed = await permittedTools()
    return {
      resourceTemplates: RESOURCE_TEMPLATES.filter((template) =>
        allowed.has(template.operation),
      ).map((template) => ({
        uriTemplate: template.uriTemplate,
        name: template.name,
        title: template.title,
        description: template.description,
        mimeType: RESOURCE_MIME_TYPE,
      })),
    }
  })

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri
    const resolved = resolveResource(uri)
    if (resolved === null) {
      throw new McpError(ErrorCode.InvalidParams, `No resource at ${uri}.`)
    }

    const allowed = await permittedTools()
    if (!allowed.has(resolved.operation)) {
      throw new McpError(ErrorCode.InvalidParams, `${uri} is not available to your role.`)
    }

    const identity = await gateway.identity()
    const context: ResourceContext = { today: identity.today }
    const { operation, input } = resolved.build(context)

    const outcome = await gateway.call({ name: operation, input })
    if (!outcome.ok) {
      throw new McpError(ErrorCode.InternalError, `${outcome.error.code}: ${outcome.error.message}`)
    }

    return {
      contents: [
        {
          uri,
          mimeType: RESOURCE_MIME_TYPE,
          text: JSON.stringify(outcome.value, null, 2),
        },
      ],
    }
  })

  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    const allowed = await permittedTools()
    return {
      prompts: PROMPTS.filter((prompt) =>
        prompt.requires.every((operation) => allowed.has(operation)),
      ).map((prompt) => prompt.definition),
    }
  })

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const prompt = PROMPTS.find((candidate) => candidate.definition.name === request.params.name)
    const allowed = await permittedTools()
    if (!prompt?.requires.every((operation) => allowed.has(operation))) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `No prompt named ${request.params.name} is available to your role.`,
      )
    }

    return {
      description: prompt.definition.description,
      messages: prompt.render(request.params.arguments ?? {}),
    }
  })

  return server
}
