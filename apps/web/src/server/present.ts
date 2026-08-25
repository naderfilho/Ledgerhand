import 'server-only'

import type { PurchaseOrder, SalesOrder, TitleView } from '@ledgerhand/domain'

/**
 * ---------------------------------------------------------------------------
 * Presenters
 * ---------------------------------------------------------------------------
 * Domain objects hold branded bigints, which React cannot serialise across the
 * server/client boundary. The conversion used to live here; it now lives in
 * `@ledgerhand/domain/views`, because the MCP server and the HTTP API need the
 * very same one. A model reading `outstanding: "1234.50"` through a tool and a
 * person reading it in a table are looking at one function's output, not at
 * two implementations that agree until the day they do not.
 *
 * What stays here is the part that is genuinely about this UI: which badge
 * tone a status deserves. That is a decision about colour, and colour is not a
 * domain concept.
 */

export {
  presentAlert,
  presentBalance,
  presentCashSession,
  presentFiscalDocument,
  presentMovement,
  presentParty,
  presentProduct,
  presentPurchaseOrder,
  presentSalesOrder,
  presentSettlement,
  presentStockRow,
  presentTitle,
} from '@ledgerhand/domain'

export type {
  CashSessionView,
  FiscalDocumentView,
  MovementView,
  PartyView,
  ProductView,
  PurchaseOrderItemView,
  PurchaseOrderView,
  SalesOrderItemView,
  SalesOrderView,
  SettlementView,
  StockAlertView,
  StockBalanceView,
  StockRowView,
  TitleView,
} from '@ledgerhand/domain'

export type Tone = 'neutral' | 'primary' | 'positive' | 'warning' | 'danger' | 'info'

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

export function titleTone(title: Pick<TitleView, 'status' | 'overdue'>): Tone {
  if (title.status === 'settled') return 'positive'
  if (title.status === 'cancelled') return 'neutral'
  if (title.overdue) return 'danger'
  return title.status === 'partially_settled' ? 'warning' : 'info'
}
