import { NextResponse } from 'next/server'
import { currentPlayer } from '@/lib/player'
import { rankOf, saveRun, secondsSinceLastRun, validateRun } from '@/lib/runs'

export const runtime = 'nodejs'

/** Submit a finished lap. Requires a Clerk session; the server recomputes the score. */
export async function POST(request: Request) {
  const player = await currentPlayer()
  if (!player) return NextResponse.json({ error: 'Sign in to save your run.' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }
  const validation = validateRun(body)
  if (!validation.ok)
    return NextResponse.json({ error: `Run rejected: ${validation.reason}.` }, { status: 422 })

  const age = await secondsSinceLastRun(player.userId)
  if (age !== null && age < 30) {
    return NextResponse.json({ error: 'Easy there: one run every 30 seconds.' }, { status: 429 })
  }

  const { id } = await saveRun(player, validation.run)
  const rank = await rankOf(player.userId)
  return NextResponse.json({ id, score: validation.run.score, rank })
}
