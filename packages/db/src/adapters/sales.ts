import {
  asId,
  unitCostFromMillionths,
  unitPriceFromMillionths,
  type CustomerId,
  type FiscalDocumentId,
  type Paginated,
  type ProductId,
  type SalesOrder,
  type SalesOrderFilter,
  type SalesOrderId,
  type SalesOrderItem,
  type SalesOrderItemId,
  type SalesOrderRepository,
  type TenantId,
} from '@ledgerhand/domain'
import { and, asc, desc, eq, getTableColumns, gte, inArray, lte, type SQL } from 'drizzle-orm'
import { salesOrderItems, salesOrders } from '../schema/index.js'
import type { Transaction } from '../unit-of-work.js'
import { limitOf, offsetOf, paginatedFrom, rowCount } from './shared.js'

type OrderRow = typeof salesOrders.$inferSelect
type ItemRow = typeof salesOrderItems.$inferSelect

function toItem(row: ItemRow): SalesOrderItem {
  return {
    id: asId<SalesOrderItemId>(row.id),
    productId: asId<ProductId>(row.productId),
    sku: row.sku,
    description: row.description,
    quantity: row.quantity,
    unitPrice: unitPriceFromMillionths(row.unitPrice),
    discount: row.discount,
    total: row.total,
    unitCostAtInvoice: row.unitCostAtInvoice,
  }
}

function toOrder(row: OrderRow, items: readonly SalesOrderItem[]): SalesOrder {
  return {
    id: asId<SalesOrderId>(row.id),
    tenantId: asId<TenantId>(row.tenantId),
    number: row.number,
    customerId: asId<CustomerId>(row.customerId),
    status: row.status,
    issuedOn: row.issuedOn,
    items,
    total: row.total,
    instalments: row.instalments,
    notes: row.notes,
    confirmedAt: row.confirmedAt,
    invoicedAt: row.invoicedAt,
    cancelledAt: row.cancelledAt,
    cancellationReason: row.cancellationReason,
    fiscalDocumentId:
      row.fiscalDocumentId === null ? null : asId<FiscalDocumentId>(row.fiscalDocumentId),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export class SqlSalesOrders implements SalesOrderRepository {
  constructor(
    private readonly tx: Transaction,
    private readonly tenantId: TenantId,
  ) {}

  private async loadItems(orderIds: readonly string[]): Promise<Map<string, SalesOrderItem[]>> {
    const grouped = new Map<string, SalesOrderItem[]>()
    if (orderIds.length === 0) return grouped

    const rows = await this.tx
      .select()
      .from(salesOrderItems)
      .where(
        and(
          eq(salesOrderItems.tenantId, this.tenantId),
          inArray(salesOrderItems.orderId, [...orderIds]),
        ),
      )
      .orderBy(asc(salesOrderItems.position))

    for (const row of rows) {
      const bucket = grouped.get(row.orderId) ?? []
      bucket.push(toItem(row))
      grouped.set(row.orderId, bucket)
    }
    return grouped
  }

  private async loadOne(condition: SQL): Promise<SalesOrder | null> {
    const [row] = await this.tx
      .select()
      .from(salesOrders)
      .where(and(eq(salesOrders.tenantId, this.tenantId), condition))
      .limit(1)
    if (row === undefined) return null
    const items = await this.loadItems([row.id])
    return toOrder(row, items.get(row.id) ?? [])
  }

  async findById(id: SalesOrderId): Promise<SalesOrder | null> {
    return await this.loadOne(eq(salesOrders.id, id))
  }

  async findByNumber(number: string): Promise<SalesOrder | null> {
    return await this.loadOne(eq(salesOrders.number, number))
  }

  async list(filter: SalesOrderFilter): Promise<Paginated<SalesOrder>> {
    const conditions: SQL[] = [eq(salesOrders.tenantId, this.tenantId)]
    if (filter.status !== undefined && filter.status.length > 0) {
      conditions.push(inArray(salesOrders.status, [...filter.status]))
    }
    if (filter.customerId !== undefined) {
      conditions.push(eq(salesOrders.customerId, filter.customerId))
    }
    if (filter.from !== undefined) conditions.push(gte(salesOrders.issuedOn, filter.from))
    if (filter.to !== undefined) conditions.push(lte(salesOrders.issuedOn, filter.to))

    const rows = await this.tx
      .select({ ...getTableColumns(salesOrders), _rowCount: rowCount })
      .from(salesOrders)
      .where(and(...conditions))
      .orderBy(desc(salesOrders.number))
      .limit(limitOf(filter.page))
      .offset(offsetOf(filter.page))

    const items = await this.loadItems(rows.map((row) => row.id))
    return paginatedFrom(rows, (row) => toOrder(row, items.get(row.id) ?? []))
  }

  /**
   * Items are replaced wholesale rather than diffed. A draft order is small,
   * the write happens inside the same transaction as the order itself, and a
   * diff would be more code doing the same thing less obviously.
   */
  async save(order: SalesOrder): Promise<void> {
    await this.tx
      .insert(salesOrders)
      .values({
        id: order.id,
        tenantId: order.tenantId,
        number: order.number,
        customerId: order.customerId,
        status: order.status,
        issuedOn: order.issuedOn,
        total: order.total,
        instalments: order.instalments,
        notes: order.notes,
        confirmedAt: order.confirmedAt,
        invoicedAt: order.invoicedAt,
        cancelledAt: order.cancelledAt,
        cancellationReason: order.cancellationReason,
        fiscalDocumentId: order.fiscalDocumentId,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      })
      .onConflictDoUpdate({
        target: salesOrders.id,
        set: {
          status: order.status,
          total: order.total,
          instalments: order.instalments,
          notes: order.notes,
          confirmedAt: order.confirmedAt,
          invoicedAt: order.invoicedAt,
          cancelledAt: order.cancelledAt,
          cancellationReason: order.cancellationReason,
          fiscalDocumentId: order.fiscalDocumentId,
          updatedAt: order.updatedAt,
        },
      })

    await this.tx.delete(salesOrderItems).where(eq(salesOrderItems.orderId, order.id))
    if (order.items.length > 0) {
      await this.tx.insert(salesOrderItems).values(
        order.items.map((item, position) => ({
          id: item.id,
          tenantId: order.tenantId,
          orderId: order.id,
          position,
          productId: item.productId,
          sku: item.sku,
          description: item.description,
          quantity: item.quantity,
          unitPrice: unitCostFromMillionths(item.unitPrice),
          discount: item.discount,
          total: item.total,
          unitCostAtInvoice: item.unitCostAtInvoice,
        })),
      )
    }
  }
}
