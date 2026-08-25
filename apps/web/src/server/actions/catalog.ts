'use server'

import { USE_CASES } from '@ledgerhand/domain'
import { revalidatePath } from 'next/cache'
import { presentParty, presentProduct, type PartyView, type ProductView } from '@/server/present'
import { run, type ActionResult } from '@/server/context'

/**
 * Server actions are thin on purpose. They validate nothing themselves -- the
 * use case's zod schema does that, and doing it twice is how the two versions
 * eventually disagree. What lives here is the choice of which use case to call
 * and which route to revalidate afterwards.
 */

export async function createProductAction(input: unknown): Promise<ActionResult<ProductView>> {
  const result = await run(
    async (context) => await USE_CASES.create_product.descriptor.run(input, context),
    (value) => presentProduct(value as never),
  )
  if (result.ok) {
    revalidatePath('/products')
    revalidatePath('/stock')
  }
  return result
}

export async function updateProductAction(input: unknown): Promise<ActionResult<ProductView>> {
  const result = await run(
    async (context) => await USE_CASES.update_product.descriptor.run(input, context),
    (value) => presentProduct(value as never),
  )
  if (result.ok) {
    revalidatePath('/products')
    revalidatePath('/stock')
  }
  return result
}

export async function archiveProductAction(input: unknown): Promise<ActionResult<ProductView>> {
  const result = await run(
    async (context) => await USE_CASES.archive_product.descriptor.run(input, context),
    (value) => presentProduct(value as never),
  )
  if (result.ok) revalidatePath('/products')
  return result
}

/** The sentence a person approves before a destructive action runs. */
export async function previewArchiveProduct(input: unknown): Promise<ActionResult<string>> {
  return await run(
    async (context) =>
      (await USE_CASES.archive_product.descriptor.preview?.(input, context)) ?? {
        ok: false as const,
        error: {
          code: 'NOT_FOUND' as const,
          message: 'No preview is available for this operation.',
          details: {},
        },
      },
    (value) => value,
  )
}

export async function createCustomerAction(input: unknown): Promise<ActionResult<PartyView>> {
  const result = await run(
    async (context) => await USE_CASES.create_customer.descriptor.run(input, context),
    (value) => presentParty(value as never),
  )
  if (result.ok) revalidatePath('/customers')
  return result
}

export async function createSupplierAction(input: unknown): Promise<ActionResult<PartyView>> {
  const result = await run(
    async (context) => await USE_CASES.create_supplier.descriptor.run(input, context),
    (value) => presentParty(value as never),
  )
  if (result.ok) revalidatePath('/suppliers')
  return result
}
