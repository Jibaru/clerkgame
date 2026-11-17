import Link from 'next/link'
import { formatTime } from '@/components/format'
import { currentPlayer } from '@/lib/player'
import { rankOf, topRuns } from '@/lib/runs'

export const metadata = { title: 'Leaderboard · Clerk Van Run' }
export const dynamic = 'force-dynamic'

export default async function LeaderboardPage() {
  const player = await currentPlayer()
  const [rows, me] = await Promise.all([topRuns(100), player ? rankOf(player.userId) : null])
  return (
    <main className="min-h-full bg-clerk-ink bg-[radial-gradient(60%_40%_at_50%_0%,rgba(108,71,255,0.25),transparent)] px-4 py-10 text-white">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link href="/" className="text-xs uppercase tracking-wider text-clerk-gray hover:text-white">
              ← Back to the van
            </Link>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Leaderboard</h1>
            <p className="mt-1 text-sm text-gray-400">
              Best lap per driver. Score = items × bonus + time bonus.
            </p>
          </div>
          {player ? (
            <p className="rounded-lg bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10">
              {me ? (
                <>
                  You are <span className="font-mono font-semibold text-white">#{me.rank}</span> of {me.total}
                </>
              ) : (
                'No saved lap yet. Go drive!'
              )}
            </p>
          ) : (
            <Link
              href="/sign-in?redirect_url=/leaderboard"
              className="text-sm text-purple-300 hover:underline"
            >
              Sign in to see your rank
            </Link>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="rounded-2xl bg-white/5 p-8 text-center text-sm text-gray-400 ring-1 ring-white/10">
            Nobody has crossed the line yet. The first lap is yours.
          </p>
        ) : (
          <ol className="overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10">
            {rows.map((r) => {
              const mine = player?.userId === r.userId
              return (
                <li
                  key={r.userId}
                  className={`flex items-center gap-3 border-b border-white/5 px-4 py-3 last:border-b-0 ${mine ? 'bg-clerk-purple/20' : ''}`}
                >
                  <span className="w-8 shrink-0 font-mono text-sm text-clerk-gray">#{r.rank}</span>
                  {r.imageUrl ? (
                    // biome-ignore lint/performance/noImgElement: avatars come from Clerk's CDN with their own sizing.
                    <img
                      src={r.imageUrl}
                      alt=""
                      width={32}
                      height={32}
                      className="size-8 shrink-0 rounded-full bg-white/10"
                    />
                  ) : (
                    <span className="size-8 shrink-0 rounded-full bg-white/10" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.username}</span>
                  <span className="hidden gap-2 text-xs text-clerk-gray sm:flex">
                    <span>🍪 {r.collected.cookie}</span>
                    <span>🔑 {r.collected.key}</span>
                    <span>🪪 {r.collected.passkey}</span>
                  </span>
                  <span className="w-16 text-right font-mono text-xs text-clerk-gray">
                    {formatTime(r.timeMs)}
                  </span>
                  <span className="w-16 text-right font-mono text-sm font-semibold tabular-nums">
                    {r.score}
                  </span>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </main>
  )
}
