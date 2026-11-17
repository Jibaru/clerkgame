'use client'

import { SignOutButton, useUser } from '@clerk/nextjs'
import Link from 'next/link'

/** Leaderboard link and the session as slanted chips, shown outside of the race itself. */
export function TopBar() {
  const { user, isLoaded } = useUser()
  const chip = 'btn-race btn-ghost display flex h-10 items-center px-4 text-base tracking-wider'
  return (
    <div className="pointer-events-auto absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-2 slide-in-left">
      <Link href="/leaderboard" className={chip}>
        <span>Leaderboard</span>
      </Link>
      {!isLoaded ? null : user ? (
        <>
          <span className={`${chip} gap-2 normal-case tracking-normal`}>
            <span className="flex items-center gap-2">
              {user.imageUrl ? (
                // biome-ignore lint/performance/noImgElement: Clerk avatar URL, already sized.
                <img src={user.imageUrl} alt="" width={22} height={22} className="size-[22px] rounded-full" />
              ) : null}
              <span className="max-w-28 truncate">{user.username ?? user.firstName ?? 'you'}</span>
            </span>
          </span>
          <SignOutButton>
            <button type="button" className={`${chip} text-clerk-gray hover:text-white`}>
              <span>Sign out</span>
            </button>
          </SignOutButton>
        </>
      ) : (
        <Link
          href="/sign-in"
          className="btn-race btn-purple display flex h-10 items-center px-4 text-base tracking-wider"
        >
          <span>Sign in</span>
        </Link>
      )}
    </div>
  )
}
