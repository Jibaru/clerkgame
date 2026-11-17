import { currentUser } from '@clerk/nextjs/server'
import type { Player } from './runs'

/** The signed-in player as shown on the leaderboard, or null for guests. */
export async function currentPlayer(): Promise<Player | null> {
  const user = await currentUser()
  if (!user) return null
  const email = user.emailAddresses[0]?.emailAddress
  const username =
    user.username ||
    [user.firstName, user.lastName].filter(Boolean).join(' ') ||
    (email ? (email.split('@')[0] ?? 'player') : 'player')
  return { userId: user.id, username: username.slice(0, 40), imageUrl: user.imageUrl ?? null }
}
