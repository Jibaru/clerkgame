// Fixed-camera inspection shots: node scripts/views.mjs <outDir> [url]
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
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[error]', m.text())
})
await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__game?.snapshot().phase === 'ready')
await page.waitForTimeout(5000)
await page.evaluate(() => window.__game.setPhase('racing'))
// name, u, lateral, height, back, lookAhead
const views = [
  ['start-front', 0.985, -14, 9, -30, 10],
  ['start-arch', 0.99, 3, 2.5, 14, 30],
  ['hq', 0.02, 30, 16, 20, 40],
  ['hairpin', 0.36, -20, 14, 10, 30],
  ['shortcut', 0.31, 8, 6, 8, 40],
  ['tunnel-in', 0.515, 0, 3, 10, 30],
  ['forest', 0.7, 0, 4, 12, 40],
  ['bridge-side', 0.845, 30, 6, 0, 0],
  ['bridge-on', 0.815, 0, 5, 10, 40],
  ['stream-bed', 0.845, 14, 2, 4, 0],
]
for (const [name, u, lat, h, back, ahead] of views) {
  await page.evaluate(
    ([u, lat, h, back, ahead]) => window.__game.view(u, lat, h, back, ahead),
    [u, lat, h, back, ahead],
  )
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${out}/${name}.png` })
}
await browser.close()
