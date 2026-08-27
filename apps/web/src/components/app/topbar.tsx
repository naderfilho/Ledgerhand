'use client'

import type { Role } from '@ledgerhand/domain'
import { LogOut, Menu, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { LanguageToggle } from '@/components/app/language-toggle'
import type { Lang } from '@/lib/i18n'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { initialsOf } from '@/lib/format'
import { iconFor } from '@/lib/icons'
import type { NavGroup } from '@/lib/navigation'
import { cn } from '@/lib/utils'
import { CommandPalette } from './command-palette'

const ROLE_TONE: Record<Role, 'primary' | 'info' | 'positive' | 'warning' | 'neutral'> = {
  admin: 'primary',
  sales: 'info',
  finance: 'positive',
  stock: 'warning',
  readonly: 'neutral',
}

export function Topbar({
  groups,
  name,
  email,
  role,
  tenantName,
  signOutAction,
  lang,
}: {
  readonly groups: readonly NavGroup[]
  readonly name: string
  readonly email: string
  readonly role: Role
  readonly tenantName: string
  readonly signOutAction: () => Promise<void>
  readonly lang: Lang
}): React.JSX.Element {
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const { setTheme, resolvedTheme } = useTheme()
  const pathname = usePathname()

  React.useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <header
      className={cn(
        'sticky top-0 z-20 flex h-(--spacing-topbar) items-center gap-3 border-b border-border',
        'bg-background/85 px-4 backdrop-blur-md lg:px-6',
      )}
    >
      <Button
        variant="ghost"
        size="iconSm"
        className="lg:hidden"
        onClick={() => {
          setMobileOpen((value) => !value)
        }}
        aria-label="Toggle navigation"
        aria-expanded={mobileOpen}
      >
        <Menu />
      </Button>

      <CommandPalette groups={groups} />

      <div className="flex-1" />

      <LanguageToggle lang={lang} />

      <Button
        variant="ghost"
        size="iconSm"
        onClick={() => {
          setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
        }}
        aria-label="Toggle theme"
      >
        <Sun className="hidden dark:block" />
        <Moon className="dark:hidden" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex items-center gap-2 rounded-md py-1 pr-2 pl-1 transition-colors hover:bg-accent',
            )}
          >
            <span className="flex size-7 items-center justify-center rounded-full bg-primary-subtle text-[0.6875rem] font-semibold text-primary">
              {initialsOf(name)}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-xs leading-tight font-medium">{name}</span>
              <span className="block text-[0.625rem] leading-tight text-muted-foreground capitalize">
                {role}
              </span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="space-y-1 py-2">
            <p className="text-sm font-medium text-foreground">{name}</p>
            <p className="text-xs">{email}</p>
            <div className="flex items-center gap-1.5 pt-1">
              <Badge tone={ROLE_TONE[role]} className="capitalize">
                {role}
              </Badge>
              <span className="truncate text-[0.6875rem] text-muted-foreground">{tenantName}</span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <form action={signOutAction}>
            <DropdownMenuItem asChild tone="danger">
              <button type="submit" className="w-full">
                <LogOut />
                Sign out
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>

      {mobileOpen ? (
        <nav
          className="absolute inset-x-0 top-full max-h-[70vh] overflow-y-auto border-b border-border bg-surface p-3 shadow-[var(--shadow-raised)] lg:hidden"
          aria-label="Main"
        >
          {groups.map((group) => (
            <div key={group.label} className="mb-4 last:mb-0">
              <p className="px-2 pb-1 text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = iconFor(item.icon)
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-accent"
                      >
                        <Icon className="size-4 text-muted-foreground" />
                        {item.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>
      ) : null}
    </header>
  )
}
