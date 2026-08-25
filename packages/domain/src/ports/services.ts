import type { JsonValue } from '../kit/json.js'

/**
 * Ports for the three things a pure domain cannot produce for itself: the
 * time, an identifier, and a gap-free counter. Injecting them is what makes a
 * use case replayable -- the eval suite runs the same scenario on the same
 * "day" with the same ids on every execution, so a failing run is a real
 * regression rather than a clock tick.
 */
export interface Clock {
  now(): Date
}

export interface IdGenerator {
  next(): string
}

/**
 * Allocates the next value of a named counter. The implementation must be
 * transactional and serialised, because fiscal numbering may not contain gaps
 * or duplicates -- two concurrent invoices must not receive the same number.
 */
export interface NumberSequence {
  next(name: string): Promise<number>
}

export interface IdempotencyRecord {
  readonly key: string
  readonly operation: string
  /** Hash of the request payload, so a reused key with new arguments is caught. */
  readonly requestHash: string
  readonly response: JsonValue
  readonly createdAt: Date
}

/**
 * Write tools accept an `idempotency_key` so an agent can retry a call it is
 * unsure about without posting the same settlement twice. Replaying a key with
 * a different payload is an error, not a second attempt.
 */
export interface IdempotencyStore {
  find(key: string, operation: string): Promise<IdempotencyRecord | null>
  save(record: IdempotencyRecord): Promise<void>
}
