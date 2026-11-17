// Drives a full lap on autopilot at accelerated simulation and prints the result:
//   node scripts/lap.mjs [url]
import { chromium } from 'playwright-core'

const url = process.argv[2] ?? 'http://localhost:3000/?lite'
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 640, height: 360 } })
page.setDefaultTimeout(240_000)
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__game?.snapshot().phase === 'ready')
await page.evaluate(() => {
  window.__game.dev.autopilot = true
  window.__game.dev.turbo = 12
  window.__game.start()
})
const t0 = Date.now()
await page.waitForFunction(() => window.__game.snapshot().phase === 'finished')
const snap = await page.evaluate(() => window.__game.snapshot())
console.log(`finished after ${((Date.now() - t0) / 1000).toFixed(0)} s real time`)
console.log(JSON.stringify({ timeMs: snap.result.timeMs, score: snap.result.score, collected: snap.result.collected, botHits: snap.result.botHits, pickups: snap.result.pickups.length }))
await browser.close()
