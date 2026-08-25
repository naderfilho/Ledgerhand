/* eslint-disable @typescript-eslint/consistent-type-definitions -- see the note below */
import type { BusinessDate } from '../kit/business-date.js'
import type { JsonObject, JsonValue } from '../kit/json.js'
import { formatMoney, type Money } from '../kit/money.js'
import { formatQuantity, type Quantity } from '../kit/quantity.js'
import { formatUnitValue, type UnitCost } from '../kit/unit-value.js'
import type { CashSession } from '../model/cash.js'
import { outstandingAmount, type Settlement, type Title } from '../model/finance.js'
import { fiscalDocumentLabel, type FiscalDocument } from '../model/fiscal.js'
import type { Customer, Supplier } from '../model/party.js'
import type { Product } from '../model/product.js'
import type { PurchaseOrder } from '../model/purchase-order.js'
import type { SalesOrder } from '../model/sales-order.js'
import type { StockAlert, StockBalance, StockMovement } from '../model/stock.js'
import type { CashFlowRow, PersistedEvent, SalesByPeriodRow } from '../ports/repositories.js'

/**
 * ---------------------------------------------------------------------------
 * Views
 * ---------------------------------------------------------------------------
 * A domain object holds branded bigints: `Money` is an integer number of
 * cents, a `Quantity` is thousandths, a unit price is millionths. None of that
 * survives `JSON.stringify`, and none of it should ever reach a reader --
 * human or model -- as a raw integer.
 *
 * So every value that leaves the domain is converted here, once, into
 * canonical decimal strings. The web UI, the HTTP API and the MCP server all
 * use these same functions, which makes a useful promise true: the numbers a
 * language model reads through a tool are the numbers on the screen, produced
 * by the same code rather than by a second implementation that might round
 * differently.
 *
 * Formatting for a locale is deliberately NOT done here. `"1234.50"` is
 * unambiguous everywhere; `"1.234,50"` is a decision for the layer that knows
 * who is reading.
 *
 * The views are type aliases rather than interfaces, against the house style,
 * for a reason the compiler enforces: an interface has no implicit index
 * signature, so it cannot be assigned to `JsonValue`. Since being JSON is the
 * entire purpose of this module, the alias wins.
 */

export type ProductView = {
  readonly id: string
  readonly sku: string
  readonly name: string
  readonly description: string | null
  readonly unit: string
  readonly salePrice: string
  readonly minimumStock: string
  readonly active: boolean
}

export function presentProduct(product: Product): ProductView {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    unit: product.unit,
    salePrice: formatUnitValue(product.salePrice),
    minimumStock: formatQuantity(product.minimumStock),
    active: product.active,
  }
}

export type PartyView = {
  readonly id: string
  readonly name: string
  readonly taxId: string | null
  readonly email: string | null
  readonly phone: string | null
  readonly paymentTermDays: number
  readonly active: boolean
}

export function presentParty(party: Customer | Supplier): PartyView {
  return {
    id: party.id,
    name: party.name,
    taxId: party.taxId,
    email: party.email,
    phone: party.phone,
    paymentTermDays: party.paymentTermDays,
    active: party.active,
  }
}

export type StockBalanceView = {
  readonly productId: string
  readonly onHand: string
  readonly reserved: string
  readonly averageCost: string
  readonly updatedAt: string
}

export function presentBalance(balance: StockBalance): StockBalanceView {
  return {
    productId: balance.productId,
    onHand: formatQuantity(balance.onHand),
    reserved: formatQuantity(balance.reserved),
    averageCost: formatUnitValue(balance.averageCost),
    updatedAt: balance.updatedAt.toISOString(),
  }
}

export type StockRowView = {
  readonly productId: string
  readonly sku: string
  readonly name: string
  readonly unit: string
  readonly onHand: string
  readonly reserved: string
  readonly available: string
  readonly averageCost: string
  readonly value: string
  readonly minimumStock: string
  readonly belowMinimum: boolean
}

