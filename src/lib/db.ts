import postgres from 'postgres'

/**
 * One Postgres client per server process, created lazily so builds without DATABASE_URL still
 * succeed. The schema is applied on first use: a single table is all the leaderboard needs.
 */
declare global {
  var __clerkgameSql: ReturnType<typeof postgres> | undefined
  var __clerkgameSchema: Promise<void> | undefined
}

export function sql(): ReturnType<typeof postgres> {
  if (!globalThis.__clerkgameSql) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    globalThis.__clerkgameSql = postgres(url, { max: 5, idle_timeout: 30, connect_timeout: 10 })
  }
  return globalThis.__clerkgameSql
}

export function ensureSchema(): Promise<void> {
  if (!globalThis.__clerkgameSchema) {
    const db = sql()
    globalThis.__clerkgameSchema = (async () => {
      await db`
        CREATE TABLE IF NOT EXISTS runs (
          id bigserial PRIMARY KEY,
          user_id text NOT NULL,
          username text NOT NULL,
          image_url text,
          score integer NOT NULL,
          time_ms integer NOT NULL,
          collected jsonb NOT NULL,
          pickups integer[] NOT NULL,
          bot_hits integer NOT NULL DEFAULT 0,
          created_at timestamptz NOT NULL DEFAULT now()
        )`
      await db`CREATE INDEX IF NOT EXISTS runs_user_score ON runs (user_id, score DESC, time_ms ASC)`
      await db`CREATE INDEX IF NOT EXISTS runs_score ON runs (score DESC, time_ms ASC)`
    })().catch((err) => {
      globalThis.__clerkgameSchema = undefined
      throw err
    })
  }
  return globalThis.__clerkgameSchema
}
