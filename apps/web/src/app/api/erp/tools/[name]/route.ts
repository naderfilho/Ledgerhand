import { authenticate, callOperation, unauthorised } from '@/server/erp-api'

/**
 * Runs one operation. The name is a path segment, but nothing is trusted about
 * it: the registry decides whether it exists and the domain decides whether
 * this role may run it.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  const caller = await authenticate(request)
  if (caller === null) return unauthorised()

  const { name } = await params
  return await callOperation(caller, name, request)
}
