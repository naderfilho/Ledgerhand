/**
 * A business rule that says "no" is not an exception -- it is an expected
 * outcome that callers must handle. Use cases therefore return `Result` and
 * reserve thrown errors for genuine defects (a broken invariant, a dead
 * database connection). This is what lets the MCP server turn a refusal into
 * a sentence the model can act on instead of a stack trace it cannot.
 */
export interface Ok<T> {
  readonly ok: true
  readonly value: T
}
export interface Err<E> {
  readonly ok: false
  readonly error: E
}
export type Result<T, E> = Ok<T> | Err<E>

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value }
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error }
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok
}

export function mapOk<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result
}

export function flatMapOk<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  return result.ok ? fn(result.value) : result
}

/**
 * Turns a list of results into a result of a list, failing on the first error.
 * Used wherever a request carries many lines (order items, settlements) and a
 * single bad line must reject the whole request rather than half-apply it.
 */
export function collect<T, E>(results: readonly Result<T, E>[]): Result<T[], E> {
  const values: T[] = []
  for (const result of results) {
    if (!result.ok) return result
    values.push(result.value)
  }
  return ok(values)
}

export class UnwrapError extends Error {
  constructor(readonly reason: unknown) {
    super(`Attempted to unwrap a failed Result: ${JSON.stringify(reason)}`)
    this.name = 'UnwrapError'
  }
}

/** Test-and-composition-root helper. Never call this inside a use case. */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (!result.ok) throw new UnwrapError(result.error)
  return result.value
}
