'use client'

import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RunResult } from '@/game/createGame'

const PENDING_KEY = 'clerk-van-run:pending-run'

type Rank = { rank: number; total: number; score: number } | null
export type SubmitState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved'; rank: Rank; score: number }
  | { status: 'error'; message: string }

function payload(r: RunResult) {
  return {
    timeMs: r.timeMs,
    pickups: r.pickups,
    botHits: r.botHits,
    cookiesLost: r.cookiesLost,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
  }
}

async function postRun(r: RunResult): Promise<SubmitState> {
  const res = await fetch('/api/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload(r)),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string; rank?: Rank; score?: number }
  if (!res.ok) return { status: 'error', message: data.error ?? `Could not save (${res.status}).` }
  return { status: 'saved', rank: data.rank ?? null, score: data.score ?? r.score.total }
}

/**
 * Saving a finished lap: signed-in players post it straight away; guests park it in
 * localStorage, go through sign-in, and it is posted when they come back.
 */
export function useRunSubmission() {
  const { isSignedIn, isLoaded } = useAuth()
  const router = useRouter()
  const [state, setState] = useState<SubmitState>({ status: 'idle' })
  const [restored, setRestored] = useState<SubmitState>({ status: 'idle' })
  const restoring = useRef(false)

  // A run parked before sign-in: submit it once the session is here.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || restoring.current) return
    let raw: string | null = null
    try {
      raw = localStorage.getItem(PENDING_KEY)
    } catch {
      return
    }
    if (!raw) return
    restoring.current = true
    try {
      localStorage.removeItem(PENDING_KEY)
    } catch {
      // ignore
    }
    let run: RunResult | null = null
    try {
      run = JSON.parse(raw) as RunResult
    } catch {
      run = null
    }
    if (!run) return
    setRestored({ status: 'saving' })
    postRun(run).then(setRestored)
  }, [isLoaded, isSignedIn])

  const submit = useCallback(
    async (run: RunResult) => {
      if (!isSignedIn) {
        try {
          localStorage.setItem(PENDING_KEY, JSON.stringify(run))
        } catch {
          // Without storage the run is lost across sign-in; the user can still play again.
        }
        router.push('/sign-in?redirect_url=/')
        return
      }
      setState({ status: 'saving' })
      setState(await postRun(run))
    },
    [isSignedIn, router],
  )

  const reset = useCallback(() => setState({ status: 'idle' }), [])
  return {
    state,
    submit,
    reset,
    restored,
    dismissRestored: () => setRestored({ status: 'idle' }),
    isSignedIn: Boolean(isSignedIn),
  }
}
