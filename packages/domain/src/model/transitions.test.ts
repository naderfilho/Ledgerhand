import { describe, expect, it } from 'vitest'
import { unsafeBusinessDate } from '../kit/business-date.js'
import { asId, type PurchaseOrderItemId, type SettlementId } from '../kit/ids.js'
import { moneyFromCents, ZERO_MONEY } from '../kit/money.js'
import { quantityFromThousandths, ZERO_QUANTITY } from '../kit/quantity.js'
import { unitCostFromMillionths } from '../kit/unit-value.js'
import {
  applySettlement,
  describeTitle,
  isOverdue,
  isSettled,
  outstandingAmount,
  reverseSettlement,
  type Receivable,
  type Settlement,
} from './finance.js'
import { closeCashSession, expectedClosingBalance, type CashSession } from './cash.js'
import {
  cancelPurchaseOrder,
  hasAnyReceipt,
  outstandingQuantity,
  placePurchaseOrder,
  purchaseOrderTotal,
  receivePurchaseOrder,
  type PurchaseOrder,
  type PurchaseOrderItem,
} from './purchase-order.js'
import { requireEditable, salesOrderTotal, reservesStock } from './sales-order.js'

const AT = new Date('2026-03-16T12:00:00.000Z')
const TODAY = unsafeBusinessDate('2026-03-16')
const ID = (suffix: string): string => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`

const aTitle = (overrides: Partial<Receivable> = {}): Receivable => ({
  id: asId(ID('1')),
  kind: 'receivable',
  tenantId: asId(ID('9')),
  customerId: asId(ID('2')),
  salesOrderId: asId(ID('3')),
  amount: moneyFromCents(10_000n),
  settledAmount: ZERO_MONEY,
  issuedOn: TODAY,
  dueDate: TODAY,
  status: 'open',
  description: 'Sales order SO-000001',
  instalment: 1,
  instalments: 1,
  createdAt: AT,
  updatedAt: AT,
  ...overrides,
})

const aSettlement = (overrides: Partial<Settlement> = {}): Settlement => ({
  id: asId<SettlementId>(ID('5')),
  tenantId: asId(ID('9')),
  titleKind: 'receivable',
  titleId: ID('1'),
  amount: moneyFromCents(4000n),
  settledOn: TODAY,
  method: 'pix',
  note: null,
  reversedAt: null,
  reversalReason: null,
  createdAt: AT,
  ...overrides,
})

describe('title state', () => {
  it('reports outstanding, settled and overdue consistently', () => {
    const partly = aTitle({ settledAmount: moneyFromCents(4000n), status: 'partially_settled' })
    expect(outstandingAmount(partly)).toBe(moneyFromCents(6000n))
    expect(isSettled(partly)).toBe(false)
    expect(isSettled(aTitle({ status: 'settled' }))).toBe(true)

    expect(isOverdue(aTitle({ dueDate: unsafeBusinessDate('2026-03-15') }), TODAY)).toBe(true)
    expect(isOverdue(aTitle({ dueDate: TODAY }), TODAY)).toBe(false)
    expect(
      isOverdue(aTitle({ dueDate: unsafeBusinessDate('2026-03-15'), status: 'settled' }), TODAY),
    ).toBe(false)
    expect(
      isOverdue(aTitle({ dueDate: unsafeBusinessDate('2026-03-15'), status: 'cancelled' }), TODAY),
    ).toBe(false)
  })

  it('describes a title the way the collections screen shows it', () => {
    expect(describeTitle(aTitle())).toBe('Sales order SO-000001 - 100.00 due 2026-03-16')
    expect(describeTitle(aTitle({ instalment: 2, instalments: 3 }))).toContain('(2/3)')
  })

  it('refuses to settle a cancelled title', () => {
    const result = applySettlement(aTitle({ status: 'cancelled' }), moneyFromCents(100n), AT)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('INVALID_STATE_TRANSITION')
  })

  it('refuses a zero or negative settlement', () => {
    expect(applySettlement(aTitle(), ZERO_MONEY, AT).ok).toBe(false)
    expect(applySettlement(aTitle(), moneyFromCents(-1n), AT).ok).toBe(false)
  })
})

describe('reverseSettlement', () => {
  it('refuses to reverse the same settlement twice', () => {
    const settlement = aSettlement({ reversedAt: AT })
    const result = reverseSettlement(aTitle(), settlement, 'again', AT)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('SETTLEMENT_ALREADY_REVERSED')
  })

  it('refuses a settlement that belongs to a different title', () => {
    const result = reverseSettlement(aTitle(), aSettlement({ titleId: ID('7') }), 'mismatch', AT)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('does not belong')
  })

  it('demands a reason for the audit trail', () => {
    const title = aTitle({ settledAmount: moneyFromCents(4000n), status: 'partially_settled' })
    const result = reverseSettlement(title, aSettlement(), '   ', AT)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('requires a reason')
  })

  it('refuses to drive the settled amount below zero', () => {
    const result = reverseSettlement(
      aTitle(),
      aSettlement({ amount: moneyFromCents(9999n) }),
      'x y z',
      AT,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('negative settled amount')
  })

  it('returns a partly settled title to open', () => {
    const title = aTitle({ settledAmount: moneyFromCents(4000n), status: 'partially_settled' })
    const result = reverseSettlement(title, aSettlement(), 'Cheque bounced', AT)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.title.status).toBe('open')
    expect(result.value.settlement.reversalReason).toBe('Cheque bounced')
  })
})

describe('cash session arithmetic', () => {
  const aSession = (overrides: Partial<CashSession> = {}): CashSession => ({
    id: asId(ID('4')),
    tenantId: asId(ID('9')),
    businessDate: TODAY,
    status: 'open',
    openingBalance: moneyFromCents(10_000n),
    inflow: moneyFromCents(5000n),
    outflow: moneyFromCents(2000n),
    closingBalance: null,
    countedBalance: null,
    difference: null,
    unsettledTitles: 0,
    justification: null,
    openedAt: AT,
    openedBy: asId(ID('2')),
    closedAt: null,
    closedBy: null,
    ...overrides,
  })

  it('computes the expected closing balance', () => {
    expect(expectedClosingBalance(aSession())).toBe(moneyFromCents(13_000n))
  })

  it('mentions the time of the previous close when refusing a second one', () => {
    const closed = aSession({ status: 'closed', closedAt: AT })
    const result = closeCashSession(
      closed,
      { unsettledTitles: 0, justification: null, countedBalance: null, closedBy: asId(ID('2')) },
      AT,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain(AT.toISOString())
  })
})

describe('purchase order transitions', () => {
  const anItem = (overrides: Partial<PurchaseOrderItem> = {}): PurchaseOrderItem => ({
    id: asId<PurchaseOrderItemId>(ID('6')),
    productId: asId(ID('7')),
    sku: 'SKU-1',
    description: 'Widget',
    quantity: quantityFromThousandths(10_000n),
    receivedQuantity: ZERO_QUANTITY,
    unitCost: unitCostFromMillionths(2_000_000n),
    total: moneyFromCents(2000n),
    ...overrides,
  })

  const anOrder = (overrides: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
    id: asId(ID('8')),
    tenantId: asId(ID('9')),
    number: 'PO-000001',
    supplierId: asId(ID('a')),
    status: 'placed',
    issuedOn: TODAY,
    expectedOn: null,
    items: [anItem()],
    total: moneyFromCents(2000n),
    notes: null,
    placedAt: AT,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  })

  it('refuses to place an order with no items', () => {
    const result = placePurchaseOrder(anOrder({ status: 'draft', items: [] }), AT)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('ORDER_HAS_NO_ITEMS')
  })

  it('refuses to place an order that is already placed', () => {
    expect(placePurchaseOrder(anOrder(), AT).ok).toBe(false)
  })

  it('refuses an empty receipt against an order that could have received one', () => {
    const result = receivePurchaseOrder(anOrder(), [], AT)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_FAILED')
  })

  it('reports the state, not the empty request, when the order cannot receive at all', () => {
    const result = receivePurchaseOrder(anOrder({ status: 'received' }), [], AT)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('INVALID_STATE_TRANSITION')
  })

  it('reports a receipt line that does not belong to the order', () => {
    const result = receivePurchaseOrder(
      anOrder(),
      [
        {
          itemId: asId<PurchaseOrderItemId>(ID('b')),
          quantity: quantityFromThousandths(1000n),
          unitCost: null,
        },
      ],
      AT,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND')
  })

  it('refuses a non-positive received quantity and a negative unit cost', () => {
    const itemId = asId<PurchaseOrderItemId>(ID('6'))
    expect(
      receivePurchaseOrder(anOrder(), [{ itemId, quantity: ZERO_QUANTITY, unitCost: null }], AT).ok,
    ).toBe(false)
    expect(
      receivePurchaseOrder(
        anOrder(),
        [
          {
            itemId,
            quantity: quantityFromThousandths(1000n),
            unitCost: unitCostFromMillionths(-1n),
          },
        ],
        AT,
      ).ok,
    ).toBe(false)
  })

  it('accumulates two receipts against the same line in one call', () => {
    const itemId = asId<PurchaseOrderItemId>(ID('6'))
    const result = receivePurchaseOrder(
      anOrder(),
      [
        { itemId, quantity: quantityFromThousandths(6000n), unitCost: null },
        { itemId, quantity: quantityFromThousandths(4000n), unitCost: null },
      ],
      AT,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.fullyReceived).toBe(true)
    expect(result.value.order.status).toBe('received')
  })

  it('refuses to cancel an order that is finished or already cancelled', () => {
    expect(cancelPurchaseOrder(anOrder({ status: 'received' }), 'no', AT).ok).toBe(false)
    expect(cancelPurchaseOrder(anOrder({ status: 'cancelled' }), 'no', AT).ok).toBe(false)
  })

  it('demands a reason when cancelling', () => {
    const result = cancelPurchaseOrder(anOrder(), '   ', AT)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_FAILED')
  })

  it('exposes the outstanding quantity and whether anything has arrived', () => {
    const partly = anItem({ receivedQuantity: quantityFromThousandths(3000n) })
    expect(outstandingQuantity(partly)).toBe(quantityFromThousandths(7000n))
    expect(hasAnyReceipt([partly])).toBe(true)
    expect(hasAnyReceipt([anItem()])).toBe(false)
    expect(purchaseOrderTotal([])).toBe(ZERO_MONEY)
  })
})

describe('sales order helpers', () => {
  it('reports which status holds a reservation', () => {
    expect(reservesStock('confirmed')).toBe(true)
    expect(reservesStock('draft')).toBe(false)
    expect(reservesStock('invoiced')).toBe(false)
  })

  it('totals an empty order as zero', () => {
    expect(salesOrderTotal([])).toBe(ZERO_MONEY)
  })

  it('treats a cancelled order as not editable', () => {
    const order = {
      status: 'cancelled' as const,
      number: 'SO-000001',
    }
    const result = requireEditable(order as never)
    expect(result.ok).toBe(false)
  })
})
