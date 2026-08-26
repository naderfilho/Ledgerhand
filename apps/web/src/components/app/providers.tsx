'use client'

import { ThemeProvider } from 'next-themes'
import type * as React from 'react'
import { Toaster } from 'sonner'

export function Providers({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      storageKey="ledgerhand-theme"
      disableTransitionOnChange
    >
      {children}
      <Toaster
        position="bottom-right"
        closeButton
        toastOptions={{
          classNames: {
            toast:
              'group rounded-lg border border-border bg-surface text-foreground shadow-[var(--shadow-overlay)]',
            description: 'text-muted-foreground',
            actionButton: 'bg-primary text-primary-foreground',
            cancelButton: 'bg-muted text-muted-foreground',
            error: 'border-danger/40',
            success: 'border-positive/40',
          },
        }}
      />
    </ThemeProvider>
  )
}
