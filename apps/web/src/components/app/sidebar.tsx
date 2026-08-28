'use client'

import { usePathname } from 'next/navigation'
import { Brandmark } from '@/components/app/brandmark'
import { Wordmark } from '@/components/app/wordmark'
import Link from 'next/link'
import type * as React from 'react'
import { iconFor } from '@/lib/icons'
import type { NavGroup } from '@/lib/navigation'
import { cn } from '@/lib/utils'

/**
 * The sidebar receives an already-filtered list. Deciding visibility on the
 * server means a role that cannot reach a screen never receives its link in
 * the HTML at all -- not hidden with CSS, absent.
 */
export function Sidebar({
  groups,
  tenantName,
}: {
  readonly groups: readonly NavGroup[]
  readonly tenantName: string
}): React.JSX.Element {
  const pathname = usePathname()

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-(--spacing-sidebar) flex-col border-r border-border bg-surface-sunken lg:flex">
      <div className="flex h-(--spacing-topbar) shrink-0 items-center gap-2.5 border-b border-border px-5">
        <Brandmark className="size-8" />
        <div className="min-w-0">
          <Wordmark size="sm" className="block truncate" />
          <p className="truncate text-[0.6875rem] leading-tight text-muted-foreground">
            {tenantName}
          </p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main">
        {groups.map((group) => (
          <div key={group.label} className="mb-5 last:mb-0">
            <p className="px-2.5 pb-1.5 text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname.startsWith(item.href)
                const Icon = iconFor(item.icon)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm',
                        'transition-colors duration-150',
                        active
                          ? 'bg-surface font-medium text-foreground shadow-xs'
                          : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground',
                      )}
                    >
                      {active ? (
                        <span className="absolute inset-y-1.5 -left-3 w-0.5 rounded-r bg-primary" />
                      ) : null}
                      <Icon
                        className={cn('size-4 shrink-0', active ? 'text-primary' : 'opacity-80')}
                      />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-5 py-3">
        <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">
          ERP, MCP server, agent and evals &middot; all five phases running
        </p>
      </div>
    </aside>
  )
}
