/* eslint-disable @typescript-eslint/no-deprecated -- the SDK reserves the low-level Server for advanced use cases; publishing the domain's own JSON Schema is one. See the note in build.ts. */
import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import type { RiskLevel } from '@ledgerhand/domain'

/**
 * ---------------------------------------------------------------------------
 * Human approval for destructive tools
 * ---------------------------------------------------------------------------
 * ADR 0006 says the domain decides what is destructive. This is where that
 * classification acquires teeth: before a destructive tool runs, a person is
 * shown the domain's own sentence about what is going to happen and has to say
 * yes.
 *
 * The sentence comes from `preview`, which is code, not from the model's
 * account of its own intentions. A model that wants to settle the wrong
 * invoice cannot describe it as the right one, because it does not write the
 * description.
 *
 * MCP has a mechanism for exactly this -- elicitation -- so the confirmation
 * happens inside the protocol rather than in a side channel the agent could
 * skip. A client that does not support elicitation gets destructive tools
 * refused rather than silently allowed: failing closed is the only safe
 * default when the human cannot be reached.
 */

export interface ApprovalRequest {
  readonly tool: string
  readonly title: string
  readonly risk: RiskLevel
  /** The domain's description of the effect, or null when it has none. */
  readonly preview: string | null
}

export type ApprovalDecision =
  { readonly approved: true } | { readonly approved: false; readonly reason: string }

export interface ApprovalGate {
  requiresApproval(risk: RiskLevel): boolean
  request(approval: ApprovalRequest): Promise<ApprovalDecision>
}

/** Everything runs. For the in-process eval suite, which scores the agent's decisions rather than a human's. */
export function approveEverything(): ApprovalGate {
  return {
    requiresApproval: () => false,
    request: () => Promise.resolve({ approved: true }),
  }
}

/** Nothing destructive runs. Useful for a demo of the read-only surface. */
export function refuseDestructive(): ApprovalGate {
  return {
    requiresApproval: (risk) => risk === 'destructive',
    request: () =>
      Promise.resolve({
        approved: false,
        reason: 'This server is configured to refuse destructive operations.',
      }),
  }
}

/** Asks the connected client's human, over MCP elicitation. The default. */
export function elicitApproval(server: Server): ApprovalGate {
  return {
    requiresApproval: (risk) => risk === 'destructive',

    request: async (approval) => {
      if (server.getClientCapabilities()?.elicitation === undefined) {
        return {
          approved: false,
          reason:
            'This client cannot ask a person to confirm (no elicitation support), and destructive operations are never performed unconfirmed. Ask the user to run this from the ERP interface.',
        }
      }

      const effect = approval.preview ?? `Run ${approval.tool}, which is classified destructive.`
      const result = await server.elicitInput({
        message: `${effect}\n\nApprove?`,
        requestedSchema: {
          type: 'object',
          properties: {
            confirm: {
              type: 'boolean',
              title: `Approve ${approval.title}`,
              description: effect,
            },
          },
          required: ['confirm'],
        },
      })

      if (result.action !== 'accept' || result.content?.['confirm'] !== true) {
        return { approved: false, reason: 'A person declined the operation.' }
      }
      return { approved: true }
    },
  }
}
