import { NextResponse } from 'next/server'
import { currentPlayer } from '@/lib/player'
import { rankOf, topRuns } from '@/lib/runs'

export const runtime = 'nodejs'

/** Public top 100 plus the caller's own rank when signed in. */
export async function GET() {
  const [rows, player] = await Promise.all([topRuns(100), currentPlayer()])
  const me = player ? await rankOf(player.userId) : null
  return NextResponse.json({ rows, me, userId: player?.userId ?? null })
}
