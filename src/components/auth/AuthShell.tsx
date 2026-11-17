import Link from 'next/link'
import type { ReactNode } from 'react'

/** Dark frame shared by sign-in and sign-up, matching the game's HUD. */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <main className="flex min-h-full items-center justify-center bg-clerk-ink bg-[radial-gradient(60%_50%_at_50%_100%,rgba(108,71,255,0.25),transparent)] p-4 text-white">
      <div className="w-full max-w-sm rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur sm:p-8">
        <Link href="/" className="text-xs uppercase tracking-wider text-clerk-gray hover:text-white">
          ← Clerk Van Run
        </Link>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mb-6 mt-1 text-sm text-gray-400">{subtitle}</p>
        {children}
      </div>
    </main>
  )
}
