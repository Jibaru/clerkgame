'use client'

import { useEffect, useRef, useState } from 'react'
import type { GameHandle, Snapshot } from '@/game/createGame'
import { ITEM_COUNTS } from '@/game/items'

function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(ms))
  const m = Math.floor(total / 60000)
  const s = Math.floor((total % 60000) / 1000)
  const cs = Math.floor((total % 1000) / 10)
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

export function Hud({ game, snap }: { game: GameHandle; snap: Snapshot }) {
  const coarse = useCoarsePointer()
  return (
    <div className="pointer-events-none absolute inset-0 select-none text-white">
      {snap.phase === 'loading' && <Loading progress={snap.progress} />}
      {snap.phase === 'ready' && <Start onStart={game.start} coarse={coarse} />}
      {(snap.phase === 'countdown' || snap.phase === 'racing' || snap.phase === 'finished') && (
        <RaceHud snap={snap} />
      )}
      {snap.phase === 'countdown' && <Countdown value={snap.countdown} />}
      {snap.phase === 'finished' && snap.result && <Finished snap={snap} onRetry={game.restart} />}
      {coarse && snap.phase === 'racing' && <TouchControls game={game} />}
    </div>
  )
}

function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    setCoarse(mq.matches)
    const on = (e: MediaQueryListEvent) => setCoarse(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return coarse
}

function Loading({ progress }: { progress: number }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-clerk-ink">
      <Wordmark />
      <div className="h-1.5 w-56 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full bg-clerk-purple transition-[width]"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <p className="text-xs text-clerk-gray">Loading the van and the valley…</p>
    </div>
  )
}

function Wordmark() {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-3xl font-semibold tracking-tight">Clerk Van Run</span>
    </div>
  )
}

function Start({ onStart, coarse }: { onStart: () => void; coarse: boolean }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-end gap-5 bg-gradient-to-t from-clerk-ink/90 via-clerk-ink/30 to-transparent p-6 pb-10 sm:justify-center sm:pb-6">
      <div className="pointer-events-auto flex w-full max-w-md flex-col items-center gap-4 rounded-2xl bg-clerk-ink/80 p-6 text-center ring-1 ring-white/10 backdrop-blur">
        <Wordmark />
        <p className="text-balance text-sm text-gray-300">
          One lap through the valley. Grab cookies, API keys and passkeys, collect all three pieces of{' '}
          <code className="rounded bg-white/10 px-1 font-mono text-xs">&lt;SignIn/&gt;</code> for a x1.5
          bonus, and keep away from the spam bots.
        </p>
        <button
          type="button"
          onClick={onStart}
          className="h-12 w-full rounded-lg bg-clerk-purple text-base font-semibold shadow-lg shadow-clerk-purple/30 transition hover:bg-clerk-purple-dark"
        >
          Start the run
        </button>
        <p className="text-xs text-clerk-gray">
          {coarse
            ? 'Touch: steer on the left, gas and brake on the right.'
            : 'WASD or arrows to drive, Space to brake, R to restart.'}
        </p>
      </div>
    </div>
  )
}

function Countdown({ value }: { value: number }) {
  const n = Math.ceil(value)
  const label = n >= 1 && n <= 3 ? String(n) : 'GO'
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <span
        key={label}
        className="countdown-pop font-mono text-[18vmin] font-bold leading-none text-white drop-shadow-[0_6px_30px_rgba(108,71,255,0.8)]"
      >
        {label}
      </span>
    </div>
  )
}

const KINDS = [
  { key: 'cookie', label: 'Cookies', icon: '🍪' },
  { key: 'key', label: 'API keys', icon: '🔑' },
  { key: 'passkey', label: 'Passkeys', icon: '🪪' },
] as const

