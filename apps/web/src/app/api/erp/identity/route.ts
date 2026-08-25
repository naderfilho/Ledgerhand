import { authenticate, describeIdentity, unauthorised } from '@/server/erp-api'

/**
 * Who the token belongs to, and what today is where that tenant trades. A
 * client asks this first so it never has to guess the date.
 */
export async function GET(request: Request): Promise<Response> {
  const caller = await authenticate(request)
  if (caller === null) return unauthorised()
  return await describeIdentity(caller)
}
