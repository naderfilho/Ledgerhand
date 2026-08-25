import { unsafeBusinessDate, type BusinessDate } from '../kit/business-date.js'
import { asId, type CustomerId, type ProductId, type Sku, type SupplierId } from '../kit/ids.js'
import { moneyFromCents, ZERO_MONEY, type Money } from '../kit/money.js'
import { quantityFromThousandths, ZERO_QUANTITY, type Quantity } from '../kit/quantity.js'
import {
  unitCostFromMillionths,
  unitPriceFromMillionths,
  type UnitCost,
  type UnitPrice,
} from '../kit/unit-value.js'
import type { CashSession } from '../model/cash.js'
import type { Customer, Supplier } from '../model/party.js'
import type { Product, ProductUnit } from '../model/product.js'
import type { Receivable } from '../model/finance.js'
import type { StockBalance } from '../model/stock.js'
import { asId as asCashId } from '../kit/ids.js'
import type { CashSessionId, ReceivableId, SalesOrderId } from '../kit/ids.js'
import type { TestHarness } from './in-memory.js'

/**
 * Builders that write straight into the store. Setting up "a product with 40
 * units in stock" through the real use cases would take three calls and make
 * every test read like a script; going through the front door is what the
 * tests under `use-cases/` are for.
 */

export const brl = (amount: string): Money => moneyFromCents(BigInt(amount.replace('.', '')))
export const qty = (value: number): Quantity =>
  quantityFromThousandths(BigInt(Math.round(value * 1000)))
export const price = (value: number): UnitPrice =>
  unitPriceFromMillionths(BigInt(Math.round(value * 1_000_000)))
export const cost = (value: number): UnitCost =>
  unitCostFromMillionths(BigInt(Math.round(value * 1_000_000)))

export interface ProductOptions {
  readonly sku?: string
  readonly name?: string
  readonly unit?: ProductUnit
  readonly salePrice?: UnitPrice
  readonly minimumStock?: Quantity
  readonly active?: boolean
  readonly onHand?: Quantity
  readonly reserved?: Quantity
  readonly averageCost?: UnitCost
}

let productCounter = 0

export function aProduct(harness: TestHarness, options: ProductOptions = {}): Product {
  productCounter += 1
  const id = asId<ProductId>(harness.context.uow.ids.next())
  const product: Product = {
    id,
    tenantId: harness.context.tenantId,
    sku: (options.sku ?? `SKU-${String(productCounter).padStart(3, '0')}`) as Sku,
    name: options.name ?? `Product ${String(productCounter)}`,
    description: null,
    unit: options.unit ?? 'unit',
    salePrice: options.salePrice ?? price(100),
    minimumStock: options.minimumStock ?? ZERO_QUANTITY,
    active: options.active ?? true,
    createdAt: harness.context.now,
    updatedAt: harness.context.now,
  }
  harness.db.products.set(id, product)

  if (
    options.onHand !== undefined ||
    options.averageCost !== undefined ||
    options.reserved !== undefined
  ) {
    const balance: StockBalance = {
      productId: id,
      onHand: options.onHand ?? ZERO_QUANTITY,
      reserved: options.reserved ?? ZERO_QUANTITY,
      averageCost: options.averageCost ?? cost(60),
      updatedAt: harness.context.now,
    }
    harness.db.balances.set(id, balance)
  }

  return product
}

export function aCustomer(
  harness: TestHarness,
  options: { readonly name?: string; readonly paymentTermDays?: number } = {},
): Customer {
  const id = asId<CustomerId>(harness.context.uow.ids.next())
  const customer: Customer = {
    id,
    tenantId: harness.context.tenantId,
    name: options.name ?? 'Aurora Trading Co.',
    taxId: null,
    email: null,
    phone: null,
    notes: null,
    paymentTermDays: options.paymentTermDays ?? 30,
    active: true,
    createdAt: harness.context.now,
    updatedAt: harness.context.now,
  }
  harness.db.customers.set(id, customer)
  return customer
}

export function aSupplier(
  harness: TestHarness,
  options: { readonly name?: string; readonly paymentTermDays?: number } = {},
): Supplier {
  const id = asId<SupplierId>(harness.context.uow.ids.next())
  const supplier: Supplier = {
    id,
    tenantId: harness.context.tenantId,
    name: options.name ?? 'Northwind Supplies',
    taxId: null,
    email: null,
    phone: null,
    notes: null,
    paymentTermDays: options.paymentTermDays ?? 30,
    active: true,
    createdAt: harness.context.now,
    updatedAt: harness.context.now,
  }
  harness.db.suppliers.set(id, supplier)
  return supplier
}

export function anOpenCashSession(
  harness: TestHarness,
  options: { readonly businessDate?: BusinessDate; readonly openingBalance?: Money } = {},
): CashSession {
  const id = asCashId<CashSessionId>(harness.context.uow.ids.next())
  const session: CashSession = {
    id,
    tenantId: harness.context.tenantId,
    businessDate: options.businessDate ?? harness.today,
    status: 'open',
    openingBalance: options.openingBalance ?? ZERO_MONEY,
    inflow: ZERO_MONEY,
    outflow: ZERO_MONEY,
    closingBalance: null,
    countedBalance: null,
    difference: null,
    unsettledTitles: 0,
    justification: null,
    openedAt: harness.context.now,
    openedBy: harness.context.userId,
    closedAt: null,
    closedBy: null,
  }
  harness.db.cashSessions.set(id, session)
  return session
}

export function aReceivable(
  harness: TestHarness,
  options: {
    readonly customerId: CustomerId
    readonly amount: Money
    readonly dueDate?: BusinessDate
    readonly settledAmount?: Money
    readonly salesOrderId?: SalesOrderId
  },
): Receivable {
  const id = asId<ReceivableId>(harness.context.uow.ids.next())
  const receivable: Receivable = {
    id,
    kind: 'receivable',
    tenantId: harness.context.tenantId,
    customerId: options.customerId,
    salesOrderId: options.salesOrderId ?? asId<SalesOrderId>(harness.context.uow.ids.next()),
    amount: options.amount,
    settledAmount: options.settledAmount ?? ZERO_MONEY,
    issuedOn: harness.today,
    dueDate: options.dueDate ?? harness.today,
    status: 'open',
    description: 'Test receivable',
    instalment: 1,
    instalments: 1,
    createdAt: harness.context.now,
    updatedAt: harness.context.now,
  }
  harness.db.receivables.set(id, receivable)
  return receivable
}

export const someDate = (value: string): BusinessDate => unsafeBusinessDate(value)
