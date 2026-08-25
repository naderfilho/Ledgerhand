'use client'

import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, Input, NativeSelect, Textarea } from '@/components/ui/field'
import { createProductAction, updateProductAction } from '@/server/actions/catalog'
import type { ProductView } from '@/server/present'

const UNITS = ['unit', 'box', 'pack', 'kg', 'g', 'l', 'ml', 'm'] as const

/** FormData entries can be files; every field these forms read is text. */
function text(formData: FormData, key: string, fallback = ''): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value : fallback
}

export function ProductFormDialog({
  product,
  trigger,
}: {
  readonly product?: ProductView
  readonly trigger?: React.ReactNode
}): React.JSX.Element {
  const editing = product !== undefined
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const submit = (formData: FormData): void => {
    setError(null)
    startTransition(async () => {
      const common = {
        name: text(formData, 'name'),
        description: text(formData, 'description') || null,
        salePrice: text(formData, 'salePrice'),
        minimumStock: text(formData, 'minimumStock', '0'),
      }

      const result = editing
        ? await updateProductAction({ productId: product.id, ...common })
        : await createProductAction({
            ...common,
            sku: text(formData, 'sku'),
            unit: text(formData, 'unit', 'unit'),
          })

      if (result.ok) {
        toast.success(editing ? 'Product updated.' : `${result.data.sku} created.`)
        setOpen(false)
        router.refresh()
      } else {
        // The domain's own sentence, not a generic failure message.
        setError(result.message)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span
        className="contents"
        onClick={() => {
          setOpen(true)
        }}
      >
        {trigger ?? (
          <Button variant="primary">
            <Plus /> New product
          </Button>
        )}
      </span>

      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${product.sku}` : 'New product'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'The SKU and the unit of measure cannot change: historical documents refer to them.'
              : 'Creating a product does not create stock. Receive a purchase order or register an entry for that.'}
          </DialogDescription>
        </DialogHeader>

        <form action={submit}>
          <DialogBody className="grid gap-4 sm:grid-cols-2">
            {editing ? null : (
              <Field label="SKU" htmlFor="sku" required hint="Letters, digits, dot, dash">
                <Input
                  id="sku"
                  name="sku"
                  required
                  maxLength={32}
                  placeholder="FER-1009"
                  autoFocus
                />
              </Field>
            )}

            <Field label="Name" htmlFor="name" required className={editing ? 'sm:col-span-2' : ''}>
              <Input
                id="name"
                name="name"
                required
                maxLength={120}
                defaultValue={product?.name}
                placeholder="Chave de fenda 6mm"
              />
            </Field>

            {editing ? null : (
              <Field label="Unit of measure" htmlFor="unit">
                <NativeSelect id="unit" name="unit" defaultValue="unit">
                  {UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}

            <Field
              label="Sale price"
              htmlFor="salePrice"
              required
              hint="Per unit, up to 6 decimals"
            >
              <Input
                id="salePrice"
                name="salePrice"
                required
                inputMode="decimal"
                defaultValue={product?.salePrice}
                placeholder="49.90"
              />
            </Field>

            <Field
              label="Minimum stock"
              htmlFor="minimumStock"
              hint="Zero disables the replenishment alert"
            >
              <Input
                id="minimumStock"
                name="minimumStock"
                inputMode="decimal"
                defaultValue={product?.minimumStock ?? '0'}
                placeholder="40"
              />
            </Field>

            <Field label="Description" htmlFor="description" className="sm:col-span-2">
              <Textarea
                id="description"
                name="description"
                rows={2}
                maxLength={1000}
                defaultValue={product?.description ?? ''}
              />
            </Field>

            {error !== null ? (
              <p
                role="alert"
                className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-xs text-danger-foreground sm:col-span-2"
              >
                {error}
              </p>
            ) : null}
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false)
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              {editing ? 'Save changes' : 'Create product'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
