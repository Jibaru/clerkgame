'use client'

import { useEffect, useRef, useState } from 'react'
import { createAudio, type GameAudio } from '@/game/audio'
import { createGame, type GameHandle, type Snapshot } from '@/game/createGame'
import { Hud } from './Hud'

/** Mounts the Three.js game, the audio and the HUD on top of it. */
export function Game() {
  const host = useRef<HTMLDivElement>(null)
  const [game, setGame] = useState<GameHandle | null>(null)
  const [audio, setAudio] = useState<GameAudio | null>(null)
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    const el = host.current
    if (!el) return
    const g = createGame(el)
    const a = createAudio()
    setGame(g)
    setAudio(a)
    setMuted(a.muted())
    const offSnap = g.subscribe((s) => {
      setSnap(s)
      a.onSnapshot(s)
    })
    const offEvents = g.on(a.onEvent)
    // Any first interaction unlocks audio; the Start button does too.
    const unlock = () => a.unlock()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'm') {
        const next = !a.muted()
        a.setMuted(next)
        setMuted(next)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      offSnap()
      offEvents()
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('keydown', onKey)
      a.dispose()
      g.destroy()
      setGame(null)
      setAudio(null)
    }
  }, [])

  const toggleMute = () => {
    if (!audio) return
    const next = !audio.muted()
    audio.setMuted(next)
    setMuted(next)
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-clerk-ink">
      <div ref={host} className="absolute inset-0" />
      {game && snap ? (
        <Hud
          game={game}
          snap={snap}
          muted={muted}
          onToggleMute={toggleMute}
          onStart={() => {
            audio?.unlock()
            game.start()
          }}
        />
      ) : null}
    </div>
  )
}
