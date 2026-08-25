/**
 * The serialisable subset shared by event payloads, error details and audit
 * records. Anything crossing the process boundary must fit in here.
 */
export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue }
export type JsonObject = Record<string, JsonValue>
