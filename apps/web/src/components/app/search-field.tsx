'use client'

import { Search, X } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Search lives in the URL, so a filtered table can be bookmarked, shared and
 * reloaded. Typing is debounced and the transition is non-blocking, which
 * keeps the current rows on screen while the next ones are fetched instead of
 * flashing a spinner over the whole table.
 */
export function SearchField({
  placeholder = 'Search…',
  paramName = 'q',
  className,
}: {
  readonly placeholder?: string
  readonly paramName?: string
  readonly className?: string
}): React.JSX.Element {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [value, setValue] = React.useState(params.get(paramName) ?? '')
  const [, startTransition] = React.useTransition()

  React.useEffect(() => {
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString())
      if (value === '') next.delete(paramName)
      else next.set(paramName, value)
      next.delete('page')

      const query = next.toString()
      startTransition(() => {
        router.replace(query === '' ? pathname : `${pathname}?${query}`, { scroll: false })
      })
    }, 250)

    return () => {
      clearTimeout(timer)
    }
  }, [value])

  return (
    <div className={cn('relative w-full max-w-xs', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(
          'h-9 w-full rounded-md border border-input bg-surface pr-8 pl-9 text-sm shadow-xs',
          'placeholder:text-muted-foreground/70 [&::-webkit-search-cancel-button]:hidden',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:outline-none',
        )}
      />
      {value !== '' ? (
        <button
          type="button"
          onClick={() => {
            setValue('')
          }}
          aria-label="Clear search"
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}

/** Segmented control bound to a URL parameter, for status filters. */
export function FilterTabs({
  paramName,
  options,
  className,
}: {
  readonly paramName: string
  readonly options: readonly {
    readonly value: string
    readonly label: string
    readonly count?: number
  }[]
  readonly className?: string
}): React.JSX.Element {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const active = params.get(paramName) ?? ''

  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-sunken p-0.5',
        className,
      )}
      role="tablist"
    >
      {options.map((option) => {
        const selected = active === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => {
              const next = new URLSearchParams(params.toString())
              if (option.value === '') next.delete(paramName)
              else next.set(paramName, option.value)
              next.delete('page')
              const query = next.toString()
              router.replace(query === '' ? pathname : `${pathname}?${query}`, { scroll: false })
            }}
            className={cn(
              'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-150',
              selected
                ? 'bg-surface text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className="ml-1.5 tabular text-muted-foreground">{option.count}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
