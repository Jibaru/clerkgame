// Headless screenshots of the game for eyes-free verification:
//   node scripts/shots.mjs <outDir> [url]
// Uses the installed Google Chrome with SwiftShader so WebGL renders without a GPU.
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const out = process.argv[2] ?? 'shots'
const url = process.argv[3] ?? 'http://localhost:3000/?lite'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1120, height: 640 } })
page.setDefaultTimeout(180_000)
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}] ${m.text()}`)
})
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__game?.snapshot().phase === 'ready', null, { timeout: 180_000 })
// Let the vegetation and HDRI settle.
await page.waitForTimeout(6000)
await page.screenshot({ path: `${out}/01-ready.png` })

const shot = async (name, u, wait = 1500) => {
  await page.evaluate(
    ([u]) => {
      window.__game.setPhase('racing')
      window.__game.teleport(u)
    },
    [u],
  )
  await page.evaluate(() => window.__game.press('w'))
  await page.waitForTimeout(wait)
  await page.evaluate(() => window.__game.release('w'))
  await page.screenshot({ path: `${out}/${name}.png` })
}
await shot('02-straight', 0.03)
await shot('03-sweep', 0.2)
await shot('04-hairpin', 0.31)
await shot('05-shortcut', 0.44)
await shot('06-tunnel', 0.5)
await shot('07-forest', 0.66)
await shot('08-bridge', 0.82)
await shot('09-final', 0.9)
const snap = await page.evaluate(() => window.__game.snapshot())
console.log(JSON.stringify({ phase: snap.phase, score: snap.score, collected: snap.collected }))
await browser.close()
