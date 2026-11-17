// Screenshots of the non-game pages: node scripts/pages.mjs <outDir> [baseUrl]
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const out = process.argv[2] ?? 'shots'
const base = process.argv[3] ?? 'http://localhost:3000'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
})
for (const [name, path, width] of [
  ['leaderboard', '/leaderboard', 1120],
  ['sign-in', '/sign-in', 1120],
  ['sign-up', '/sign-up', 1120],
  ['sign-in-mobile', '/sign-in', 600],
]) {
  const page = await browser.newPage({ viewport: { width, height: 760 } })
  page.on('pageerror', (e) => console.log(`[${name}] pageerror`, e.message))
  await page.goto(base + path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${out}/${name}.png` })
  await page.close()
}
await browser.close()
