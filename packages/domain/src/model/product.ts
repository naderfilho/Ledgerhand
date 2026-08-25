import { z } from 'zod'
import type { ProductId, Sku, TenantId } from '../kit/ids.js'
import type { Quantity } from '../kit/quantity.js'
import type { UnitPrice } from '../kit/unit-value.js'

/**
 * Units of measure the catalogue understands. Kept as a closed list so a
 * quantity always means something specific -- an agent cannot invent "cases"
 * and have half the reports quietly disagree about what a case is.
 */
export const PRODUCT_UNITS = ['unit', 'box', 'pack', 'kg', 'g', 'l', 'ml', 'm'] as const
export type ProductUnit = (typeof PRODUCT_UNITS)[number]

export interface Product {
  readonly id: ProductId
  readonly tenantId: TenantId
  readonly sku: Sku
  readonly name: string
  readonly description: string | null
  readonly unit: ProductUnit
  readonly salePrice: UnitPrice
  readonly minimumStock: Quantity
  readonly active: boolean
  readonly createdAt: Date
  readonly updatedAt: Date
}

export const productUnitSchema = z.enum(PRODUCT_UNITS)

export function describeProduct(product: Product): string {
  return `${product.sku} (${product.name})`
}
