import {
  asId,
  emptyBalance,
  subQuantity,
  type Paginated,
  type ProductId,
  type StockAlert,
  type StockBalance,
  type StockMovement,
  type StockMovementFilter,
  type StockMovementId,
  type StockMovementReference,
  type StockRepository,
  type TenantId,
} from '@ledgerhand/domain'
import { and, asc, desc, eq, getTableColumns, gte, inArray, lte, sql, type SQL } from 'drizzle-orm'
import { products, stockBalances, stockMovements } from '../schema/index.js'
import type { Transaction } from '../unit-of-work.js'
import { limitOf, offsetOf, paginatedFrom, rowCount } from './shared.js'

type BalanceRow = typeof stockBalances.$inferSelect
type MovementRow = typeof stockMovements.$inferSelect

function toBalance(row: BalanceRow): StockBalance {
  return {
    productId: asId<ProductId>(row.productId),
    onHand: row.onHand,
    reserved: row.reserved,
    averageCost: row.averageCost,
    updatedAt: row.updatedAt,
  }
}

function toMovement(row: MovementRow): StockMovement {
  const reference: StockMovementReference | null =
    row.referenceKind === null || row.referenceId === null
      ? null
      : { kind: row.referenceKind as StockMovementReference['kind'], id: row.referenceId }

  return {
    id: asId<StockMovementId>(row.id),
    productId: asId<ProductId>(row.productId),
    kind: row.kind,
    reason: row.reason,
    quantity: row.quantity,
    unitCost: row.unitCost,
    totalCost: row.totalCost,
    onHandAfter: row.onHandAfter,
    averageCostAfter: row.averageCostAfter,
    occurredAt: row.occurredAt,
    reference,
    note: row.note,
  }
}

export class SqlStock implements StockRepository {
  constructor(
    private readonly tx: Transaction,
    private readonly tenantId: TenantId,
    private readonly now: Date,
  ) {}

  async getBalance(productId: ProductId): Promise<StockBalance> {
    const [row] = await this.tx
      .select()
      .from(stockBalances)
      .where(and(eq(stockBalances.tenantId, this.tenantId), eq(stockBalances.productId, productId)))
      .limit(1)
    return row === undefined ? emptyBalance(productId, this.now) : toBalance(row)
  }

  /**
   * Takes a row lock for the rest of the transaction. Two confirmations racing
   * for the last unit in stock must not both read "one available" and both
   * succeed; the second one waits here and then fails the availability check
   * honestly.
   */
  async getBalanceForUpdate(productId: ProductId): Promise<StockBalance> {
    const [row] = await this.tx
      .select()
      .from(stockBalances)
      .where(and(eq(stockBalances.tenantId, this.tenantId), eq(stockBalances.productId, productId)))
      .limit(1)
      .for('update')
    return row === undefined ? emptyBalance(productId, this.now) : toBalance(row)
  }

  async getBalances(productIds: readonly ProductId[]): Promise<Map<ProductId, StockBalance>> {
    const result = new Map<ProductId, StockBalance>()
    if (productIds.length === 0) return result

    const rows = await this.tx
      .select()
      .from(stockBalances)
      .where(
        and(
          eq(stockBalances.tenantId, this.tenantId),
          inArray(stockBalances.productId, [...productIds]),
        ),
      )

    for (const row of rows) result.set(asId<ProductId>(row.productId), toBalance(row))
    for (const productId of productIds) {
      if (!result.has(productId)) result.set(productId, emptyBalance(productId, this.now))
    }
    return result
  }

  async saveBalance(balance: StockBalance): Promise<void> {
    await this.tx
      .insert(stockBalances)
      .values({
        tenantId: this.tenantId,
        productId: balance.productId,
        onHand: balance.onHand,
        reserved: balance.reserved,
        averageCost: balance.averageCost,
        updatedAt: balance.updatedAt,
      })
      .onConflictDoUpdate({
        target: stockBalances.productId,
        set: {
          onHand: balance.onHand,
          reserved: balance.reserved,
          averageCost: balance.averageCost,
          updatedAt: balance.updatedAt,
        },
      })
  }

  async appendMovement(movement: StockMovement): Promise<void> {
    await this.tx.insert(stockMovements).values({
      id: movement.id,
      tenantId: this.tenantId,
      productId: movement.productId,
      kind: movement.kind,
      reason: movement.reason,
      quantity: movement.quantity,
      unitCost: movement.unitCost,
      totalCost: movement.totalCost,
      onHandAfter: movement.onHandAfter,
      averageCostAfter: movement.averageCostAfter,
      occurredAt: movement.occurredAt,
      referenceKind: movement.reference?.kind ?? null,
      referenceId: movement.reference?.id ?? null,
      note: movement.note,
    })
  }

  async listMovements(filter: StockMovementFilter): Promise<Paginated<StockMovement>> {
    const conditions: SQL[] = [eq(stockMovements.tenantId, this.tenantId)]
    if (filter.productId !== undefined) {
      conditions.push(eq(stockMovements.productId, filter.productId))
    }
    if (filter.from !== undefined) {
      conditions.push(gte(sql`${stockMovements.occurredAt}::date`, filter.from))
    }
    if (filter.to !== undefined) {
      conditions.push(lte(sql`${stockMovements.occurredAt}::date`, filter.to))
    }

    const rows = await this.tx
      .select({ ...getTableColumns(stockMovements), _rowCount: rowCount })
      .from(stockMovements)
      .where(and(...conditions))
      .orderBy(desc(stockMovements.occurredAt))
      .limit(limitOf(filter.page))
      .offset(offsetOf(filter.page))

    return paginatedFrom(rows, toMovement)
  }

  /**
   * A left join, not an inner one: a product that has never moved has no
   * balance row at all, and it is exactly the product with nothing in stock
   * that most needs to appear on a replenishment list.
   */
  async listBelowMinimum(): Promise<readonly StockAlert[]> {
    const rows = await this.tx
      .select({
        productId: products.id,
        sku: products.sku,
        name: products.name,
        minimumStock: products.minimumStock,
        onHand: stockBalances.onHand,
      })
      .from(products)
      .leftJoin(stockBalances, eq(stockBalances.productId, products.id))
      .where(
        and(
          eq(products.tenantId, this.tenantId),
          eq(products.active, true),
          sql`${products.minimumStock} > 0`,
          sql`coalesce(${stockBalances.onHand}, 0) < ${products.minimumStock}`,
        ),
      )
      .orderBy(asc(products.sku))

    return rows.map((row) => {
      const onHand = row.onHand ?? emptyBalance(asId<ProductId>(row.productId), this.now).onHand
      return {
        productId: asId<ProductId>(row.productId),
        sku: row.sku,
        name: row.name,
        onHand,
        minimumStock: row.minimumStock,
        shortfall: subQuantity(row.minimumStock, onHand),
      }
    })
  }
}
