'use client'

import dynamic from 'next/dynamic'

// The game touches window and WebGL at module level, so it only ever renders on the client.
const Game = dynamic(() => import('./Game').then((m) => m.Game), { ssr: false })

export function GameLoader() {
  return <Game />
}
