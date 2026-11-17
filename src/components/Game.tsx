'use client'

import { useEffect, useRef, useState } from 'react'
import { createGame, type GameHandle, type Snapshot } from '@/game/createGame'
import { Hud } from './Hud'

/** Mounts the Three.js game and the HUD on top of it. */
export function Game() {
  const host = useRef<HTMLDivElement>(null)
  const [game, setGame] = useState<GameHandle | null>(null)
  const [snap, setSnap] = useState<Snapshot | null>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return
    const g = createGame(el)
    setGame(g)
    const off = g.subscribe(setSnap)
    return () => {
      off()
      g.destroy()
      setGame(null)
    }
  }, [])

  return (
    <div className="relative h-full w-full overflow-hidden bg-clerk-ink">
      <div ref={host} className="absolute inset-0" />
      {game && snap ? <Hud game={game} snap={snap} /> : null}
    </div>
  )
}
