'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameEvent, GameHandle, Snapshot } from '@/game/createGame'
import { ITEM_COUNTS, type ItemKind, POINTS } from '@/game/items'
import { formatTime as fmt } from './format'
import { TopBar } from './TopBar'
import { Checker, Icon, type IconName, Panel, RaceButton, Title } from './ui'
import { useRunSubmission } from './useRunSubmission'

export function Hud({
  game,
  snap,
  muted,
  onToggleMute,
  onStart,
}: {
  game: GameHandle
  snap: Snapshot
  muted: boolean
  onToggleMute: () => void
  onStart: () => void
}) {
  const coarse = useCoarsePointer()
  const submission = useRunSubmission()
  const racing = snap.phase === 'countdown' || snap.phase === 'racing' || snap.phase === 'finished'
  return (
    <div id="hud" className="pointer-events-none absolute inset-0 select-none overflow-hidden text-white">
      {snap.phase === 'loading' && <Loading progress={snap.progress} />}
      {(snap.phase === 'ready' || snap.phase === 'finished') && <TopBar />}
      {snap.phase === 'ready' && <Start onStart={onStart} coarse={coarse} />}
      {snap.phase === 'ready' && submission.restored.status !== 'idle' && (
        <RestoredToast state={submission.restored} onClose={submission.dismissRestored} />
      )}
      {racing && <RaceHud snap={snap} coarse={coarse} />}
      {racing && <Popups game={game} />}
      {snap.phase === 'countdown' && <Countdown value={snap.countdown} />}
      {snap.phase === 'racing' && snap.timeMs < 1200 && <Go />}
      {snap.phase === 'finished' && snap.result && (
        <Finished
          snap={snap}
          onRetry={() => {
            submission.reset()
            game.restart()
          }}
          submission={submission}
        />
      )}
      {coarse && snap.phase === 'racing' && <TouchControls game={game} />}
      {snap.phase !== 'loading' && !(coarse && snap.phase === 'racing') && (
        <button
          type="button"
          onClick={onToggleMute}
          aria-pressed={muted}
          aria-label={muted ? 'Unmute' : 'Mute'}
          title={muted ? 'Unmute (M)' : 'Mute (M)'}
          className="btn-race btn-ghost pointer-events-auto absolute right-4 bottom-24 flex size-10 items-center justify-center text-base"
        >
          <span>{muted ? '🔇' : '🔊'}</span>
        </button>
      )}
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

// ---------------------------------------------------------------------------------- loading

function Loading({ progress }: { progress: number }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-clerk-ink bg-[radial-gradient(70%_60%_at_50%_100%,rgba(108,71,255,0.35),transparent)]">
      <Title className="text-[14vmin] sm:text-[11vmin]" />
      <div className="w-72 max-w-[80vw]">
        <div className="panel h-5 overflow-hidden">
          <div className="unskew h-full">
            <div
              className="checker h-full transition-[width] duration-300"
              style={{ width: `${Math.max(4, Math.round(progress * 100))}%` }}
            />
          </div>
        </div>
        <p className="display mt-3 text-center text-sm tracking-[0.3em] text-clerk-gray">
          Warming up the van · {Math.round(progress * 100)}%
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------- start

function Start({ onStart, coarse }: { onStart: () => void; coarse: boolean }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-end bg-gradient-to-t from-clerk-ink via-clerk-ink/40 to-transparent p-6 pb-10 sm:justify-center sm:pb-6">
      <div className="pointer-events-auto flex w-full max-w-xl flex-col items-center gap-5 pt-14 text-center pop-in [@media(max-height:520px)]:gap-3 [@media(max-height:520px)]:pt-10">
        <p className="display text-base tracking-[0.35em] text-clerk-lime drop-shadow-[0_0_12px_rgba(124,255,0,0.6)] sm:text-lg [@media(max-height:520px)]:hidden">
          One lap · One van · All the cookies
        </p>
        <Title className="text-[17vmin] sm:text-[12vmin] [@media(max-height:520px)]:text-[11vmin]" />
        <Checker className="h-2.5 w-64 skew-x-[-8deg] [@media(max-height:520px)]:hidden" />
        <p className="display max-w-md text-balance text-lg leading-tight text-gray-200 sm:text-xl">
          Grab <span className="text-cookie">cookies</span>, <span className="text-white">API keys</span> and{' '}
          <span className="text-clerk-lime">passkeys</span>. Collect all three pieces of{' '}
          <code className="rounded bg-clerk-purple/40 px-1.5 font-mono text-[0.8em] normal-case text-white">
            &lt;SignIn/&gt;
          </code>{' '}
          for x1.5. Dodge the spam bots.
        </p>
        <RaceButton onClick={onStart} className="pulse-glow h-16 w-full max-w-sm text-3xl">
          Start the run
        </RaceButton>
        <p className="display flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm tracking-wider text-clerk-gray">
          {coarse ? (
            'Steer on the left · gas and brake on the right'
          ) : (
            <>
              <span>
                <kbd className="keycap">W</kbd> <kbd className="keycap">A</kbd>{' '}
                <kbd className="keycap">S</kbd> <kbd className="keycap">D</kbd> drive
              </span>
              <span>
                <kbd className="keycap">Space</kbd> brake
              </span>
              <span>
                <kbd className="keycap">R</kbd> restart
              </span>
              <span>
                <kbd className="keycap">M</kbd> mute
              </span>
            </>
          )}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------- countdown

function Countdown({ value }: { value: number }) {
  const n = Math.min(3, Math.max(1, Math.ceil(value)))
  const lit = 4 - n // 1, 2, 3 lights
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
      <Panel className="px-5 py-3">
        <div className="flex gap-3">
          {[1, 2, 3].map((i) => (
            <span
              key={i}
              className={`size-7 rounded-full border-2 border-black/60 transition-colors sm:size-9 ${
                i <= lit ? 'bg-bot shadow-[0_0_18px_rgba(255,45,85,0.9)]' : 'bg-black/50'
              }`}
            />
          ))}
        </div>
      </Panel>
      <span key={n} className="racing-title countdown-pop text-[28vmin] leading-none">
        {n}
      </span>
    </div>
  )
}

function Go() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
      <Panel className="px-5 py-3">
        <div className="flex gap-3">
          {[1, 2, 3].map((i) => (
            <span
              key={i}
              className="size-7 rounded-full border-2 border-black/60 bg-clerk-lime shadow-[0_0_18px_rgba(124,255,0,0.9)] sm:size-9"
            />
          ))}
        </div>
      </Panel>
      <span className="racing-title countdown-pop text-[28vmin] leading-none">
        <span className="accent">GO!</span>
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------------- race hud

const KINDS: Array<{ key: ItemKind; icon: IconName; color: string; label: string }> = [
  { key: 'cookie', icon: 'cookie', color: 'text-cookie', label: 'Cookies' },
  { key: 'key', icon: 'key-lock', color: 'text-white', label: 'API keys' },
  { key: 'passkey', icon: 'finger-print', color: 'text-clerk-lime', label: 'Passkeys' },
]

const MAX_KMH = 95

function RaceHud({ snap, coarse }: { snap: Snapshot; coarse: boolean }) {
  const kmh = Math.round(snap.speedKmh)
  return (
    <>
      {/* Timer and score */}
      <Panel className="absolute left-4 top-4 slide-in-left px-5 py-2.5">
        <div className="display text-5xl font-black italic tabular-nums leading-none sm:text-6xl">
          {fmt(snap.timeMs)}
        </div>
        <div className="display mt-1 flex items-baseline gap-2 text-base tracking-[0.25em] text-clerk-gray">
          Score
          <span className="text-2xl font-extrabold tracking-normal text-clerk-lime">{snap.score.total}</span>
        </div>
      </Panel>

      {/* Counters */}
      <div className="absolute right-4 top-4 flex flex-col items-end gap-1.5">
        {KINDS.map((k, i) => (
          <Panel key={k.key} className="slide-in-right px-3 py-1" style={{ animationDelay: `${i * 60}ms` }}>
            <div
              className={`display flex items-center gap-2 text-2xl font-extrabold leading-none ${k.color}`}
            >
              <Icon name={k.icon} className="size-6 drop-shadow-[0_0_6px_currentColor]" />
              <span className="tabular-nums">{snap.collected[k.key]}</span>
              <span className="text-base font-semibold text-clerk-gray">/ {ITEM_COUNTS[k.key]}</span>
            </div>
          </Panel>
        ))}
        <Panel className="slide-in-right px-3 py-1.5" style={{ animationDelay: '200ms' }}>
          <div className="flex gap-1 font-mono text-sm font-bold">
            {(['<', 'SignIn', '/>'] as const).map((p, i) => (
              <span
                key={p}
                className={`rounded px-1.5 py-0.5 ${
                  snap.signin[i]
                    ? 'bg-clerk-purple text-white shadow-[0_0_12px_rgba(108,71,255,0.9)]'
                    : 'bg-black/40 text-clerk-gray'
                }`}
              >
                {p}
              </span>
            ))}
          </div>
        </Panel>
      </div>

      {/* Speedometer: smaller and lifted above the touch buttons on phones. */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 pop-in ${coarse ? 'bottom-20 scale-[0.6]' : 'bottom-3'}`}
        style={{ transformOrigin: '50% 100%' }}
      >
        <Speedo kmh={kmh} boost={snap.boost} />
      </div>

      {/* Lap progress */}
      <Panel className={`absolute bottom-6 right-4 w-56 px-3 py-2 ${coarse ? 'hidden' : 'hidden sm:block'}`}>
        <div className="display mb-1 flex justify-between text-xs tracking-[0.25em] text-clerk-gray">
          <span>Lap</span>
          <span>{Math.round(snap.lap * 100)}%</span>
        </div>
        <div className="relative h-2.5 overflow-hidden rounded-sm bg-black/50">
          <div
            className="h-full bg-gradient-to-r from-clerk-purple to-clerk-lime"
            style={{ width: `${Math.round(snap.lap * 100)}%` }}
          />
        </div>
      </Panel>
    </>
  )
}

/** Semicircular gauge: speed arc, needle, and the boost reserve as an inner cyan arc. */
function Speedo({ kmh, boost }: { kmh: number; boost: number }) {
  const k = Math.min(1, kmh / MAX_KMH)
  const R = 86
  const cx = 110
  const cy = 98
  const arc = (r: number, from: number, to: number) => {
    const a0 = Math.PI + from * Math.PI
    const a1 = Math.PI + to * Math.PI
    const x0 = cx + r * Math.cos(a0)
    const y0 = cy + r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1)
    const y1 = cy + r * Math.sin(a1)
    const large = to - from > 0.5 ? 1 : 0
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`
  }
  const needle = Math.PI + k * Math.PI
  const nx = cx + (R - 18) * Math.cos(needle)
  const ny = cy + (R - 18) * Math.sin(needle)
  const boostK = Math.min(1, boost / 3)
  const ticks = Array.from({ length: 11 }, (_, i) => i / 10)
  return (
    <div className="relative h-[172px] w-[220px]">
      <div
        aria-hidden
        className="absolute inset-x-[-30px] bottom-[-20px] top-0 rounded-t-full bg-[radial-gradient(ellipse_at_50%_70%,rgba(13,13,16,0.85),rgba(13,13,16,0.35)_60%,transparent_75%)]"
      />
      <svg viewBox="0 0 220 172" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        <title>Speed</title>
        <defs>
          <linearGradient id="speed" x1="0" x2="1">
            <stop offset="0" stopColor="#6c47ff" />
            <stop offset="1" stopColor="#7cff00" />
          </linearGradient>
        </defs>
        <path d={arc(R, 0, 1)} stroke="rgba(0,0,0,0.65)" strokeWidth="20" fill="none" strokeLinecap="round" />
        <path
          d={arc(R, 0, 1)}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
        />
        {k > 0.005 && (
          <path
            d={arc(R, 0, k)}
            stroke="url(#speed)"
            strokeWidth="14"
            fill="none"
            strokeLinecap="round"
            style={{ filter: 'drop-shadow(0 0 8px rgba(124,255,0,0.6))' }}
          />
        )}
        {ticks.map((t) => {
          const a = Math.PI + t * Math.PI
          const major = Math.round(t * 10) % 5 === 0
          const inner = R - (major ? 24 : 20)
          const outer = R - 13
          return (
            <line
              key={t}
              x1={cx + inner * Math.cos(a)}
              y1={cy + inner * Math.sin(a)}
              x2={cx + outer * Math.cos(a)}
              y2={cy + outer * Math.sin(a)}
              stroke={t <= k ? '#fff' : 'rgba(255,255,255,0.35)'}
              strokeWidth={major ? 3 : 1.5}
            />
          )
        })}
        {boostK > 0 && (
          <path
            d={arc(R - 34, 0, boostK)}
            stroke="#37d4ff"
            strokeWidth="6"
            fill="none"
            strokeLinecap="round"
            style={{ filter: 'drop-shadow(0 0 8px rgba(55,212,255,0.9))' }}
          />
        )}
        <line
          x1={cx}
          y1={cy}
          x2={nx}
          y2={ny}
          stroke="#fff"
          strokeWidth="4"
          strokeLinecap="round"
          style={{ transition: 'all 120ms linear' }}
        />
        <circle cx={cx} cy={cy} r="8" fill="#131316" stroke="#fff" strokeWidth="3" />
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center leading-none">
        <span className="display text-5xl font-black italic tabular-nums drop-shadow-[0_2px_0_rgba(0,0,0,0.8)]">
          {kmh}
        </span>
        <span className="display text-xs tracking-[0.3em] text-clerk-gray">km/h</span>
      </div>
      {boost > 0 && (
        <span className="display blink absolute left-1/2 top-9 -translate-x-1/2 text-base font-extrabold tracking-[0.3em] text-boost">
          Boost
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------- popups

type Popup = { id: number; text: string; icon: IconName | null; color: string }

/** "+10" style toasts for pickups and hits, floating up from the middle of the screen. */
function Popups({ game }: { game: GameHandle }) {
  const [popups, setPopups] = useState<Popup[]>([])
  const seq = useRef(0)
  useEffect(() => {
    const off = game.on((e: GameEvent) => {
      let p: Omit<Popup, 'id'> | null = null
      if (e.type === 'pickup') {
        const k = e.kind
        if (k === 'cookie') p = { text: `+${POINTS.cookie}`, icon: 'cookie', color: 'text-cookie' }
        else if (k === 'key') p = { text: `+${POINTS.key}`, icon: 'key-lock', color: 'text-white' }
        else if (k === 'passkey')
          p = { text: `+${POINTS.passkey}`, icon: 'finger-print', color: 'text-clerk-lime' }
        else if (k === 'boost') p = { text: 'Boost!', icon: 'focused-lightning', color: 'text-boost' }
        else
          p = {
            text: k === 'signin_open' ? '<' : k === 'signin_name' ? 'SignIn' : '/>',
            icon: null,
            color: 'text-white',
          }
      } else if (e.type === 'hit') {
        p = { text: 'Spam! -3', icon: 'robot-antennas', color: 'text-bot' }
      }
      if (!p) return
      const id = ++seq.current
      setPopups((list) => [...list.slice(-5), { id, ...p }])
      setTimeout(() => setPopups((list) => list.filter((x) => x.id !== id)), 1100)
    })
    return off
  }, [game])
  return (
    <div className="absolute inset-x-0 top-[42%]">
      {popups.map((p, i) => (
        <span
          key={p.id}
          className={`float-up display absolute left-1/2 flex items-center gap-2 text-4xl font-black italic drop-shadow-[0_2px_0_rgba(0,0,0,0.8)] ${p.color}`}
          style={{ marginLeft: `${(i % 3) * 40 - 40}px` }}
        >
          {p.icon ? <Icon name={p.icon} className="size-8" /> : null}
          {p.text}
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------------- finished

function useCountUp(target: number, ms = 1200): number {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      setV(Math.round(target * (1 - (1 - k) ** 3)))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return v
}

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        id: i,
        left: `${(i * 37) % 100}%`,
        delay: `${(i % 9) * 0.12}s`,
        color: ['#7cff00', '#6c47ff', '#f2b84b', '#ffffff'][i % 4],
        rot: `${(i * 53) % 360}deg`,
      })),
    [],
  )
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti"
          style={{
            left: p.left,
            animationDelay: p.delay,
            background: p.color,
            transform: `rotate(${p.rot})`,
          }}
        />
      ))}
    </div>
  )
}

function Finished({
  snap,
  onRetry,
  submission,
}: {
  snap: Snapshot
  onRetry: () => void
  submission: ReturnType<typeof useRunSubmission>
}) {
  const r = snap.result
  const total = useCountUp(r?.score.total ?? 0)
  if (!r) return null
  const { state, submit, isSignedIn } = submission
  const row = (label: string, value: string, delay: number) => (
    <div
      className="display flex items-baseline justify-between border-b border-white/10 py-1.5 text-lg slide-in-left"
      style={{ animationDelay: `${delay}ms` }}
    >
      <dt className="tracking-wider text-clerk-gray">{label}</dt>
      <dd className="font-extrabold tabular-nums">{value}</dd>
    </div>
  )
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-clerk-ink/55 p-4 backdrop-blur-sm">
      <Confetti />
      <div className="pointer-events-auto w-full max-w-md pop-in">
        <div className="btn-race btn-lime display inline-block px-5 py-1.5 text-xl tracking-[0.2em]">
          <span>Lap complete</span>
        </div>
        <Panel tone="purple" className="mt-2 px-6 py-5">
          <p className="display text-sm tracking-[0.3em] text-clerk-gray">Score</p>
          <p className="racing-title text-7xl tabular-nums">{total}</p>
          <dl className="mt-4">
            {row('Time', fmt(r.timeMs), 100)}
            {row('Items', String(r.score.items), 160)}
            {row('<SignIn/> bonus', `x${r.score.multiplier}`, 220)}
            {row('Time bonus', `+${r.score.timeBonus}`, 280)}
            {row('Spam bot hits', `${r.botHits} (−${r.cookiesLost} cookies)`, 340)}
          </dl>
          <div className="display mt-4 min-h-6 text-base">
            {state.status === 'saving' && <p className="text-clerk-gray">Saving your lap…</p>}
            {state.status === 'saved' && (
              <p className="text-clerk-lime">
                Saved.{' '}
                {state.rank ? (
                  <>
                    You are <span className="font-extrabold">#{state.rank.rank}</span> of {state.rank.total}.
                  </>
                ) : null}{' '}
                <Link href="/leaderboard" className="underline">
                  See the leaderboard
                </Link>
              </p>
            )}
            {state.status === 'error' && <p className="text-bot">{state.message}</p>}
          </div>
          <div className="mt-3 flex gap-3">
            <RaceButton tone="ghost" onClick={onRetry} className="h-14 flex-1 text-xl">
              Run again <span className="text-clerk-gray">(R)</span>
            </RaceButton>
            {state.status !== 'saved' && (
              <RaceButton
                tone="purple"
                onClick={() => submit(r)}
                disabled={state.status === 'saving'}
                className="h-14 flex-1 text-xl"
              >
                {isSignedIn ? 'Save lap' : 'Sign in to save'}
              </RaceButton>
            )}
          </div>
        </Panel>
      </div>
    </div>
  )
}

function RestoredToast({
  state,
  onClose,
}: {
  state: ReturnType<typeof useRunSubmission>['restored']
  onClose: () => void
}) {
  return (
    <Panel tone="lime" className="pointer-events-auto absolute left-1/2 top-20 -translate-x-1/2 px-4 py-2">
      <div className="display flex items-center gap-3 text-base">
        {state.status === 'saving' && (
          <span className="text-clerk-gray">Saving the lap you drove before signing in…</span>
        )}
        {state.status === 'saved' && (
          <span className="text-clerk-lime">
            Your lap is on the board{state.rank ? ` at #${state.rank.rank}` : ''}.{' '}
            <Link href="/leaderboard" className="underline">
              See it
            </Link>
          </span>
        )}
        {state.status === 'error' && <span className="text-bot">{state.message}</span>}
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="text-clerk-gray hover:text-white"
        >
          ×
        </button>
      </div>
    </Panel>
  )
}

// ---------------------------------------------------------------------------------- touch

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
    'btn-race btn-ghost pointer-events-auto flex h-[4.5rem] w-[4.5rem] items-center justify-center bg-black/55 text-3xl'
  return (
    <>
      <div className="absolute bottom-4 left-4 flex gap-3">
        <button type="button" aria-label="Steer left" className={cls} {...bind('left')}>
          <span>◀</span>
        </button>
        <button type="button" aria-label="Steer right" className={cls} {...bind('right')}>
          <span>▶</span>
        </button>
      </div>
      <div className="absolute bottom-6 right-5 flex items-end gap-3">
        <button type="button" aria-label="Brake" className={`${cls} text-bot`} {...bind('brake')}>
          <span>■</span>
        </button>
        <button
          type="button"
          aria-label="Accelerate"
          className={`${cls} btn-lime h-20 w-20 text-4xl`}
          {...bind('gas')}
        >
          <span>▲</span>
        </button>
      </div>
    </>
  )
}
