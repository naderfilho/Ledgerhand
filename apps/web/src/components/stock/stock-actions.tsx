'use client'

import { ArrowDownToLine, ArrowUpFromLine, Scale } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'
import { ConfirmOperation } from '@/components/app/confirm-operation'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal } from 'lucide-react'
import { performOperation } from '@/server/actions/operations'

/** FormData entries can be files; every field these forms read is text. */
function text(formData: FormData, key: string, fallback = ''): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value : fallback
}

export interface StockRowActionsProps {
  readonly productId: string
  readonly sku: string
  readonly name: string
  readonly unit: string
  readonly canWrite: boolean
  readonly canAdjust: boolean
}

/**
 * Three ways stock moves by hand, and they are not equally safe. An entry is
 * ordinary and opens a plain form. A write-off and an adjustment are
 * destructive, so both route through the approval card that shows what the
 * domain says they would do.
 */
export function StockRowActions({
  productId,
  sku,
  name,
  unit,
  canWrite,
  canAdjust,
}: StockRowActionsProps): React.JSX.Element | null {
  const [entryOpen, setEntryOpen] = React.useState(false)

  if (!canWrite && !canAdjust) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="iconSm" aria-label={`Stock actions for ${sku}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canWrite ? (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault()
                setEntryOpen(true)
              }}
            >
              <ArrowDownToLine />
              Register entry
            </DropdownMenuItem>
          ) : null}

          {canWrite ? (
            <ConfirmOperation
              operation="register_stock_exit"
              input={{ productId, quantity: '1' }}
              title="Write stock off"
              confirmLabel="Write off"
              successMessage={`${sku} written off.`}
              trigger={
                <DropdownMenuItem
                  tone="danger"
                  onSelect={(event) => {
                    event.preventDefault()
                  }}
                >
                  <ArrowUpFromLine />
                  Write off 1 {unit}
                </DropdownMenuItem>
              }
            />
          ) : null}

          {canAdjust ? (
            <ConfirmOperation
              operation="adjust_stock"
              input={{ productId, delta: '-1' }}
              reasonField={{
                key: 'reason',
                label: 'Why does the count differ?',
                hint: 'Stored on the movement and visible in the audit trail.',
              }}
              title="Adjust stock"
              confirmLabel="Adjust"
              successMessage={`${sku} adjusted.`}
              trigger={
                <DropdownMenuItem
                  tone="danger"
                  onSelect={(event) => {
                    event.preventDefault()
                  }}
                >
                  <Scale />
                  Adjust by −1 {unit}
                </DropdownMenuItem>
              }
            />
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <StockEntryDialog
        open={entryOpen}
        onOpenChange={setEntryOpen}
        productId={productId}
        sku={sku}
        name={name}
        unit={unit}
      />
    </>
  )
}

function StockEntryDialog({
  open,
  onOpenChange,
  productId,
  sku,
  name,
  unit,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly productId: string
  readonly sku: string
  readonly name: string
  readonly unit: string
}): React.JSX.Element {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const submit = (formData: FormData): void => {
    setError(null)
    startTransition(async () => {
      const result = await performOperation('register_stock_entry', {
        productId,
        quantity: text(formData, 'quantity'),
        unitCost: text(formData, 'unitCost'),
        reason: text(formData, 'reason', 'manual_entry'),
        note: text(formData, 'note') || null,
      })

      if (result.ok) {
        toast.success(`Stock added to ${sku}.`)
        onOpenChange(false)
        router.refresh()
      } else {
        setError(result.message)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register stock entry</DialogTitle>
          <DialogDescription>
            {sku} &middot; {name}. The unit cost recalculates the weighted average, so it should be
            what you actually paid.
          </DialogDescription>
        </DialogHeader>

        <form action={submit}>
          <DialogBody className="grid gap-4 sm:grid-cols-2">
            <Field label={`Quantity (${unit})`} htmlFor="quantity" required>
              <Input
                id="quantity"
                name="quantity"
                inputMode="decimal"
                required
                defaultValue="1"
                autoFocus
              />
            </Field>
            <Field label="Unit cost" htmlFor="unitCost" required>
              <Input
                id="unitCost"
                name="unitCost"
                inputMode="decimal"
                required
                placeholder="12.50"
              />
            </Field>
            <Field label="Reason" htmlFor="reason" className="sm:col-span-2">
              <NativeSelect id="reason" name="reason" defaultValue="manual_entry">
                <option value="manual_entry">Manual entry</option>
                <option value="opening_balance">Opening balance</option>
              </NativeSelect>
            </Field>
            <Field label="Note" htmlFor="note" className="sm:col-span-2">
              <Textarea id="note" name="note" rows={2} maxLength={500} />
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
                onOpenChange(false)
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              Add to stock
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