export interface StockLine {
  readonly onHand: Quantity
  readonly reserved: Quantity
  readonly available: Quantity
  readonly averageCost: UnitCost
  readonly value: Money
}

export function presentStockLine(product: Product, line: StockLine): StockRowView {
  return {
    productId: product.id,
    sku: product.sku,
    name: product.name,
    unit: product.unit,
    onHand: formatQuantity(line.onHand),
    reserved: formatQuantity(line.reserved),
    available: formatQuantity(line.available),
    averageCost: formatUnitValue(line.averageCost),
    value: formatMoney(line.value),
    minimumStock: formatQuantity(product.minimumStock),
    belowMinimum: line.onHand < product.minimumStock,
  }
}

export function presentStockRow(
  product: Product,
  balance: StockBalance,
  available: Quantity,
  value: Money,
): StockRowView {
  return presentStockLine(product, {
    onHand: balance.onHand,
    reserved: balance.reserved,
    available,
    averageCost: balance.averageCost,
    value,
  })
}

export type StockAlertView = {
  readonly productId: string
  readonly sku: string
  readonly name: string
  readonly onHand: string
  readonly minimumStock: string
  readonly shortfall: string
}

export function presentAlert(alert: StockAlert): StockAlertView {
  return {
    productId: alert.productId,
    sku: alert.sku,
    name: alert.name,
    onHand: formatQuantity(alert.onHand),
    minimumStock: formatQuantity(alert.minimumStock),
    shortfall: formatQuantity(alert.shortfall),
  }
}

export type MovementView = {
  readonly id: string
  readonly productId: string
  readonly kind: string
  readonly reason: string
  readonly quantity: string
  readonly unitCost: string
  readonly totalCost: string
  readonly onHandAfter: string
  readonly occurredAt: string
  readonly note: string | null
  readonly reference: { readonly kind: string; readonly id: string } | null
}

export function presentMovement(movement: StockMovement): MovementView {
  return {
    id: movement.id,
    productId: movement.productId,
    kind: movement.kind,
    reason: movement.reason,
    quantity: formatQuantity(movement.quantity),
    unitCost: formatUnitValue(movement.unitCost),
    totalCost: formatMoney(movement.totalCost),
    onHandAfter: formatQuantity(movement.onHandAfter),
    occurredAt: movement.occurredAt.toISOString(),
    note: movement.note,
    reference:
      movement.reference === null
        ? null
        : { kind: movement.reference.kind, id: movement.reference.id },
  }
}

export type SalesOrderItemView = {
  readonly id: string
  readonly productId: string
  readonly sku: string
  readonly description: string
  readonly quantity: string
  readonly unitPrice: string
  readonly discount: string
  readonly total: string
}

export type SalesOrderView = {
  readonly id: string
  readonly number: string
  readonly customerId: string
  readonly customerName: string
  readonly status: SalesOrder['status']
  readonly issuedOn: string
  readonly total: string
  readonly instalments: number
  readonly notes: string | null
  readonly itemCount: number
  readonly items: readonly SalesOrderItemView[]
  readonly cancellationReason: string | null
  readonly hasFiscalDocument: boolean
}

export function presentSalesOrder(order: SalesOrder, customerName = ''): SalesOrderView {
  return {
    id: order.id,
    number: order.number,
    customerId: order.customerId,
    customerName,
    status: order.status,
    issuedOn: order.issuedOn,
    total: formatMoney(order.total),
    instalments: order.instalments,
    notes: order.notes,
    itemCount: order.items.length,
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      sku: item.sku,
      description: item.description,
      quantity: formatQuantity(item.quantity),
      unitPrice: formatUnitValue(item.unitPrice),
      discount: formatMoney(item.discount),
      total: formatMoney(item.total),
    })),
    cancellationReason: order.cancellationReason,
    hasFiscalDocument: order.fiscalDocumentId !== null,
  }
}

