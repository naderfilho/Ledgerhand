'use server'

import { USE_CASES, type UseCaseName } from '@ledgerhand/domain'
import { revalidatePath } from 'next/cache'
import { run, type ActionResult } from '@/server/context'

/**
 * ---------------------------------------------------------------------------
 * Operations
 * ---------------------------------------------------------------------------
 * Stock, sales, purchasing and finance writes share one shape: take an input
 * the domain will validate, run it, refresh the screens it touched. Rather
 * than nine near-identical files, the mapping is a table.
 *
 * `previewOperation` is the piece that matters for phase 4: the UI asks the
 * domain to describe a destructive action in words before performing it. The
 * agent's approval card will call exactly the same function, so what a person
 * approves in the UI and what they approve for the agent is the same sentence,
 * produced by the same code.
 */

const AFFECTED_ROUTES: Partial<Record<UseCaseName, readonly string[]>> = {
  register_stock_entry: ['/stock', '/stock/movements', '/dashboard'],
  register_stock_exit: ['/stock', '/stock/movements', '/dashboard'],
  adjust_stock: ['/stock', '/stock/movements', '/dashboard'],
  create_sales_order: ['/sales', '/dashboard'],
  update_sales_order_items: ['/sales'],
  confirm_sales_order: ['/sales', '/stock', '/dashboard'],
  invoice_sales_order: ['/sales', '/stock', '/finance/receivables', '/dashboard'],
  cancel_sales_order: ['/sales', '/stock', '/finance/receivables', '/dashboard'],
  create_purchase_order: ['/purchasing'],
  place_purchase_order: ['/purchasing'],
  receive_purchase_order: ['/purchasing', '/stock', '/finance/payables', '/dashboard'],
  cancel_purchase_order: ['/purchasing'],
  settle_receivable: ['/finance/receivables', '/finance/cash', '/dashboard'],
  settle_payable: ['/finance/payables', '/finance/cash', '/dashboard'],
  reverse_settlement: ['/finance/receivables', '/finance/payables', '/finance/cash', '/dashboard'],
  open_cash_session: ['/finance/cash', '/dashboard'],
  close_daily_cash: ['/finance/cash', '/dashboard'],
}

/**
 * Runs any use case by name. The name is checked against the registry, so a
 * caller cannot invent one, and the domain still decides whether the role is
 * allowed to run it.
 */
export async function performOperation(
  name: UseCaseName,
  input: unknown,
): Promise<ActionResult<null>> {
  const useCase = USE_CASES[name]
  const result = await run(
    async (context) => await useCase.descriptor.run(input, context),
    () => null,
  )

  if (result.ok) {
    for (const route of AFFECTED_ROUTES[name] ?? []) {
      revalidatePath(route)
    }
  }
  return result
}

/**
 * Asks the domain what an operation would do, in a sentence written by code.
 * Returns null when the operation has no preview, which by design is every
 * operation that is not destructive.
 */
export async function previewOperation(
  name: UseCaseName,
  input: unknown,
): Promise<ActionResult<string | null>> {
  const preview = USE_CASES[name].descriptor.preview
  if (preview === null) return { ok: true, data: null }

  return await run(
    async (context) => await preview(input, context),
    (value) => value,
  )
}
