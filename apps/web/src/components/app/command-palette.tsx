'use client'

import { Command } from 'cmdk'
import { Moon, Search, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import type { NavGroup } from '@/lib/navigation'
import { cn } from '@/lib/utils'

/**
 * Command-K. An ERP has thirty screens and a user who is already typing; the
 * palette is faster than the sidebar for anybody who uses the system daily,
 * and it costs nothing for anybody who does not.
 */
export function CommandPalette({
  groups,
}: {
  readonly groups: readonly NavGroup[]
}): React.JSX.Element {
  const [open, setOpen] = React.useState(false)
  const router = useRouter()
  const { setTheme, resolvedTheme } = useTheme()

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const go = React.useCallback(
    (href: string) => {
      setOpen(false)
      router.push(href)
    },
    [router],
  )

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true)
        }}
        className={cn(
          'group flex h-9 w-full max-w-72 items-center gap-2 rounded-md border border-border',
          'bg-surface px-3 text-sm text-muted-foreground shadow-xs transition-colors',
          'hover:border-border-strong hover:text-foreground',
        )}
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search or jump to…</span>
        <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.625rem] text-muted-foreground sm:inline-block">
          ⌘K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md" className="top-[18%] translate-y-0 p-0" aria-label="Command menu">
          <Command
            label="Command menu"
            className="[&_[cmdk-input-wrapper]]:border-b [&_[cmdk-input-wrapper]]:border-border"
            loop
          >
            <div cmdk-input-wrapper="" className="flex items-center gap-2 px-4">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <Command.Input
                autoFocus
                placeholder="Search screens and actions…"
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            <Command.List className="max-h-80 overflow-y-auto p-2">
              <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
                Nothing matches that.
              </Command.Empty>

              {groups.map((group) => (
                <Command.Group
                  key={group.label}
                  heading={group.label}
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[0.625rem] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase"
                >
                  {group.items.map((item) => {
                    const Icon = item.icon
                    return (
                      <Command.Item
                        key={item.href}
                        value={`${group.label} ${item.label} ${(item.keywords ?? []).join(' ')}`}
                        onSelect={() => {
                          go(item.href)
                        }}
                        className={cn(
                          'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm',
                          'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
                        )}
                      >
                        <Icon className="size-4 text-muted-foreground" />
                        {item.label}
                      </Command.Item>
                    )
                  })}
                </Command.Group>
              ))}

              <Command.Group
                heading="Preferences"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[0.625rem] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase"
              >
                <Command.Item
                  value="toggle theme dark light appearance"
                  onSelect={() => {
                    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
                    setOpen(false)
                  }}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm data-[selected=true]:bg-accent"
                >
                  {resolvedTheme === 'dark' ? (
                    <Sun className="size-4 text-muted-foreground" />
                  ) : (
                    <Moon className="size-4 text-muted-foreground" />
                  )}
                  Switch to {resolvedTheme === 'dark' ? 'light' : 'dark'} theme
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  )
}
