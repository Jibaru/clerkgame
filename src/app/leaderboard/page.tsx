import Link from 'next/link'
import { formatTime } from '@/components/format'
import { Checker } from '@/components/ui'
import { currentPlayer } from '@/lib/player'
import { rankOf, topRuns } from '@/lib/runs'

export const metadata = { title: 'Leaderboard · Clerk Van Run' }
export const dynamic = 'force-dynamic'

export default async function LeaderboardPage() {
  const player = await currentPlayer()
  const [rows, me] = await Promise.all([topRuns(100), player ? rankOf(player.userId) : null])
  return (
    <main className="min-h-full bg-clerk-ink bg-[radial-gradient(70%_45%_at_50%_0%,rgba(108,71,255,0.35),transparent)] px-4 py-10 text-white">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link
              href="/"
              className="btn-race btn-ghost display inline-flex h-9 items-center px-3 text-sm tracking-wider"
            >
              <span>← Back to the van</span>
            </Link>
            <h1 className="racing-title mt-5 text-6xl sm:text-7xl">
              Leader<span className="accent">board</span>
            </h1>
            <Checker className="mt-4 h-2 w-48 skew-x-[-8deg]" />
            <p className="display mt-3 text-base tracking-wider text-gray-400">
              Best lap per driver · score = items × bonus + time bonus
            </p>
          </div>
          {player ? (
            <p className="btn-race btn-purple display px-4 py-2 text-lg">
              <span>{me ? `You are #${me.rank} of ${me.total}` : 'No saved lap yet. Go drive!'}</span>
            </p>
          ) : (
            <Link
              href="/sign-in?redirect_url=/leaderboard"
              className="btn-race btn-purple display px-4 py-2 text-lg"
            >
              <span>Sign in to see your rank</span>
            </Link>
          )}
        </div>
        {rows.length === 0 ? (
          <div className="panel p-8 text-center">
            <p className="unskew display text-xl tracking-wider text-gray-300">
              Nobody has crossed the line yet. The first lap is yours.
            </p>
          </div>
        ) : (
          <ol className="flex flex-col gap-2">
            {rows.map((r) => {
              const mine = player?.userId === r.userId
              const podium =
                r.rank === 1
                  ? 'bg-cookie text-clerk-ink'
                  : r.rank === 2
                    ? 'bg-gray-200 text-clerk-ink'
                    : r.rank === 3
                      ? 'bg-amber-700 text-white'
                      : 'bg-black/50 text-clerk-gray'
              return (
                <li key={r.userId} className={`panel px-4 py-2.5 ${mine ? 'panel-purple' : ''}`}>
                  <div className="unskew flex items-center gap-3">
                    <span
                      className={`display flex h-8 w-10 shrink-0 items-center justify-center text-lg font-extrabold italic ${podium}`}
                    >
                      {r.rank}
                    </span>
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
                    <span className="display min-w-0 flex-1 truncate text-xl font-extrabold">
                      {r.username}
                    </span>
                    <span className="display hidden gap-3 text-sm text-clerk-gray sm:flex">
                      <span className="text-cookie">🍪 {r.collected.cookie}</span>
                      <span>🔑 {r.collected.key}</span>
                      <span className="text-clerk-lime">🪪 {r.collected.passkey}</span>
                    </span>
                    <span className="display w-16 text-right text-sm tabular-nums text-clerk-gray">
                      {formatTime(r.timeMs)}
                    </span>
                    <span className="display w-16 text-right text-2xl font-black italic tabular-nums text-clerk-lime">
                      {r.score}
                    </span>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </main>
  )
}
