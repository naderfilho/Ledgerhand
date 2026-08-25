import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import type * as React from 'react'
import { Providers } from '@/components/app/providers'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Ledgerhand',
    template: '%s · Ledgerhand',
  },
  description: 'A small-business ERP that an AI agent can operate safely.',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfbfc' },
    { media: '(prefers-color-scheme: dark)', color: '#1c1d22' },
  ],
}

export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode
}): React.JSX.Element {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
