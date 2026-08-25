'use client'

import { Banknote, Undo2 } from 'lucide-react'
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
import { Field, Input, NativeSelect } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/misc'
import { formatCurrency } from '@/lib/format'
import { performOperation, previewOperation } from '@/server/actions/operations'

const METHODS = ['pix', 'bank_transfer', 'cash', 'card', 'cheque', 'other'] as const

/**
 * Settling a title moves money, so the domain calls it destructive and the
 * dialog behaves accordingly: it shows the code-generated preview before it
 * will let the button be pressed, and it re-fetches that preview whenever the
 * amount changes -- because the sentence a person approves must describe the
 * operation they are actually about to run.
 */
export function SettleDialog({
  kind,
  titleId,
  partyName,
  description,
  outstanding,
}: {
  readonly kind: 'receivable' | 'payable'
  readonly titleId: string
  readonly partyName: string
  readonly description: string
  readonly outstanding: string
}): React.JSX.Element {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [amount, setAmount] = React.useState(outstanding)
  const [method, setMethod] = React.useState<string>('pix')
  const [preview, setPreview] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const operation = kind === 'receivable' ? 'settle_receivable' : 'settle_payable'
  const input = React.useMemo(
    () => ({
      ...(kind === 'receivable' ? { receivableId: titleId } : { payableId: titleId }),
      amount,
      method,
    }),
    [kind, titleId, amount, method],
  )

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    setError(null)
    const timer = setTimeout(() => {
      void previewOperation(operation, input).then((result) => {
        if (cancelled) return
        if (result.ok) setPreview(result.data)
        else {
          setPreview(null)
          setError(result.message)
        }
      })
    }, 200)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, operation, input])

  const submit = (): void => {
    startTransition(async () => {
      const result = await performOperation(operation, input)
      if (result.ok) {
        toast.success(`${formatCurrency(amount)} ${kind === 'receivable' ? 'received' : 'paid'}.`)
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setAmount(outstanding)
          setOpen(true)
        }}
      >
        <Banknote className="size-3.5" />
        {kind === 'receivable' ? 'Receive' : 'Pay'}
      </Button>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{kind === 'receivable' ? 'Record a payment' : 'Pay a supplier'}</DialogTitle>
          <DialogDescription>
            {partyName} &middot; {description}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Amount"
              htmlFor="settle-amount"
              hint={`${formatCurrency(outstanding)} outstanding`}
              required
            >
              <Input
                id="settle-amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value)
                }}
                autoFocus
              />
            </Field>
            <Field label="Method" htmlFor="settle-method">
              <NativeSelect
                id="settle-method"
                value={method}
                onChange={(event) => {
                  setMethod(event.target.value)
                }}
              >
                {METHODS.map((option) => (
                  <option key={option} value={option}>
                    {option.replace('_', ' ')}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>

          <div className="rounded-lg border border-border bg-surface-sunken p-3.5">
            {error !== null ? (
              <p className="text-sm text-danger">{error}</p>
            ) : preview === null ? (
              <Skeleton className="h-8 w-full" />
            ) : (
              <p className="text-sm leading-relaxed">{preview}</p>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setOpen(false)
            }}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={pending}
            disabled={error !== null || preview === null}
          >
            Confirm {kind === 'receivable' ? 'receipt' : 'payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ReverseSettlementButton({
  settlementId,
}: {
  readonly settlementId: string
}): React.JSX.Element {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

  return (
    <Button
      variant="ghost"
      size="sm"
      loading={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await performOperation('reverse_settlement', {
            settlementId,
            reason: 'Reversed from the finance screen',
          })
          if (result.ok) {
            toast.success('Settlement reversed.')
            router.refresh()
          } else {
            toast.error(result.message)
          }
        })
      }}
    >
      <Undo2 className="size-3.5" /> Reverse
    </Button>
  )
}
