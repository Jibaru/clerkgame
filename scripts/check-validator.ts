// Sanity checks for the server-side run validator: npx tsx scripts/check-validator.ts
import { ITEMS, scoreRun } from '../src/game/items'
import { validateRun } from '../src/lib/runs'

const now = Date.now()
const base = {
  timeMs: 95_000,
  pickups: [0, 1, 2, 3],
  botHits: 0,
  cookiesLost: 0,
  startedAt: now - 95_000,
  finishedAt: now,
}
const cookies = ITEMS.filter((i) => i.kind === 'cookie')
  .slice(0, 5)
  .map((i) => i.id)
const cases: Array<[string, unknown, boolean]> = [
  ['ok', base, true],
  ['too fast', { ...base, timeMs: 20_000, startedAt: now - 20_000 }, false],
  ['duplicate pickup', { ...base, pickups: [0, 0] }, false],
  ['unknown id', { ...base, pickups: [ITEMS.length] }, false],
  ['lost more than hits allow', { ...base, botHits: 1, cookiesLost: 4 }, false],
  ['lost within hits', { ...base, pickups: cookies, botHits: 1, cookiesLost: 3 }, true],
  ['clock mismatch', { ...base, startedAt: now - 200_000 }, false],
  ['every item', { ...base, pickups: ITEMS.map((i) => i.id) }, true],
  ['garbage', 'nope', false],
]
let failed = 0
for (const [name, body, expect] of cases) {
  const v = validateRun(body, now)
  const pass = v.ok === expect
  if (!pass) failed++
  console.log(
    pass ? 'PASS' : 'FAIL',
    name,
    v.ok ? `score=${v.run.score} cookies=${v.run.collected.cookie}` : v.reason,
  )
}
const perfect = validateRun(
  { ...base, pickups: ITEMS.map((i) => i.id), timeMs: 80_000, startedAt: now - 80_000 },
  now,
)
if (perfect.ok)
  console.log('perfect lap at 80 s:', perfect.run.score, scoreRun(perfect.run.collected, 80_000))
process.exit(failed)
