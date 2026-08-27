import type * as React from 'react'
import { Sidebar } from '@/components/app/sidebar'
import { Topbar } from '@/components/app/topbar'
import { visibleNavigation } from '@/lib/navigation'
import { signOutAction } from '@/server/actions/session'
import { can, requireSession } from '@/server/context'
import { translator } from '@/lib/i18n'
import { currentLanguage } from '@/server/locale'

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
  const lang = await currentLanguage()
  const groups = visibleNavigation((capability) => can(session, capability))

  // Translated at the edge: NAVIGATION stays English, which is what keeps the
  // dictionary keyed by something that cannot drift.
  const t = translator(lang)
  const translated = groups.map((group) => ({
    label: t(group.label),
    items: group.items.map((item) => ({ ...item, label: t(item.label) })),
  }))

  return (
    <div className="min-h-dvh lg:pl-(--spacing-sidebar)">
      <Sidebar groups={translated} tenantName={session.tenantName} />
      <Topbar
        groups={translated}
        name={session.name}
        email={session.email}
        role={session.role}
        tenantName={session.tenantName}
        signOutAction={signOutAction}
        lang={lang}
      />
      <main className="mx-auto w-full max-w-[92rem] px-4 py-6 lg:px-8 lg:py-8">
        <div className="animate-in-up space-y-6">{children}</div>
      </main>
    </div>
  )
}
