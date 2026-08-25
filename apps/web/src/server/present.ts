import 'server-only'

import {
  formatMoney,
  formatQuantity,
  formatUnitValue,
  outstandingAmount,
  type CashSession,
  type Customer,
  type FiscalDocument,
  type Payable,
  type Product,
  type PurchaseOrder,
  type Receivable,
  type SalesOrder,
  type StockAlert,
  type StockBalance,
  type StockMovement,
  type Supplier,
} from '@ledgerhand/domain'

/**
 * ---------------------------------------------------------------------------
 * Presenters
 * ---------------------------------------------------------------------------
 * Domain objects hold branded bigints, which React cannot serialise across the
 * server/client boundary. Rather than sprinkle `.toString()` through the JSX,
 * every value crossing that boundary is converted here, once, into a plain
 * object of canonical decimal strings.
 *
 * The layer earns its keep twice: it is also where a status becomes a badge
 * tone, so "overdue is amber" is decided in one place instead of in nine
 * tables.
 */

export type Tone = 'neutral' | 'primary' | 'positive' | 'warning' | 'danger' | 'info'

export interface ProductView {
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

export interface PartyView {
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

export interface StockRowView {
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

export function presentStockRow(
  product: Product,
  balance: StockBalance,
  available: bigint,
  value: bigint,
): StockRowView {
  return {
    productId: product.id,
    sku: product.sku,
    name: product.name,
    unit: product.unit,
    onHand: formatQuantity(balance.onHand),
    reserved: formatQuantity(balance.reserved),
    available: formatQuantity(available as never),
    averageCost: formatUnitValue(balance.averageCost),
    value: formatMoney(value as never),
    minimumStock: formatQuantity(product.minimumStock),
    belowMinimum: balance.onHand < product.minimumStock,
  }
}

export interface StockAlertView {
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

export interface MovementView {
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
    reference: movement.reference,
  }
}

export interface SalesOrderItemView {
  readonly id: string
  readonly productId: string
  readonly sku: string
  readonly description: string
  readonly quantity: string
  readonly unitPrice: string
  readonly discount: string
  readonly total: string
}

export interface SalesOrderView {
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

export function presentSalesOrder(order: SalesOrder, customerName: string): SalesOrderView {
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

export function salesOrderTone(status: SalesOrder['status']): Tone {
  switch (status) {
    case 'draft':
      return 'neutral'
    case 'confirmed':
      return 'info'
    case 'invoiced':
      return 'positive'
    case 'cancelled':
      return 'danger'
  }
}

export interface PurchaseOrderItemView {
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

export interface PurchaseOrderView {
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

export function presentPurchaseOrder(
  order: PurchaseOrder,
  supplierName: string,
): PurchaseOrderView {
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
      outstanding: formatQuantity((item.quantity - item.receivedQuantity) as never),
      unitCost: formatUnitValue(item.unitCost),
      total: formatMoney(item.total),
    })),
  }
}

export function purchaseOrderTone(status: PurchaseOrder['status']): Tone {
  switch (status) {
    case 'draft':
      return 'neutral'
    case 'placed':
      return 'info'
    case 'partially_received':
      return 'warning'
    case 'received':
      return 'positive'
    case 'cancelled':
      return 'danger'
  }
}

export interface TitleView {
  readonly id: string
  readonly kind: 'receivable' | 'payable'
  readonly partyId: string
  readonly partyName: string
  readonly description: string
  readonly amount: string
  readonly settledAmount: string
  readonly outstanding: string
  readonly issuedOn: string
  readonly dueDate: string
  readonly status: Receivable['status']
  readonly instalment: number
  readonly instalments: number
  readonly overdue: boolean
}

export function presentTitle(
  title: Receivable | Payable,
  partyName: string,
  today: string,
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
    overdue: open && title.dueDate < today,
  }
}

export function titleTone(title: Pick<TitleView, 'status' | 'overdue'>): Tone {
  if (title.status === 'settled') return 'positive'
  if (title.status === 'cancelled') return 'neutral'
  if (title.overdue) return 'danger'
  return title.status === 'partially_settled' ? 'warning' : 'info'
}

export interface CashSessionView {
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

export function presentCashSession(session: CashSession, expectedClosing: bigint): CashSessionView {
  return {
    id: session.id,
    businessDate: session.businessDate,
    status: session.status,
    openingBalance: formatMoney(session.openingBalance),
    inflow: formatMoney(session.inflow),
    outflow: formatMoney(session.outflow),
    closingBalance: formatMoney((session.closingBalance ?? expectedClosing) as never),
    countedBalance: session.countedBalance === null ? null : formatMoney(session.countedBalance),
    difference: session.difference === null ? null : formatMoney(session.difference),
    unsettledTitles: session.unsettledTitles,
    justification: session.justification,
  }
}

export interface FiscalDocumentView {
  readonly id: string
  readonly label: string
  readonly series: string
  readonly number: string
  readonly total: string
  readonly status: FiscalDocument['status']
  readonly issuedAt: string
}

export function presentFiscalDocument(document: FiscalDocument): FiscalDocumentView {
  return {
    id: document.id,
    label: `${document.series}-${document.number}`,
    series: document.series,
    number: document.number,
    total: formatMoney(document.total),
    status: document.status,
    issuedAt: document.issuedAt.toISOString(),
  }
}
