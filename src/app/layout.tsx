import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { assetUrl } from '@/game/assets'
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
      <head>
        {/* Start the two biggest downloads while the JavaScript is still arriving. */}
        <link rel="preload" href={assetUrl('/models/clerk_van.glb')} as="fetch" crossOrigin="anonymous" />
        <link
          rel="preload"
          href="/textures/alps_field/alps_field_1k.hdr"
          as="fetch"
          crossOrigin="anonymous"
        />
      </head>
      <body className="h-full font-sans">
        <ClerkProvider
          // Read on the server at request time, so one image serves dev and production keys.
          publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY}
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/"
          signUpFallbackRedirectUrl="/"
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  )
}
