'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, NativeSelect, Textarea } from '@/components/ui/field'
import { formatCurrency } from '@/lib/format'
import { performOperation } from '@/server/actions/operations'

export interface OrderCustomer {
  readonly id: string
  readonly name: string
  readonly paymentTermDays: number
}

export interface OrderProduct {
  readonly id: string
  readonly sku: string
  readonly name: string
  readonly unit: string
  readonly salePrice: string
  readonly available: string
}

interface Line {
  readonly key: number
  productId: string
  quantity: string
  unitPrice: string
}

/**
 * A draft order reserves nothing, so this form never has to check stock: it
 * shows what is available as information and lets the user commit anyway. The
 * refusal, if there is one, comes from the domain at confirmation time and
 * names the product and the shortfall.
 */
export function NewOrderForm({
  customers,
  products,
}: {
  readonly customers: readonly OrderCustomer[]
  readonly products: readonly OrderProduct[]
}): React.JSX.Element {
  const router = useRouter()
  const [customerId, setCustomerId] = React.useState(customers[0]?.id ?? '')
  const [instalments, setInstalments] = React.useState('1')
  const [notes, setNotes] = React.useState('')
  const [lines, setLines] = React.useState<Line[]>([
    {
      key: 1,
      productId: products[0]?.id ?? '',
      quantity: '1',
      unitPrice: products[0]?.salePrice ?? '',
    },
  ])
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const nextKey = React.useRef(2)

  const productById = React.useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  )

  const total = lines.reduce((sum, line) => {
    const quantity = Number(line.quantity)
    const price = Number(line.unitPrice)
    return Number.isFinite(quantity) && Number.isFinite(price) ? sum + quantity * price : sum
  }, 0)

  const updateLine = (key: number, patch: Partial<Line>): void => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  const submit = (): void => {
    setError(null)
    startTransition(async () => {
      const result = await performOperation('create_sales_order', {
        customerId,
        instalments: Number(instalments),
        notes: notes === '' ? null : notes,
        items: lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        })),
      })

      if (result.ok) {
        toast.success('Draft order created.')
        router.push('/sales')
        router.refresh()
      } else {
        setError(result.message)
      }
    })
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const first = products[0]
              setLines((current) => [
                ...current,
                {
                  key: nextKey.current++,
                  productId: first?.id ?? '',
                  quantity: '1',
                  unitPrice: first?.salePrice ?? '',
                },
              ])
            }}
          >
            <Plus className="size-3.5" /> Add line
          </Button>
        </CardHeader>

        <CardBody className="space-y-3">
          {lines.map((line) => {
            const product = productById.get(line.productId)
            return (
              <div
                key={line.key}
                className="grid items-end gap-3 rounded-lg border border-border bg-surface-sunken p-3 sm:grid-cols-[1fr_6rem_7rem_2.25rem]"
              >
                <Field label="Product" htmlFor={`product-${String(line.key)}`}>
                  <NativeSelect
                    id={`product-${String(line.key)}`}
                    value={line.productId}
                    onChange={(event) => {
                      const selected = productById.get(event.target.value)
                      updateLine(line.key, {
                        productId: event.target.value,
                        unitPrice: selected?.salePrice ?? line.unitPrice,
                      })
                    }}
                  >
                    {products.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.sku} — {option.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>

                <Field
                  label="Qty"
                  htmlFor={`quantity-${String(line.key)}`}
                  hint={product === undefined ? undefined : `${product.available} avail.`}
                >
                  <Input
                    id={`quantity-${String(line.key)}`}
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(event) => {
                      updateLine(line.key, { quantity: event.target.value })
                    }}
                  />
                </Field>

                <Field label="Unit price" htmlFor={`price-${String(line.key)}`}>
                  <Input
                    id={`price-${String(line.key)}`}
                    inputMode="decimal"
                    value={line.unitPrice}
                    onChange={(event) => {
                      updateLine(line.key, { unitPrice: event.target.value })
                    }}
                  />
                </Field>

                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove line"
                  disabled={lines.length === 1}
                  onClick={() => {
                    setLines((current) => current.filter((candidate) => candidate.key !== line.key))
                  }}
                >
                  <Trash2 className="text-danger" />
                </Button>
              </div>
            )
          })}
        </CardBody>

        <CardFooter>
          <span className="text-xs text-muted-foreground">
            {lines.length} line{lines.length === 1 ? '' : 's'}
          </span>
          <span className="tabular text-sm font-semibold">{formatCurrency(total.toFixed(2))}</span>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Order</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <Field label="Customer" htmlFor="customer" required>
            <NativeSelect
              id="customer"
              value={customerId}
              onChange={(event) => {
                setCustomerId(event.target.value)
              }}
            >
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} — {customer.paymentTermDays}d
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field
            label="Instalments"
            htmlFor="instalments"
            hint="How many receivables invoicing will generate"
          >
            <Input
              id="instalments"
              type="number"
              min={1}
              max={12}
              value={instalments}
              onChange={(event) => {
                setInstalments(event.target.value)
              }}
            />
          </Field>

          <Field label="Notes" htmlFor="notes">
            <Textarea
              id="notes"
              rows={3}
              maxLength={1000}
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value)
              }}
            />
          </Field>

          {error !== null ? (
            <p
              role="alert"
              className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-xs text-danger-foreground"
            >
              {error}
            </p>
          ) : null}

          <Button
            variant="primary"
            className="w-full"
            onClick={submit}
            loading={pending}
            disabled={customerId === '' || lines.length === 0}
          >
            Create draft order
          </Button>
          <p className="text-xs text-muted-foreground">
            A draft neither reserves nor moves stock. Confirming it is where availability is
            checked.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
