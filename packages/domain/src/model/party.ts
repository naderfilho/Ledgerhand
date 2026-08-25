import type { CustomerId, SupplierId, TenantId } from '../kit/ids.js'

/**
 * Customers and suppliers share a shape but never a type: a purchase order
 * addressed to a customer is a bug the compiler should catch, not a support
 * ticket someone files three months later.
 */
interface PartyFields {
  readonly tenantId: TenantId
  readonly name: string
  /** National registration (CNPJ/CPF in the demo data). Free text, not validated. */
  readonly taxId: string | null
  readonly email: string | null
  readonly phone: string | null
  readonly notes: string | null
  readonly active: boolean
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface Customer extends PartyFields {
  readonly id: CustomerId
  /** Days added to the invoice date when generating receivables. */
  readonly paymentTermDays: number
}

export interface Supplier extends PartyFields {
  readonly id: SupplierId
  readonly paymentTermDays: number
}

export function describeCustomer(customer: Customer): string {
  return customer.taxId === null ? customer.name : `${customer.name} (${customer.taxId})`
}

export function describeSupplier(supplier: Supplier): string {
  return supplier.taxId === null ? supplier.name : `${supplier.name} (${supplier.taxId})`
}
