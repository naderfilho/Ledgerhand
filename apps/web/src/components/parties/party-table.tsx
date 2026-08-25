import { Users } from 'lucide-react'
import type * as React from 'react'
import { SearchField } from '@/components/app/search-field'
import { PartyFormDialog } from '@/components/parties/party-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/misc'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import type { PartyView } from '@/server/present'

export function PartyTable({
  kind,
  rows,
  total,
  canCreate,
  searching,
}: {
  readonly kind: 'customer' | 'supplier'
  readonly rows: readonly PartyView[]
  readonly total: number
  readonly canCreate: boolean
  readonly searching: boolean
}): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {total} {kind}
          {total === 1 ? '' : 's'}
        </CardTitle>
        <SearchField placeholder={`Search ${kind}s…`} />
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Users className="size-5" />}
            title={searching ? 'Nothing matches that search' : `No ${kind}s yet`}
            description={
              searching
                ? 'Try a different name or tax id.'
                : `Create a ${kind} to start recording business with them.`
            }
            action={canCreate && !searching ? <PartyFormDialog kind={kind} /> : undefined}
          />
        ) : (
          <TableWrapper>
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Tax id</TH>
                  <TH>Contact</TH>
                  <TH numeric>Payment term</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((party) => (
                  <TR key={party.id}>
                    <TD className="font-medium">{party.name}</TD>
                    <TD className="font-mono text-xs text-muted-foreground">
                      {party.taxId ?? '—'}
                    </TD>
                    <TD className="text-muted-foreground">
                      <span className="block max-w-64 truncate">{party.email ?? '—'}</span>
                      {party.phone !== null ? (
                        <span className="block text-xs">{party.phone}</span>
                      ) : null}
                    </TD>
                    <TD numeric className="text-muted-foreground">
                      {party.paymentTermDays} days
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        )}
      </CardContent>
    </Card>
  )
}