function RaceHud({ snap }: { snap: Snapshot }) {
  const boostPct = Math.round((snap.boost / 3) * 100)
  return (
    <>
      <div className="absolute left-4 top-4 flex flex-col gap-1 rounded-xl bg-clerk-ink/70 px-4 py-3 ring-1 ring-white/10 backdrop-blur">
        <span className="font-mono text-3xl tabular-nums leading-none">{fmt(snap.timeMs)}</span>
        <span className="text-xs uppercase tracking-wider text-clerk-gray">
          Score <span className="font-mono text-base text-white">{snap.score.total}</span>
        </span>
      </div>
      <div className="absolute right-4 top-4 flex flex-col items-end gap-1.5 rounded-xl bg-clerk-ink/70 px-4 py-3 text-sm ring-1 ring-white/10 backdrop-blur">
        {KINDS.map((k) => (
          <span key={k.key} className="flex items-center gap-2 font-mono tabular-nums">
            <span aria-hidden>{k.icon}</span>
            <span>{snap.collected[k.key]}</span>
            <span className="text-clerk-gray">/ {ITEM_COUNTS[k.key]}</span>
          </span>
        ))}
        <span className="mt-1 flex gap-1 font-mono text-xs">
          {(['<', 'SignIn', '/>'] as const).map((p, i) => (
            <span
              key={p}
              className={`rounded px-1.5 py-0.5 ring-1 ${snap.signin[i] ? 'bg-clerk-purple text-white ring-clerk-purple' : 'text-clerk-gray ring-white/15'}`}
            >
              {p}
            </span>
          ))}
        </span>
      </div>
      <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1">
        {snap.boost > 0 && (
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-sky-400" style={{ width: `${boostPct}%` }} />
          </div>
        )}
        <span className="font-mono text-2xl tabular-nums">
          {Math.round(snap.speedKmh)} <span className="text-sm text-clerk-gray">km/h</span>
        </span>
      </div>
      <div className="absolute bottom-5 right-4 hidden h-1.5 w-40 overflow-hidden rounded-full bg-white/10 sm:block">
        <div className="h-full bg-clerk-lime" style={{ width: `${Math.round(snap.lap * 100)}%` }} />
      </div>
    </>
  )
}

function Finished({ snap, onRetry }: { snap: Snapshot; onRetry: () => void }) {
  const r = snap.result
  if (!r) return null
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-clerk-ink/60 p-4 backdrop-blur-sm">
      <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-clerk-ink/90 p-6 ring-1 ring-white/10">
        <p className="text-xs uppercase tracking-wider text-clerk-gray">Lap complete</p>
        <p className="mt-1 font-mono text-5xl font-bold tabular-nums">{r.score.total}</p>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-clerk-gray">Time</dt>
          <dd className="text-right font-mono tabular-nums">{fmt(r.timeMs)}</dd>
          <dt className="text-clerk-gray">Items</dt>
          <dd className="text-right font-mono tabular-nums">{r.score.items}</dd>
          <dt className="text-clerk-gray">&lt;SignIn/&gt; bonus</dt>
          <dd className="text-right font-mono tabular-nums">x{r.score.multiplier}</dd>
          <dt className="text-clerk-gray">Time bonus</dt>
          <dd className="text-right font-mono tabular-nums">+{r.score.timeBonus}</dd>
          <dt className="text-clerk-gray">Spam bot hits</dt>
          <dd className="text-right font-mono tabular-nums">
            {r.botHits} ({r.cookiesLost} cookies lost)
          </dd>
        </dl>
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="h-11 flex-1 rounded-lg bg-white/10 text-sm font-semibold ring-1 ring-white/15 transition hover:bg-white/15"
          >
            Run again
          </button>
          <button
            type="button"
            disabled
            className="h-11 flex-1 rounded-lg bg-clerk-purple text-sm font-semibold opacity-60"
            title="Leaderboard coming next"
          >
            Save to leaderboard
          </button>
        </div>
      </div>
    </div>
  )
}

function TouchControls({ game }: { game: GameHandle }) {
  const state = useRef({ left: false, right: false, gas: false, brake: false })
  const push = () => {
    const s = state.current
    game.setTouch({
      throttle: s.gas ? 1 : 0,
      steer: (s.left ? 1 : 0) - (s.right ? 1 : 0),
      brake: s.brake,
    })
  }
  useEffect(() => () => game.setTouch({ throttle: 0, steer: 0, brake: false }), [game])
  const bind = (key: keyof typeof state.current) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      state.current[key] = true
      push()
    },
    onPointerUp: () => {
      state.current[key] = false
      push()
    },
    onPointerCancel: () => {
      state.current[key] = false
      push()
    },
  })
  const cls =
    'pointer-events-auto flex size-16 items-center justify-center rounded-full bg-white/10 text-2xl ring-1 ring-white/20 backdrop-blur active:bg-clerk-purple/70'
  return (
    <>
      <div className="absolute bottom-6 left-5 flex gap-3">
        <button type="button" aria-label="Steer left" className={cls} {...bind('left')}>
          ←
        </button>
        <button type="button" aria-label="Steer right" className={cls} {...bind('right')}>
          →
        </button>
      </div>
      <div className="absolute bottom-6 right-5 flex gap-3">
        <button type="button" aria-label="Brake" className={cls} {...bind('brake')}>
          ■
        </button>
        <button
          type="button"
          aria-label="Accelerate"
          className={`${cls} size-20 bg-clerk-purple/50`}
          {...bind('gas')}
        >
          ▲
        </button>
      </div>
    </>
  )
}