export type PurchaseOrderItemView = {
  readonly id: string
  readonly productId: string
  readonly sku: string
  readonly description: string
  readonly quantity: string
  readonly receivedQuantity: string
  readonly outstanding: string
  readonly unitCost: string
  readonly total: string
}

export type PurchaseOrderView = {
  readonly id: string
  readonly number: string
  readonly supplierId: string
  readonly supplierName: string
  readonly status: PurchaseOrder['status']
  readonly issuedOn: string
  readonly expectedOn: string | null
  readonly total: string
  readonly notes: string | null
  readonly itemCount: number
  readonly items: readonly PurchaseOrderItemView[]
}

export function presentPurchaseOrder(order: PurchaseOrder, supplierName = ''): PurchaseOrderView {
  return {
    id: order.id,
    number: order.number,
    supplierId: order.supplierId,
    supplierName,
    status: order.status,
    issuedOn: order.issuedOn,
    expectedOn: order.expectedOn,
    total: formatMoney(order.total),
    notes: order.notes,
    itemCount: order.items.length,
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      sku: item.sku,
      description: item.description,
      quantity: formatQuantity(item.quantity),
      receivedQuantity: formatQuantity(item.receivedQuantity),
      outstanding: formatQuantity((item.quantity - item.receivedQuantity) as Quantity),
      unitCost: formatUnitValue(item.unitCost),
      total: formatMoney(item.total),
    })),
  }
}

export type TitleView = {
  readonly id: string
  readonly kind: 'receivable' | 'payable'
  readonly partyId: string
  readonly partyName: string | null
  readonly description: string
  readonly amount: string
  readonly settledAmount: string
  readonly outstanding: string
  readonly issuedOn: string
  readonly dueDate: string
  readonly status: Title['status']
  readonly instalment: number
  readonly instalments: number
  readonly overdue: boolean
}

/**
 * `partyName` and `asOf` are optional because the finance queries return
 * titles alone: a caller that has not loaded the customer cannot invent a
 * name, and a caller with no business date cannot honestly say what is
 * overdue. Both degrade to null and false rather than to a guess.
 */
export function presentTitle(
  title: Title,
  partyName: string | null = null,
  asOf: BusinessDate | null = null,
): TitleView {
  const open = title.status === 'open' || title.status === 'partially_settled'
  return {
    id: title.id,
    kind: title.kind,
    partyId: title.kind === 'receivable' ? title.customerId : title.supplierId,
    partyName,
    description: title.description,
    amount: formatMoney(title.amount),
    settledAmount: formatMoney(title.settledAmount),
    outstanding: formatMoney(outstandingAmount(title)),
    issuedOn: title.issuedOn,
    dueDate: title.dueDate,
    status: title.status,
    instalment: title.instalment,
    instalments: title.instalments,
    overdue: open && asOf !== null && title.dueDate < asOf,
  }
}

export type SettlementView = {
  readonly id: string
  readonly titleKind: string
  readonly titleId: string
  readonly amount: string
  readonly settledOn: string
  readonly method: string
  readonly note: string | null
  readonly reversedAt: string | null
  readonly reversalReason: string | null
}

export function presentSettlement(settlement: Settlement): SettlementView {
  return {
    id: settlement.id,
    titleKind: settlement.titleKind,
    titleId: settlement.titleId,
    amount: formatMoney(settlement.amount),
    settledOn: settlement.settledOn,
    method: settlement.method,
    note: settlement.note,
    reversedAt: settlement.reversedAt === null ? null : settlement.reversedAt.toISOString(),
    reversalReason: settlement.reversalReason,
  }
}

export type CashSessionView = {
  readonly id: string
  readonly businessDate: string
  readonly status: 'open' | 'closed'
  readonly openingBalance: string
  readonly inflow: string
  readonly outflow: string
  readonly closingBalance: string
  readonly countedBalance: string | null
  readonly difference: string | null
  readonly unsettledTitles: number
  readonly justification: string | null
}

