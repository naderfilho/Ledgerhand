import { summariseForRole } from '@ledgerhand/domain'
import { authenticate, unauthorised } from '@/server/erp-api'

/**
 * The operations this token's role may run, described exactly as the MCP
 * server will publish them. A role is never told about the rest.
 */
export async function GET(request: Request): Promise<Response> {
  const caller = await authenticate(request)
  if (caller === null) return unauthorised()
  return Response.json({ tools: summariseForRole(caller.role) })
}
