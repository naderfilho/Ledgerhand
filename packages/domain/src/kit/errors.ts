import type { JsonValue } from './json.js'

/**
 * Every way this domain is allowed to say "no". The list is closed on purpose:
 * the MCP server maps codes to guidance for the model, the UI maps them to
 * field-level messages, and the eval suite asserts on them. A new failure mode
 * has to be named here before it can happen.
 */
export const DOMAIN_ERROR_CODES = [
  // Access and input
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'PRECISION_EXCEEDED',
  'DUPLICATE_KEY',
  'CONCURRENCY_CONFLICT',
  'IDEMPOTENCY_KEY_REUSED',
  // Catalog
  'PRODUCT_ARCHIVED',
  'PRODUCT_IN_USE',
  // Stock
  'INSUFFICIENT_STOCK',
  'NEGATIVE_STOCK',
  'RESERVATION_EXCEEDS_BALANCE',
  'ADJUSTMENT_REASON_REQUIRED',
  // Sales and purchasing
  'INVALID_STATE_TRANSITION',
  'ORDER_HAS_NO_ITEMS',
  'REVERSAL_REASON_REQUIRED',
  'OVER_RECEIPT',
  // Finance
  'OVER_SETTLEMENT',
  'TITLE_ALREADY_SETTLED',
  'SETTLEMENT_ALREADY_REVERSED',
  'CASH_SESSION_ALREADY_OPEN',
  'CASH_SESSION_NOT_OPEN',
  'CASH_SESSION_ALREADY_CLOSED',
  'OPEN_TITLES_REQUIRE_JUSTIFICATION',
  // Fiscal
  'FISCAL_SEQUENCE_CONFLICT',
] as const

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number]

const KNOWN_CODES: ReadonlySet<string> = new Set(DOMAIN_ERROR_CODES)

/**
 * `message` is written for two readers at once: a person looking at a form and
 * a language model deciding what to do next. It states what was refused and,
 * where possible, what would make the request succeed.
 */
export interface DomainError {
  readonly code: DomainErrorCode
  readonly message: string
  readonly details: Readonly<Record<string, JsonValue>>
}

export function domainError(
  code: DomainErrorCode,
  message: string,
  details: Readonly<Record<string, JsonValue>> = {},
): DomainError {
  return { code, message, details }
}

export function isDomainError(value: unknown): value is DomainError {
  if (typeof value !== 'object' || value === null || !('code' in value)) return false
  return typeof value.code === 'string' && KNOWN_CODES.has(value.code)
}

export const notFound = (entity: string, id: string): DomainError =>
  domainError('NOT_FOUND', `${entity} ${id} does not exist.`, { entity, id })

export const forbidden = (capability: string, role: string): DomainError =>
  domainError(
    'FORBIDDEN',
    `Role "${role}" is not allowed to perform "${capability}". Ask a user with the required role.`,
    { capability, role },
  )

export const validationFailed = (
  message: string,
  details: Readonly<Record<string, JsonValue>> = {},
): DomainError => domainError('VALIDATION_FAILED', message, details)