/**
 * A day that is still open has no recorded closing balance, so the caller
 * passes the expected one -- opening plus inflow minus outflow -- and the view
 * reports that instead of a null the reader would have to compute around.
 */
export function presentCashSession(session: CashSession, expectedClosing: Money): CashSessionView {
  return {
    id: session.id,
    businessDate: session.businessDate,
    status: session.status,
    openingBalance: formatMoney(session.openingBalance),
    inflow: formatMoney(session.inflow),
    outflow: formatMoney(session.outflow),
    closingBalance: formatMoney(session.closingBalance ?? expectedClosing),
    countedBalance: session.countedBalance === null ? null : formatMoney(session.countedBalance),
    difference: session.difference === null ? null : formatMoney(session.difference),
    unsettledTitles: session.unsettledTitles,
    justification: session.justification,
  }
}

export type FiscalDocumentView = {
  readonly id: string
  readonly label: string
  readonly series: string
  readonly number: string
  readonly salesOrderId: string
  readonly total: string
  readonly status: FiscalDocument['status']
  readonly issuedAt: string
  readonly cancelledAt: string | null
  readonly cancellationReason: string | null
}

export function presentFiscalDocument(document: FiscalDocument): FiscalDocumentView {
  return {
    id: document.id,
    label: fiscalDocumentLabel(document),
    series: document.series,
    number: document.number,
    salesOrderId: document.salesOrderId,
    total: formatMoney(document.total),
    status: document.status,
    issuedAt: document.issuedAt.toISOString(),
    cancelledAt: document.cancelledAt === null ? null : document.cancelledAt.toISOString(),
    cancellationReason: document.cancellationReason,
  }
}

export type SalesPeriodRowView = {
  readonly period: string
  readonly orderCount: number
  readonly gross: string
  readonly discount: string
  readonly net: string
  readonly cost: string
  readonly margin: string
}

export function presentSalesPeriodRow(row: SalesByPeriodRow): SalesPeriodRowView {
  return {
    period: row.period,
    orderCount: row.orderCount,
    gross: formatMoney(row.gross),
    discount: formatMoney(row.discount),
    net: formatMoney(row.net),
    cost: formatMoney(row.cost),
    margin: formatMoney(row.margin),
  }
}

export type CashFlowRowView = {
  readonly businessDate: string
  readonly openingBalance: string
  readonly inflow: string
  readonly outflow: string
  readonly closingBalance: string
  readonly status: 'open' | 'closed'
}

export function presentCashFlowRow(row: CashFlowRow): CashFlowRowView {
  return {
    businessDate: row.businessDate,
    openingBalance: formatMoney(row.openingBalance),
    inflow: formatMoney(row.inflow),
    outflow: formatMoney(row.outflow),
    closingBalance: formatMoney(row.closingBalance),
    status: row.status,
  }
}

export type EventView = {
  readonly id: string
  readonly type: string
  readonly aggregateType: string
  readonly aggregateId: string
  readonly payload: JsonObject
  readonly actorKind: 'user' | 'agent' | 'system'
  readonly actorId: string | null
  readonly agentRunId: string | null
  readonly occurredAt: string
}

export function presentEvent(event: PersistedEvent): EventView {
  return {
    id: event.id,
    type: event.type,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    // Event payloads are written as JSON and read back as JSON; the port types
    // the value as `unknown` only because it cannot prove that at compile time.
    payload: event.payload as JsonObject,
    actorKind: event.actorKind,
    actorId: event.actorId,
    agentRunId: event.agentRunId,
    occurredAt: event.occurredAt.toISOString(),
  }
}

/** The shape every paginated list use case returns, once presented. */
export function presentPage<T, V extends JsonValue>(
  page: { readonly rows: readonly T[]; readonly total: number },
  present: (row: T) => V,
): { readonly rows: readonly V[]; readonly total: number } {
  return { rows: page.rows.map(present), total: page.total }
}
