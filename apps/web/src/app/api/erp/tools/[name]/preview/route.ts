import { authenticate, describeOperation, unauthorised } from '@/server/erp-api'

/**
 * The sentence a person would be shown before approving this operation, with
 * these arguments. Changes nothing, and returns null when the operation is not
 * destructive enough to need one.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  const caller = await authenticate(request)
  if (caller === null) return unauthorised()

  const { name } = await params
  return await describeOperation(caller, name, request)
}
