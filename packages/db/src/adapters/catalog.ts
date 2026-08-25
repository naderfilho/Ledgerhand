import {
  asId,
  asSku,
  unitCostFromMillionths,
  unitPriceFromMillionths,
  type Customer,
  type CustomerId,
  type CustomerRepository,
  type Paginated,
  type PartyFilter,
  type Product,
  type ProductFilter,
  type ProductId,
  type ProductRepository,
  type Sku,
  type Supplier,
  type SupplierId,
  type SupplierRepository,
  type TenantId,
} from '@ledgerhand/domain'
import { and, asc, eq, getTableColumns, ilike, inArray, or, type SQL } from 'drizzle-orm'
import { customers, products, suppliers } from '../schema/index.js'
import type { Transaction } from '../unit-of-work.js'
import { likePattern, limitOf, offsetOf, paginatedFrom, rowCount } from './shared.js'

type ProductRow = typeof products.$inferSelect
type CustomerRow = typeof customers.$inferSelect
type SupplierRow = typeof suppliers.$inferSelect

export function toProduct(row: ProductRow): Product {
  return {
    id: asId<ProductId>(row.id),
    tenantId: asId<TenantId>(row.tenantId),
    sku: asSku(row.sku),
    name: row.name,
    description: row.description,
    unit: row.unit,
    // The column type is shared between prices and costs; the brand is not.
    salePrice: unitPriceFromMillionths(row.salePrice),
    minimumStock: row.minimumStock,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toCustomer(row: CustomerRow): Customer {
  return {
    id: asId<CustomerId>(row.id),
    tenantId: asId<TenantId>(row.tenantId),
    name: row.name,
    taxId: row.taxId,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    paymentTermDays: row.paymentTermDays,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toSupplier(row: SupplierRow): Supplier {
  return {
    id: asId<SupplierId>(row.id),
    tenantId: asId<TenantId>(row.tenantId),
    name: row.name,
    taxId: row.taxId,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    paymentTermDays: row.paymentTermDays,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export class SqlProducts implements ProductRepository {
  constructor(
    private readonly tx: Transaction,
    private readonly tenantId: TenantId,
  ) {}

  async findById(id: ProductId): Promise<Product | null> {
    const [row] = await this.tx
      .select()
      .from(products)
      .where(and(eq(products.tenantId, this.tenantId), eq(products.id, id)))
      .limit(1)
    return row === undefined ? null : toProduct(row)
  }

  async findBySku(sku: Sku): Promise<Product | null> {
    const [row] = await this.tx
      .select()
      .from(products)
      .where(and(eq(products.tenantId, this.tenantId), eq(products.sku, sku)))
      .limit(1)
    return row === undefined ? null : toProduct(row)
  }

  async findManyByIds(ids: readonly ProductId[]): Promise<Map<ProductId, Product>> {
    if (ids.length === 0) return new Map()
    const rows = await this.tx
      .select()
      .from(products)
      .where(and(eq(products.tenantId, this.tenantId), inArray(products.id, [...ids])))
    return new Map(rows.map((row) => [asId<ProductId>(row.id), toProduct(row)]))
  }

  async list(filter: ProductFilter): Promise<Paginated<Product>> {
    const conditions: SQL[] = [eq(products.tenantId, this.tenantId)]
    if (filter.activeOnly === true) conditions.push(eq(products.active, true))
    if (filter.search !== undefined && filter.search !== '') {
      const pattern = likePattern(filter.search)
      const match = or(ilike(products.sku, pattern), ilike(products.name, pattern))
      if (match !== undefined) conditions.push(match)
    }

    const rows = await this.tx
      .select({ ...getTableColumns(products), _rowCount: rowCount })
      .from(products)
      .where(and(...conditions))
      .orderBy(asc(products.sku))
      .limit(limitOf(filter.page))
      .offset(offsetOf(filter.page))

    return paginatedFrom(rows, toProduct)
  }

  async save(product: Product): Promise<void> {
    await this.tx
      .insert(products)
      .values({
        id: product.id,
        tenantId: product.tenantId,
        sku: product.sku,
        name: product.name,
        description: product.description,
        unit: product.unit,
        // The column is branded as a cost; a price shares its scale exactly.
        salePrice: unitCostFromMillionths(product.salePrice),
        minimumStock: product.minimumStock,
        active: product.active,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      })
      .onConflictDoUpdate({
        target: products.id,
        set: {
          name: product.name,
          description: product.description,
          salePrice: unitCostFromMillionths(product.salePrice),
          minimumStock: product.minimumStock,
          active: product.active,
          updatedAt: product.updatedAt,
        },
      })
  }
}

export class SqlCustomers implements CustomerRepository {
  constructor(
    private readonly tx: Transaction,
    private readonly tenantId: TenantId,
  ) {}

  async findManyByIds(ids: readonly CustomerId[]): Promise<Map<CustomerId, Customer>> {
    if (ids.length === 0) return new Map()
    const rows = await this.tx
      .select()
      .from(customers)
      .where(and(eq(customers.tenantId, this.tenantId), inArray(customers.id, [...ids])))
    return new Map(rows.map((row) => [asId<CustomerId>(row.id), toCustomer(row)]))
  }

  async findById(id: CustomerId): Promise<Customer | null> {
    const [row] = await this.tx
      .select()
      .from(customers)
      .where(and(eq(customers.tenantId, this.tenantId), eq(customers.id, id)))
      .limit(1)
    return row === undefined ? null : toCustomer(row)
  }

  async list(filter: PartyFilter): Promise<Paginated<Customer>> {
    const conditions: SQL[] = [eq(customers.tenantId, this.tenantId)]
    if (filter.activeOnly === true) conditions.push(eq(customers.active, true))
    if (filter.search !== undefined && filter.search !== '') {
      const pattern = likePattern(filter.search)
      const match = or(ilike(customers.name, pattern), ilike(customers.taxId, pattern))
      if (match !== undefined) conditions.push(match)
    }

    const rows = await this.tx
      .select({ ...getTableColumns(customers), _rowCount: rowCount })
      .from(customers)
      .where(and(...conditions))
      .orderBy(asc(customers.name))
      .limit(limitOf(filter.page))
      .offset(offsetOf(filter.page))

    return paginatedFrom(rows, toCustomer)
  }

  async save(customer: Customer): Promise<void> {
    await this.tx
      .insert(customers)
      .values({
        id: customer.id,
        tenantId: customer.tenantId,
        name: customer.name,
        taxId: customer.taxId,
        email: customer.email,
        phone: customer.phone,
        notes: customer.notes,
        paymentTermDays: customer.paymentTermDays,
        active: customer.active,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      })
      .onConflictDoUpdate({
        target: customers.id,
        set: {
          name: customer.name,
          taxId: customer.taxId,
          email: customer.email,
          phone: customer.phone,
          notes: customer.notes,
          paymentTermDays: customer.paymentTermDays,
          active: customer.active,
          updatedAt: customer.updatedAt,
        },
      })
  }
}

export class SqlSuppliers implements SupplierRepository {
  constructor(
    private readonly tx: Transaction,
    private readonly tenantId: TenantId,
  ) {}

  async findManyByIds(ids: readonly SupplierId[]): Promise<Map<SupplierId, Supplier>> {
    if (ids.length === 0) return new Map()
    const rows = await this.tx
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.tenantId, this.tenantId), inArray(suppliers.id, [...ids])))
    return new Map(rows.map((row) => [asId<SupplierId>(row.id), toSupplier(row)]))
  }

  async findById(id: SupplierId): Promise<Supplier | null> {
    const [row] = await this.tx
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.tenantId, this.tenantId), eq(suppliers.id, id)))
      .limit(1)
    return row === undefined ? null : toSupplier(row)
  }

  async list(filter: PartyFilter): Promise<Paginated<Supplier>> {
    const conditions: SQL[] = [eq(suppliers.tenantId, this.tenantId)]
    if (filter.activeOnly === true) conditions.push(eq(suppliers.active, true))
    if (filter.search !== undefined && filter.search !== '') {
      const pattern = likePattern(filter.search)
      const match = or(ilike(suppliers.name, pattern), ilike(suppliers.taxId, pattern))
      if (match !== undefined) conditions.push(match)
    }

    const rows = await this.tx
      .select({ ...getTableColumns(suppliers), _rowCount: rowCount })
      .from(suppliers)
      .where(and(...conditions))
      .orderBy(asc(suppliers.name))
      .limit(limitOf(filter.page))
      .offset(offsetOf(filter.page))

    return paginatedFrom(rows, toSupplier)
  }

  async save(supplier: Supplier): Promise<void> {
    await this.tx
      .insert(suppliers)
      .values({
        id: supplier.id,
        tenantId: supplier.tenantId,
        name: supplier.name,
        taxId: supplier.taxId,
        email: supplier.email,
        phone: supplier.phone,
        notes: supplier.notes,
        paymentTermDays: supplier.paymentTermDays,
        active: supplier.active,
        createdAt: supplier.createdAt,
        updatedAt: supplier.updatedAt,
      })
      .onConflictDoUpdate({
        target: suppliers.id,
        set: {
          name: supplier.name,
          taxId: supplier.taxId,
          email: supplier.email,
          phone: supplier.phone,
          notes: supplier.notes,
          paymentTermDays: supplier.paymentTermDays,
          active: supplier.active,
          updatedAt: supplier.updatedAt,
        },
      })
  }
}
