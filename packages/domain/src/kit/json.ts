/**
 * The serialisable subset shared by event payloads, error details and audit
 * records. Anything crossing the process boundary must fit in here.
 */
export type JsonPrimitive = string | number | boolean | null
/**
 * Arrays are readonly so that a view assembled from `readonly T[]` -- which is
 * what every repository returns -- is a JSON value without being copied first.
 */
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue }
export type JsonObject = Record<string, JsonValue>

/**
 * A stable textual form of a value: object keys sorted, no incidental
 * whitespace. Two requests that differ only in the order their fields were
 * written produce the same string, and therefore the same idempotency hash --
 * which matters because the JSON a language model emits is not key-stable
 * between attempts.
 *
 * `undefined` members are dropped, exactly as `JSON.stringify` drops them, so
 * `{ note: undefined }` and `{}` are the same request.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null'

  switch (typeof value) {
    case 'string':
      return JSON.stringify(value)
    case 'number':
      return Number.isFinite(value) ? JSON.stringify(value) : 'null'
    case 'boolean':
      return value ? 'true' : 'false'
    case 'bigint':
      // Not reachable from a JSON request, but a caller that manages it should
      // get a stable string rather than a thrown TypeError.
      return JSON.stringify(value.toString())
    case 'object':
      break
    // A symbol, a function or an undefined cannot appear in JSON at all, so
    // they become null -- which is what JSON.stringify does inside an array.
    case 'symbol':
    case 'function':
    case 'undefined':
      return 'null'
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, member]) => member !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, member]) => `${JSON.stringify(key)}:${canonicalJson(member)}`)

  return `{${entries.join(',')}}`
}
