'use client'

import { SignOutButton, useUser } from '@clerk/nextjs'
import Link from 'next/link'

/** Leaderboard link and the session, shown outside of the race itself. */
export function TopBar() {
  const { user, isLoaded } = useUser()
  return (
    <div className="pointer-events-auto absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-1 rounded-full bg-clerk-ink/70 p-1 text-sm ring-1 ring-white/10 backdrop-blur">
      <Link href="/leaderboard" className="rounded-full px-3 py-1.5 hover:bg-white/10">
        Leaderboard
      </Link>
      {!isLoaded ? null : user ? (
        <span className="flex items-center gap-2 pl-2">
          {user.imageUrl ? (
            // biome-ignore lint/performance/noImgElement: Clerk avatar URL, already sized.
            <img src={user.imageUrl} alt="" width={24} height={24} className="size-6 rounded-full" />
          ) : null}
          <span className="max-w-28 truncate text-gray-200">{user.username ?? user.firstName ?? 'you'}</span>
          <SignOutButton>
            <button
              type="button"
              className="rounded-full px-3 py-1.5 text-clerk-gray hover:bg-white/10 hover:text-white"
            >
              Sign out
            </button>
          </SignOutButton>
        </span>
      ) : (
        <Link
          href="/sign-in"
          className="rounded-full bg-clerk-purple px-3 py-1.5 font-medium hover:bg-clerk-purple-dark"
        >
          Sign in
        </Link>
      )}
    </div>
  )
}
