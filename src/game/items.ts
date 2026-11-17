/**
 * Every collectible on the circuit, as pure data shared by the client (to build the meshes)
 * and the server (to validate submitted runs). Positions are track-relative: `u` is the
 * arc-length ratio along the main loop (or along the shortcut when `path` is 'shortcut') and
 * `offset` is metres along the track normal (positive = inside of the circuit, the driver's right).
 */

export type ItemKind = 'cookie' | 'key' | 'passkey' | 'signin_open' | 'signin_name' | 'signin_close' | 'boost'

export type ItemPath = 'track' | 'shortcut'

export type Item = {
  id: number
  kind: ItemKind
  path: ItemPath
  u: number
  offset: number
}

export const POINTS: Record<ItemKind, number> = {
  cookie: 10,
  key: 50,
  passkey: 100,
  signin_open: 0,
  signin_name: 0,
  signin_close: 0,
  boost: 0,
}

/** Multiplier applied to the item score when all three <SignIn/> pieces are collected. */
export const SIGNIN_MULTIPLIER = 1.5
/** Time bonus: points per second under TIME_PAR. */
export const TIME_PAR_MS = 120_000
export const TIME_BONUS_PER_S = 5
/** Cookies a spam bot steals on contact. */
export const BOT_STEALS = 3

type Spec = Omit<Item, 'id'>

function line(
  kind: ItemKind,
  u0: number,
  u1: number,
  count: number,
  offset: number,
  path: ItemPath = 'track',
): Spec[] {
  const out: Spec[] = []
  for (let i = 0; i < count; i++)
    out.push({ kind, path, u: u0 + ((u1 - u0) * i) / Math.max(1, count - 1), offset })
  return out
}

function one(kind: ItemKind, u: number, offset: number, path: ItemPath = 'track'): Spec {
  return { kind, path, u, offset }
}

const specs: Spec[] = [
  // Start straight: two lines of cookies, boost pad at the end of the straight.
  ...line('cookie', 0.02, 0.1, 9, 2.2),
  ...line('cookie', 0.02, 0.1, 9, -2.2),
  one('boost', 0.125, 0),
  one('signin_open', 0.15, 0),
  // The sweep: cookies on the inside line, a key on the outside.
  ...line('cookie', 0.18, 0.27, 8, -2.5),
  one('key', 0.215, 3.4),
  one('key', 0.29, -3.4),
  // Hairpin, the long way round: cookies all along, a key at the apex.
  ...line('cookie', 0.33, 0.44, 10, 0),
  one('key', 0.385, 3),
  // Shortcut: gravel, slow, two passkeys and a few cookies.
  ...line('cookie', 0.2, 0.8, 4, 0, 'shortcut'),
  one('passkey', 0.35, 0, 'shortcut'),
  one('passkey', 0.7, 0, 'shortcut'),
  one('boost', 0.47, 0),
  // Tunnel: dark, keys inside.
  ...line('cookie', 0.5, 0.58, 7, 1.8),
  one('key', 0.525, -2.6),
  one('key', 0.56, -2.6),
  one('signin_name', 0.6, 0),
  // Forest: cookies weave, bots patrol here.
  ...line('cookie', 0.64, 0.7, 6, 2.4),
  ...line('cookie', 0.7, 0.76, 6, -2.4),
  ...line('cookie', 0.76, 0.82, 6, 2.4),
  one('key', 0.79, -3.4),
  // Stream bed detour under the bridge: the third passkey, off the asphalt.
  one('passkey', 0.845, 14),
  // Bridge and the last bend.
  ...line('cookie', 0.83, 0.86, 4, 0),
  one('signin_close', 0.88, 0),
  ...line('cookie', 0.9, 0.98, 8, 1.8),
  ...line('cookie', 0.9, 0.98, 8, -1.8),
  one('boost', 0.93, 0),
]

export const ITEMS: Item[] = specs.map((s, id) => ({ id, ...s }))

export const ITEM_COUNTS: Record<ItemKind, number> = ITEMS.reduce(
  (acc, it) => {
    acc[it.kind]++
    return acc
  },
  { cookie: 0, key: 0, passkey: 0, signin_open: 0, signin_name: 0, signin_close: 0, boost: 0 } as Record<
    ItemKind,
    number
  >,
)

export type Collected = Record<ItemKind, number>

export function emptyCollected(): Collected {
  return { cookie: 0, key: 0, passkey: 0, signin_open: 0, signin_name: 0, signin_close: 0, boost: 0 }
}

/** The score formula, used by the HUD and re-run by the server on every submission. */
export function scoreRun(
  collected: Collected,
  timeMs: number,
): { items: number; multiplier: number; timeBonus: number; total: number } {
  let items = 0
  for (const kind of Object.keys(POINTS) as ItemKind[]) items += POINTS[kind] * collected[kind]
  const multiplier =
    collected.signin_open > 0 && collected.signin_name > 0 && collected.signin_close > 0
      ? SIGNIN_MULTIPLIER
      : 1
  const timeBonus = Math.max(0, Math.floor((TIME_PAR_MS - timeMs) / 1000)) * TIME_BONUS_PER_S
  const total = Math.round(items * multiplier) + timeBonus
  return { items, multiplier, timeBonus, total }
}
