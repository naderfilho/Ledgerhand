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

import { currentLanguage } from '@/server/locale'

export default async function RootLayout({
  children,
}: {
  readonly children: React.ReactNode
}): Promise<React.JSX.Element> {
  // The document has to declare the language it is actually in. Marked `en`
  // while rendering Portuguese, a browser offers to translate the page and
  // then translates the product name along with it.
  const lang = await currentLanguage()

  return (
    <html lang={lang} suppressHydrationWarning className={inter.variable + ' ' + poppins.variable}>
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
