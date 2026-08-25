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
import { Field, Input } from '@/components/ui/field'
import { createCustomerAction, createSupplierAction } from '@/server/actions/catalog'

/** FormData entries can be files; every field these forms read is text. */
function text(formData: FormData, key: string, fallback = ''): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value : fallback
}

/**
 * Customers and suppliers differ by one word and one due-date direction, so
 * they share a form. The payment term is the field that matters: it decides
 * when the titles this party generates will fall due.
 */
export function PartyFormDialog({
  kind,
}: {
  readonly kind: 'customer' | 'supplier'
}): React.JSX.Element {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const submit = (formData: FormData): void => {
    setError(null)
    startTransition(async () => {
      const input = {
        name: text(formData, 'name'),
        taxId: text(formData, 'taxId') || null,
        email: text(formData, 'email') || null,
        phone: text(formData, 'phone') || null,
        paymentTermDays: Number(text(formData, 'paymentTermDays', '30')),
      }

      const result =
        kind === 'customer' ? await createCustomerAction(input) : await createSupplierAction(input)

      if (result.ok) {
        toast.success(`${result.data.name} created.`)
        setOpen(false)
        router.refresh()
      } else {
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
        <Button variant="primary">
          <Plus /> New {kind}
        </Button>
      </span>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>New {kind}</DialogTitle>
          <DialogDescription>
            {kind === 'customer'
              ? 'The payment term sets the due date of receivables generated when their orders are invoiced.'
              : 'The payment term sets the due date of the payable generated when their deliveries are received.'}
          </DialogDescription>
        </DialogHeader>

        <form action={submit}>
          <DialogBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="name" required className="sm:col-span-2">
              <Input id="name" name="name" required maxLength={120} autoFocus />
            </Field>
            <Field label="Tax id" htmlFor="taxId" hint="CNPJ or CPF">
              <Input id="taxId" name="taxId" maxLength={32} placeholder="12.345.678/0001-90" />
            </Field>
            <Field
              label="Payment term"
              htmlFor="paymentTermDays"
              hint="Days until a title falls due"
            >
              <Input
                id="paymentTermDays"
                name="paymentTermDays"
                type="number"
                min={0}
                max={365}
                defaultValue={30}
              />
            </Field>
            <Field label="E-mail" htmlFor="email">
              <Input id="email" name="email" type="email" />
            </Field>
            <Field label="Phone" htmlFor="phone">
              <Input id="phone" name="phone" maxLength={32} />
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
              Create {kind}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
