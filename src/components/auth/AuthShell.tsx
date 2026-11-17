import Link from 'next/link'
import type { ReactNode } from 'react'
import { Checker, Title } from '@/components/ui'

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
    <main className="flex min-h-full flex-col items-center justify-center gap-6 bg-clerk-ink bg-[radial-gradient(60%_50%_at_50%_100%,rgba(108,71,255,0.3),transparent)] p-4 text-white">
      <Link href="/" className="flex flex-col items-center gap-3">
        <Title className="text-5xl sm:text-6xl" />
        <Checker className="h-2 w-40 skew-x-[-8deg]" />
      </Link>
      <div className="panel w-full max-w-sm">
        <div className="unskew p-6 sm:p-8">
          <h2 className="display text-3xl font-black italic">{title}</h2>
          <p className="display mb-6 mt-1 text-base tracking-wider text-gray-400">{subtitle}</p>
          {children}
        </div>
      </div>
    </main>
  )
}
