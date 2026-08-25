import { USE_CASES, formatQuantity, formatUnitValue } from '@ledgerhand/domain'
import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import type * as React from 'react'
import { NewOrderForm } from '@/components/sales/new-order-form'
import { Button } from '@/components/ui/button'
import { EmptyState, PageHeader } from '@/components/ui/misc'
import { query, requireCapabilityOrRedirect } from '@/server/context'

export const metadata: Metadata = { title: 'New sales order' }
export const dynamic = 'force-dynamic'

export default async function NewSalesOrderPage(): Promise<React.JSX.Element> {
  await requireCapabilityOrRedirect('sales:write')

  const data = await query(async (context) => {
    const [customers, position] = await Promise.all([
      USE_CASES.list_customers.execute(
        { activeOnly: true, page: { limit: 200, offset: 0 } },
        context,
      ),
      USE_CASES.report_stock_position.execute({ belowMinimumOnly: false, limit: 500 }, context),
    ])

    return {
      customers: (customers.ok ? customers.value.rows : []).map((customer) => ({
        id: customer.id,
        name: customer.name,
        paymentTermDays: customer.paymentTermDays,
      })),
      products: (position.ok ? position.value.rows : []).map((row) => ({
        id: row.product.id,
        sku: row.product.sku,
        name: row.product.name,
        unit: row.product.unit,
        salePrice: formatUnitValue(row.product.salePrice),
        available: formatQuantity(row.available),
      })),
    }
  })

  return (
    <>
      <div className="space-y-1">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/sales">
            <ArrowLeft className="size-3.5" /> Sales orders
          </Link>
        </Button>
        <PageHeader
          title="New sales order"
          description="Pick a customer and the lines. Prices default to the catalogue and can be overridden per line."
        />
      </div>

      {data.customers.length === 0 || data.products.length === 0 ? (
        <EmptyState
          title="Nothing to sell yet"
          description={
            data.customers.length === 0
              ? 'Create a customer first.'
              : 'Create a product with stock first.'
          }
          action={
            <Button variant="primary" asChild>
              <Link href={data.customers.length === 0 ? '/customers' : '/products'}>
                {data.customers.length === 0 ? 'Go to customers' : 'Go to products'}
              </Link>
            </Button>
          }
        />
      ) : (
        <NewOrderForm customers={data.customers} products={data.products} />
      )}
    </>
  )
}
