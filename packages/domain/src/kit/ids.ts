import { z } from 'zod'
import type { Brand } from './scaled.js'

/**
 * Identifiers are branded so the compiler refuses to accept a customer id
 * where a supplier id belongs -- a mistake that is invisible when every id is
 * just `string`, and one an agent assembling tool arguments will eventually
 * make.
 */
export type TenantId = Brand<string, 'TenantId'>
export type UserId = Brand<string, 'UserId'>
export type ProductId = Brand<string, 'ProductId'>
export type CustomerId = Brand<string, 'CustomerId'>
export type SupplierId = Brand<string, 'SupplierId'>
export type SalesOrderId = Brand<string, 'SalesOrderId'>
export type SalesOrderItemId = Brand<string, 'SalesOrderItemId'>
export type PurchaseOrderId = Brand<string, 'PurchaseOrderId'>
export type PurchaseOrderItemId = Brand<string, 'PurchaseOrderItemId'>
export type StockMovementId = Brand<string, 'StockMovementId'>
export type ReceivableId = Brand<string, 'ReceivableId'>
export type PayableId = Brand<string, 'PayableId'>
export type SettlementId = Brand<string, 'SettlementId'>
export type CashSessionId = Brand<string, 'CashSessionId'>
export type FiscalDocumentId = Brand<string, 'FiscalDocumentId'>
export type DomainEventId = Brand<string, 'DomainEventId'>
export type AgentRunId = Brand<string, 'AgentRunId'>

export type AnyId =
  | TenantId
  | UserId
  | ProductId
  | CustomerId
  | SupplierId
  | SalesOrderId
  | SalesOrderItemId
  | PurchaseOrderId
  | PurchaseOrderItemId
  | StockMovementId
  | ReceivableId
  | PayableId
  | SettlementId
  | CashSessionId
  | FiscalDocumentId
  | DomainEventId
  | AgentRunId

/**
 * Attaches a brand to a string that is already known to be an identifier --
 * a database row, a validated request field. Not a validation step.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the parameter IS the point: it names the brand the caller wants back
export function asId<T extends AnyId>(value: string): T {
  return value as T
}

export const uuidSchema = z.uuid()

/** A SKU is user-authored, so it is normalised rather than merely accepted. */
export type Sku = Brand<string, 'Sku'>

/** For values read back out of the database, which are already normalised. */
export function asSku(value: string): Sku {
  return value as Sku
}

export const skuSchema = z
  .string()
  .trim()
  .min(1, 'SKU is required.')
  .max(32, 'SKU must be at most 32 characters.')
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
    'SKU may contain letters, digits, dot, dash and underscore.',
  )
  .transform((value) => value.toUpperCase() as Sku)
