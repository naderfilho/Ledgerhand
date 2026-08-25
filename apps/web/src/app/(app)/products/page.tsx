import { USE_CASES } from '@ledgerhand/domain'
import { Archive, FileText, MoreHorizontal, Pencil } from 'lucide-react'
import type { Metadata } from 'next'
import type * as React from 'react'
import { ConfirmOperation } from '@/components/app/confirm-operation'
import { SearchField } from '@/components/app/search-field'
import { ProductFormDialog } from '@/components/products/product-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState, PageHeader } from '@/components/ui/misc'
import { Table, TableEmpty, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatCurrency, formatQuantity } from '@/lib/format'
import { can, query, requireSession } from '@/server/context'
import { presentProduct } from '@/server/present'

export const metadata: Metadata = { title: 'Products' }
export const dynamic = 'force-dynamic'

export default async function ProductsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<React.JSX.Element> {
  const session = await requireSession()
  const params = await searchParams
  const search = typeof params['q'] === 'string' ? params['q'] : undefined

  const products = await query(async (context) => {
    const listed = await USE_CASES.list_products.execute(
      {
        ...(search === undefined || search === '' ? {} : { search }),
        activeOnly: false,
        page: { limit: 200, offset: 0 },
      },
      context,
    )
    if (!listed.ok) return { rows: [], total: 0 }
    return { rows: listed.value.rows.map(presentProduct), total: listed.value.total }
  })

  const editable = can(session, 'catalog:write')
  const archivable = can(session, 'catalog:archive')

  return (
    <>
      <PageHeader
        title="Products"
        description="The catalogue. Prices and minimum levels live here; quantities live in stock."
        actions={editable ? <ProductFormDialog /> : undefined}
      />

      <Card>
        <CardHeader>
          <CardTitle>
            {products.total} product{products.total === 1 ? '' : 's'}
          </CardTitle>
          <SearchField placeholder="Search SKU or name…" />
        </CardHeader>

        <CardContent>
          {products.rows.length === 0 ? (
            <EmptyState
              icon={<FileText className="size-5" />}
              title={
                search === undefined ? 'The catalogue is empty' : 'Nothing matches that search'
              }
              description={
                search === undefined
                  ? 'Create a product to start selling and buying it.'
                  : 'Try a different SKU or name.'
              }
              action={editable && search === undefined ? <ProductFormDialog /> : undefined}
            />
          ) : (
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>SKU</TH>
                    <TH>Name</TH>
                    <TH>Unit</TH>
                    <TH numeric>Sale price</TH>
                    <TH numeric>Minimum</TH>
                    <TH>Status</TH>
                    <TH className="w-10" />
                  </TR>
                </THead>
                <TBody>
                  {products.rows.length === 0 ? (
                    <TableEmpty colSpan={7}>No products</TableEmpty>
                  ) : null}
                  {products.rows.map((product) => (
                    <TR key={product.id}>
                      <TD className="font-mono text-xs">{product.sku}</TD>
                      <TD className="max-w-72 truncate font-medium">{product.name}</TD>
                      <TD className="text-muted-foreground">{product.unit}</TD>
                      <TD numeric>{formatCurrency(product.salePrice)}</TD>
                      <TD numeric className="text-muted-foreground">
                        {formatQuantity(product.minimumStock)}
                      </TD>
                      <TD>
                        {product.active ? (
                          <Badge tone="positive">Active</Badge>
                        ) : (
                          <Badge tone="neutral">Archived</Badge>
                        )}
                      </TD>
                      <TD>
                        {editable || archivable ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="iconSm" aria-label="Product actions">
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {editable ? (
                                <ProductFormDialog
                                  product={product}
                                  trigger={
                                    <DropdownMenuItem
                                      onSelect={(event) => {
                                        event.preventDefault()
                                      }}
                                    >
                                      <Pencil />
                                      Edit
                                    </DropdownMenuItem>
                                  }
                                />
                              ) : null}
                              {archivable && product.active ? (
                                <ConfirmOperation
                                  operation="archive_product"
                                  input={{ productId: product.id }}
                                  title="Archive product"
                                  confirmLabel="Archive"
                                  successMessage={`${product.sku} archived.`}
                                  trigger={
                                    <DropdownMenuItem
                                      tone="danger"
                                      onSelect={(event) => {
                                        event.preventDefault()
                                      }}
                                    >
                                      <Archive />
                                      Archive
                                    </DropdownMenuItem>
                                  }
                                />
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          )}
        </CardContent>

        {products.rows.length > 0 ? (
          <CardFooter>
            <p className="text-xs text-muted-foreground">
              Showing {products.rows.length} of {products.total}
            </p>
          </CardFooter>
        ) : null}
      </Card>
    </>
  )
}
