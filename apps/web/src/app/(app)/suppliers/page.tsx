import { USE_CASES } from '@ledgerhand/domain'
import type { Metadata } from 'next'
import type * as React from 'react'
import { PartyFormDialog } from '@/components/parties/party-form'
import { PartyTable } from '@/components/parties/party-table'
import { PageHeader } from '@/components/ui/misc'
import { can, query, requireSession } from '@/server/context'
import { presentParty } from '@/server/present'

export const metadata: Metadata = { title: 'Suppliers' }
export const dynamic = 'force-dynamic'

export default async function SuppliersPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<React.JSX.Element> {
  const session = await requireSession()
  const params = await searchParams
  const search = typeof params['q'] === 'string' && params['q'] !== '' ? params['q'] : undefined

  const data = await query(async (context) => {
    const listed = await USE_CASES.list_suppliers.execute(
      {
        ...(search === undefined ? {} : { search }),
        activeOnly: true,
        page: { limit: 200, offset: 0 },
      },
      context,
    )
    if (!listed.ok) return { rows: [], total: 0 }
    return { rows: listed.value.rows.map(presentParty), total: listed.value.total }
  })

  const canCreate = can(session, 'catalog:write')

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Who you buy from, and how long you have to pay them."
        actions={canCreate ? <PartyFormDialog kind="supplier" /> : undefined}
      />
      <PartyTable
        kind="supplier"
        rows={data.rows}
        total={data.total}
        canCreate={canCreate}
        searching={search !== undefined}
      />
    </>
  )
}
