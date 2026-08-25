import {
  asId,
  type Paginated,
  type ProductId,
  type PurchaseOrder,
  type PurchaseOrderFilter,
  type PurchaseOrderId,
  type PurchaseOrderItem,
  type PurchaseOrderItemId,
  type PurchaseOrderRepository,
  type SupplierId,
  type TenantId,
} from '@ledgerhand/domain'
import { and, asc, desc, eq, getTableColumns, inArray, type SQL } from 'drizzle-orm'
import { purchaseOrderItems, purchaseOrders } from '../schema/index.js'
import type { Transaction } from '../unit-of-work.js'
import { limitOf, offsetOf, paginatedFrom, rowCount } from './shared.js'

type OrderRow = typeof purchaseOrders.$inferSelect
type ItemRow = typeof purchaseOrderItems.$inferSelect

function toItem(row: ItemRow): PurchaseOrderItem {
  return {
    id: asId<PurchaseOrderItemId>(row.id),
    productId: asId<ProductId>(row.productId),
    sku: row.sku,
    description: row.description,
    quantity: row.quantity,
    receivedQuantity: row.receivedQuantity,
    unitCost: row.unitCost,
    total: row.total,
  }
}

function toOrder(row: OrderRow, items: readonly PurchaseOrderItem[]): PurchaseOrder {
  return {
    id: asId<PurchaseOrderId>(row.id),
    tenantId: asId<TenantId>(row.tenantId),
    number: row.number,
    supplierId: asId<SupplierId>(row.supplierId),
    status: row.status,
    issuedOn: row.issuedOn,
    expectedOn: row.expectedOn,
    items,
    total: row.total,
    notes: row.notes,
    placedAt: row.placedAt,
    cancelledAt: row.cancelledAt,
    cancellationReason: row.cancellationReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export class SqlPurchaseOrders implements PurchaseOrderRepository {
  constructor(
    private readonly tx: Transaction,
    private readonly tenantId: TenantId,
  ) {}

  private async loadItems(orderIds: readonly string[]): Promise<Map<string, PurchaseOrderItem[]>> {
    const grouped = new Map<string, PurchaseOrderItem[]>()
    if (orderIds.length === 0) return grouped

    const rows = await this.tx
      .select()
      .from(purchaseOrderItems)
      .where(
        and(
          eq(purchaseOrderItems.tenantId, this.tenantId),
          inArray(purchaseOrderItems.orderId, [...orderIds]),
        ),
      )
      .orderBy(asc(purchaseOrderItems.position))

    for (const row of rows) {
      const bucket = grouped.get(row.orderId) ?? []
      bucket.push(toItem(row))
      grouped.set(row.orderId, bucket)
    }
    return grouped
  }

  private async loadOne(condition: SQL): Promise<PurchaseOrder | null> {
    const [row] = await this.tx
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.tenantId, this.tenantId), condition))
      .limit(1)
    if (row === undefined) return null
    const items = await this.loadItems([row.id])
    return toOrder(row, items.get(row.id) ?? [])
  }

  async findById(id: PurchaseOrderId): Promise<PurchaseOrder | null> {
    return await this.loadOne(eq(purchaseOrders.id, id))
  }

  async findByNumber(number: string): Promise<PurchaseOrder | null> {
    return await this.loadOne(eq(purchaseOrders.number, number))
  }

  async list(filter: PurchaseOrderFilter): Promise<Paginated<PurchaseOrder>> {
    const conditions: SQL[] = [eq(purchaseOrders.tenantId, this.tenantId)]
    if (filter.status !== undefined && filter.status.length > 0) {
      conditions.push(inArray(purchaseOrders.status, [...filter.status]))
    }
    if (filter.supplierId !== undefined) {
      conditions.push(eq(purchaseOrders.supplierId, filter.supplierId))
    }

    const rows = await this.tx
      .select({ ...getTableColumns(purchaseOrders), _rowCount: rowCount })
      .from(purchaseOrders)
      .where(and(...conditions))
      .orderBy(desc(purchaseOrders.number))
      .limit(limitOf(filter.page))
      .offset(offsetOf(filter.page))

    const items = await this.loadItems(rows.map((row) => row.id))
    return paginatedFrom(rows, (row) => toOrder(row, items.get(row.id) ?? []))
  }

  async save(order: PurchaseOrder): Promise<void> {
    await this.tx
      .insert(purchaseOrders)
      .values({
        id: order.id,
        tenantId: order.tenantId,
        number: order.number,
        supplierId: order.supplierId,
        status: order.status,
        issuedOn: order.issuedOn,
        expectedOn: order.expectedOn,
        total: order.total,
        notes: order.notes,
        placedAt: order.placedAt,
        cancelledAt: order.cancelledAt,
        cancellationReason: order.cancellationReason,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      })
      .onConflictDoUpdate({
        target: purchaseOrders.id,
        set: {
          status: order.status,
          expectedOn: order.expectedOn,
          total: order.total,
          notes: order.notes,
          placedAt: order.placedAt,
          cancelledAt: order.cancelledAt,
          cancellationReason: order.cancellationReason,
          updatedAt: order.updatedAt,
        },
      })

    await this.tx.delete(purchaseOrderItems).where(eq(purchaseOrderItems.orderId, order.id))
    if (order.items.length > 0) {
      await this.tx.insert(purchaseOrderItems).values(
        order.items.map((item, position) => ({
          id: item.id,
          tenantId: order.tenantId,
          orderId: order.id,
          position,
          productId: item.productId,
          sku: item.sku,
          description: item.description,
          quantity: item.quantity,
          receivedQuantity: item.receivedQuantity,
          unitCost: item.unitCost,
          total: item.total,
        })),
      )
    }
  }
}
