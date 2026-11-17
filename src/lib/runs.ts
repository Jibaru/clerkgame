import { BOT_STEALS, type Collected, emptyCollected, ITEMS, type ItemKind, scoreRun } from '@/game/items'
import { ensureSchema, sql } from './db'

/** What the client sends when a lap is complete. */
export type RunSubmission = {
  timeMs: number
  pickups: number[]
  botHits: number
  cookiesLost: number
  startedAt: number
  finishedAt: number
}

export type ValidRun = {
  timeMs: number
  pickups: number[]
  botHits: number
  collected: Collected
  score: number
}

/** Nothing on this circuit finishes a lap in under 40 s, even with every boost. */
const MIN_TIME_MS = 40_000
const MAX_TIME_MS = 20 * 60_000
const MAX_BOT_HITS = 60
const CLOCK_TOLERANCE_MS = 20_000
const MAX_AGE_MS = 2 * 60 * 60_000

export type Rejection = { ok: false; reason: string }
export type Validation = { ok: true; run: ValidRun } | Rejection

/**
 * Re-derives everything from the pickup list and the lap time. The client's own counts and
 * score are ignored, so a tampered total never reaches the table.
 */
export function validateRun(body: unknown, now = Date.now()): Validation {
  if (!body || typeof body !== 'object') return { ok: false, reason: 'body must be an object' }
  const b = body as Record<string, unknown>
  const timeMs = Number(b.timeMs)
  const botHits = Number(b.botHits)
  const cookiesLost = Number(b.cookiesLost)
  const startedAt = Number(b.startedAt)
  const finishedAt = Number(b.finishedAt)
  const pickups = b.pickups
  if (!Number.isInteger(timeMs) || timeMs < MIN_TIME_MS || timeMs > MAX_TIME_MS) {
    return { ok: false, reason: 'implausible lap time' }
  }
  if (!Number.isInteger(botHits) || botHits < 0 || botHits > MAX_BOT_HITS) {
    return { ok: false, reason: 'implausible bot hits' }
  }
  if (!Number.isInteger(cookiesLost) || cookiesLost < 0 || cookiesLost > botHits * BOT_STEALS) {
    return { ok: false, reason: 'cookies lost do not match bot hits' }
  }
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt))
    return { ok: false, reason: 'missing timestamps' }
  if (Math.abs(finishedAt - startedAt - timeMs) > CLOCK_TOLERANCE_MS) {
    return { ok: false, reason: 'timestamps disagree with the lap time' }
  }
  if (now - finishedAt > MAX_AGE_MS || finishedAt - now > CLOCK_TOLERANCE_MS) {
    return { ok: false, reason: 'run is too old' }
  }
  if (!Array.isArray(pickups) || pickups.length > ITEMS.length) return { ok: false, reason: 'bad pickups' }
  const seen = new Set<number>()
  const collected = emptyCollected()
  for (const id of pickups) {
    if (!Number.isInteger(id) || id < 0 || id >= ITEMS.length || seen.has(id)) {
      return { ok: false, reason: 'bad pickup id' }
    }
    seen.add(id)
    const kind = (ITEMS[id] as { kind: ItemKind }).kind
    collected[kind]++
  }
  if (collected.cookie < cookiesLost) return { ok: false, reason: 'more cookies lost than picked up' }
  collected.cookie -= cookiesLost
  const score = scoreRun(collected, timeMs).total
  return {
    ok: true,
    run: { timeMs, pickups: [...seen].map(Number), botHits, collected, score },
  }
}

export type Player = { userId: string; username: string; imageUrl: string | null }

export type LeaderboardRow = {
  rank: number
  userId: string
  username: string
  imageUrl: string | null
  score: number
  timeMs: number
  collected: Collected
  createdAt: string
}

export async function saveRun(player: Player, run: ValidRun): Promise<{ id: number }> {
  await ensureSchema()
  const db = sql()
  const [row] = await db<{ id: number }[]>`
    INSERT INTO runs (user_id, username, image_url, score, time_ms, collected, pickups, bot_hits)
    VALUES (${player.userId}, ${player.username}, ${player.imageUrl}, ${run.score}, ${run.timeMs},
            ${db.json(run.collected)}, ${run.pickups}, ${run.botHits})
    RETURNING id`
  return { id: Number(row?.id ?? 0) }
}

/** Seconds since this player's last submission, or null if none. Used to throttle spam. */
export async function secondsSinceLastRun(userId: string): Promise<number | null> {
  await ensureSchema()
  const [row] = await sql()<{ age: number }[]>`
    SELECT EXTRACT(EPOCH FROM now() - max(created_at)) AS age FROM runs WHERE user_id = ${userId}`
  return row?.age == null ? null : Number(row.age)
}

/** Best run per player, ranked. */
export async function topRuns(limit = 100): Promise<LeaderboardRow[]> {
  await ensureSchema()
  const rows = await sql()<
    {
      rank: number
      user_id: string
      username: string
      image_url: string | null
      score: number
      time_ms: number
      collected: Collected
      created_at: Date
    }[]
  >`
    WITH best AS (
      SELECT DISTINCT ON (user_id) user_id, username, image_url, score, time_ms, collected, created_at
      FROM runs ORDER BY user_id, score DESC, time_ms ASC, created_at ASC
    )
    SELECT rank() OVER (ORDER BY score DESC, time_ms ASC, created_at ASC) AS rank, *
    FROM best ORDER BY rank LIMIT ${limit}`
  return rows.map((r) => ({
    rank: Number(r.rank),
    userId: r.user_id,
    username: r.username,
    imageUrl: r.image_url,
    score: r.score,
    timeMs: r.time_ms,
    collected: r.collected,
    createdAt: r.created_at.toISOString(),
  }))
}

/** A player's rank by their best run, and how many players are ranked. */
export async function rankOf(userId: string): Promise<{ rank: number; total: number; score: number } | null> {
  await ensureSchema()
  const [row] = await sql()<{ rank: number; total: number; score: number }[]>`
    WITH best AS (
      SELECT DISTINCT ON (user_id) user_id, score, time_ms, created_at
      FROM runs ORDER BY user_id, score DESC, time_ms ASC, created_at ASC
    ), ranked AS (
      SELECT user_id, score, rank() OVER (ORDER BY score DESC, time_ms ASC, created_at ASC) AS rank,
             count(*) OVER () AS total
      FROM best
    )
    SELECT rank, total, score FROM ranked WHERE user_id = ${userId}`
  return row ? { rank: Number(row.rank), total: Number(row.total), score: row.score } : null
}
