import type * as React from 'react'
import { Sidebar } from '@/components/app/sidebar'
import { Topbar } from '@/components/app/topbar'
import { visibleNavigation } from '@/lib/navigation'
import { signOutAction } from '@/server/actions/session'
import { can, requireSession } from '@/server/context'

/**
 * The authenticated shell. Navigation is filtered on the server against the
 * signed-in role, so a link the role cannot follow is never rendered.
 */
export default async function AppLayout({
  children,
}: {
  readonly children: React.ReactNode
}): Promise<React.JSX.Element> {
  const session = await requireSession()
  const groups = visibleNavigation((capability) => can(session, capability))

  return (
    <div className="min-h-dvh lg:pl-(--spacing-sidebar)">
      <Sidebar groups={groups} tenantName={session.tenantName} />
      <Topbar
        groups={groups}
        name={session.name}
        email={session.email}
        role={session.role}
        tenantName={session.tenantName}
        signOutAction={signOutAction}
      />
      <main className="mx-auto w-full max-w-[92rem] px-4 py-6 lg:px-8 lg:py-8">
        <div className="animate-in-up space-y-6">{children}</div>
      </main>
    </div>
  )
}
