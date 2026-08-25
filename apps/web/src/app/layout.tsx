import type { Metadata, Viewport } from 'next'
import { Inter, Poppins } from 'next/font/google'
import type * as React from 'react'
import { Providers } from '@/components/app/providers'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

/** The wordmark only, so the two halves of the logo keep their geometry. */
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-display',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'LedgerHand',
    template: '%s · LedgerHand',
  },
  description: 'A small-business ERP that an AI agent can operate safely.',
}

export const viewport: Viewport = {
  themeColor: [
    // The two grounds of the palette, so the browser chrome matches the page.
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#16192b' },
  ],
}

export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode
}): React.JSX.Element {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable + ' ' + poppins.variable}>
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
