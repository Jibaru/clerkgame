// Renders the circuit as an SVG so the layout can be checked without a browser:
//   node scripts/track-map.ts > /tmp/track.svg
import { Shortcut, Track, WAYPOINTS } from '../src/game/track.ts'

const track = new Track()
const shortcut = new Shortcut()
const pts = track.curve.getSpacedPoints(400)
const sc = shortcut.curve.getSpacedPoints(60)
const pad = 40
const xs = pts.map((p) => p.x)
const zs = pts.map((p) => p.z)
const minX = Math.min(...xs) - pad
const maxX = Math.max(...xs) + pad
const minZ = Math.min(...zs) - pad
const maxZ = Math.max(...zs) + pad
const w = maxX - minX
const h = maxZ - minZ
const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(' ')
const scPath = sc.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(' ')
const marks = WAYPOINTS.map(
  ([x, z], i) =>
    `<circle cx="${x}" cy="${z}" r="3" fill="#7cff00"/><text x="${x + 5}" y="${z - 5}" font-size="9" fill="#fff">${i}</text>`,
).join('')
const ticks: string[] = []
for (let i = 0; i < 20; i++) {
  const { point } = track.at(i / 20)
  ticks.push(
    `<circle cx="${point.x.toFixed(1)}" cy="${point.z.toFixed(1)}" r="2" fill="#ff5"/><text x="${point.x + 4}" y="${point.z + 10}" font-size="7" fill="#ff5">${(i / 20).toFixed(2)}</text>`,
  )
}
process.stdout.write(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minZ} ${w} ${h}" width="${w * 2}" height="${h * 2}">
<rect x="${minX}" y="${minZ}" width="${w}" height="${h}" fill="#1b2a12"/>
<path d="${path} Z" fill="none" stroke="#333" stroke-width="10" stroke-linejoin="round"/>
<path d="${path} Z" fill="none" stroke="#fff" stroke-width="0.6" stroke-dasharray="3 6"/>
<path d="${scPath}" fill="none" stroke="#b9a" stroke-width="6" stroke-linecap="round"/>
${marks}${ticks}
<text x="${minX + 5}" y="${minZ + 12}" font-size="10" fill="#fff">length ${track.length.toFixed(0)} m, shortcut ${shortcut.length.toFixed(0)} m</text>
</svg>`)
