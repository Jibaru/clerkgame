import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Clerk Van Run',
  description:
    'One lap in the Clerk Van through an alpine valley. Collect cookies, API keys and passkeys, beat the clock and climb the public leaderboard.',
}

export const viewport: Viewport = {
  themeColor: '#131316',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full font-sans">
        <ClerkProvider>{children}</ClerkProvider>
      </body>
    </html>
  )
}
