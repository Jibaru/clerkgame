import * as THREE from 'three'
import { assetUrl } from './assets'
import { ROAD_W, SHOULDER_W, type Track } from './track'

/**
 * Trackside advertising from the Clerk × Crafter Station event kit: portrait posters on
 * billboards, gantry banners across the road, and stickers on the tunnel walls. Every image
 * lives in public/billboards (downscaled copies of the merch posters).
 */
const BASE = assetUrl('/billboards')
const loader = new THREE.TextureLoader()
const texCache = new Map<string, THREE.Texture>()

function tex(name: string): THREE.Texture {
  let t = texCache.get(name)
  if (!t) {
    t = loader.load(`${BASE}/${name}`)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    texCache.set(name, t)
  }
  return t
}

/** Portrait posters (1080×1350) spread along the lap; alternating sides, never in the tunnel. */
const POSTERS: Array<{ u: number; side: 1 | -1; img: string }> = [
  { u: 0.095, side: -1, img: '02-clerk-van.jpg' },
  { u: 0.13, side: 1, img: '32-components.jpg' },
  { u: 0.165, side: -1, img: '07-agentic.jpg' },
  { u: 0.2, side: 1, img: '08-mission.jpg' },
  { u: 0.24, side: -1, img: '06-features.jpg' },
  { u: 0.275, side: 1, img: '09-founders.jpg' },
  { u: 0.345, side: 1, img: '41-agents-web.jpg' },
  { u: 0.41, side: 1, img: '03-clerk-van-side.jpg' },
  { u: 0.45, side: -1, img: '10-crafter-mark.jpg' },
  { u: 0.485, side: 1, img: '33-components-dark.jpg' },
  { u: 0.62, side: -1, img: '21-team-grid.jpg' },
  { u: 0.66, side: 1, img: '31-history.jpg' },
  { u: 0.74, side: -1, img: '40-website.jpg' },
  { u: 0.78, side: 1, img: '01-clerk-mark.jpg' },
  { u: 0.9, side: -1, img: '50-van-run.jpg' },
  { u: 0.94, side: 1, img: '02-clerk-van.jpg' },
]

/** Gantries over the road with a brand line each. */
const GANTRIES: Array<{ u: number; text: string; sub?: string; dark: boolean }> = [
  { u: 0.11, text: 'Everything you need for authentication', dark: true },
  { u: 0.29, text: 'Auth as easy as <SignIn/>', dark: false },
  { u: 0.61, text: 'Ship auth faster with agents', sub: 'clerk.com/SKILL.md', dark: true },
  { u: 0.87, text: 'Craft. Ship. Repeat.', sub: 'crafter.run', dark: false },
]

const INK = 0x131316
const PURPLE = 0x6c47ff

function bannerTexture(text: string, sub: string | undefined, dark: boolean): THREE.CanvasTexture {
  const w = 1536
  const h = 256
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d') as CanvasRenderingContext2D
  ctx.fillStyle = dark ? '#131316' : '#6c47ff'
  ctx.fillRect(0, 0, w, h)
  // Eyebrow in mono, headline in sans, like the posters.
  ctx.fillStyle = dark ? '#bab1ff' : '#e9e4ff'
  ctx.font = '500 26px "JetBrains Mono", ui-monospace, Menlo, monospace'
  ctx.textBaseline = 'top'
  ctx.fillText('CLERK  ×  CRAFTER STATION', 48, 34)
  ctx.textAlign = 'right'
  ctx.fillText(sub ?? 'clerk.com', w - 48, 34)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffffff'
  const code = text.indexOf('<')
  const head = code < 0 ? text : text.slice(0, code)
  const tail = code < 0 ? '' : text.slice(code)
  // Fit the headline to the banner width.
  let size = 96
  const width = () => {
    ctx.font = `700 ${size}px Inter, ui-sans-serif, system-ui, sans-serif`
    const a = ctx.measureText(head).width
    ctx.font = `500 ${Math.round(size * 0.92)}px "JetBrains Mono", ui-monospace, Menlo, monospace`
    return a + (tail ? ctx.measureText(tail).width : 0)
  }
  while (size > 40 && width() > w - 96) size -= 4
  ctx.font = `700 ${size}px Inter, ui-sans-serif, system-ui, sans-serif`
  const y = 92 + (96 - size) / 2
  ctx.fillText(head, 48, y)
  if (tail) {
    const x = 48 + ctx.measureText(head).width
    ctx.font = `500 ${Math.round(size * 0.92)}px "JetBrains Mono", ui-monospace, Menlo, monospace`
    ctx.fillStyle = dark ? '#bab1ff' : '#ffffff'
    ctx.fillText(tail, x, y + size * 0.06)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

const steel = new THREE.MeshStandardMaterial({ color: 0xe8e8ec, roughness: 0.5, metalness: 0.6 })
const inkMat = new THREE.MeshStandardMaterial({ color: INK, roughness: 0.7, metalness: 0.1 })
const purpleMat = new THREE.MeshStandardMaterial({ color: PURPLE, roughness: 0.6, metalness: 0.1 })

/** A poster on a framed board on two posts, facing oncoming traffic at a slight angle. */
function buildPoster(track: Track, spec: (typeof POSTERS)[number]): THREE.Group {
  const g = new THREE.Group()
  const { point, tangent, normal } = track.at(spec.u)
  const lateral = spec.side * (ROAD_W / 2 + SHOULDER_W + 5)
  g.position.copy(point).addScaledVector(normal, lateral)
  g.position.y = point.y
  // Face back down the road (toward the approaching van), turned 25° toward the asphalt.
  g.rotation.y = Math.atan2(-tangent.x, -tangent.z) + spec.side * 0.45
  const w = 4
  const h = w * 1.25
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, h + 0.3, 0.2), inkMat)
  frame.position.y = 2.6 + h / 2
  frame.castShadow = true
  g.add(frame)
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      map: tex(spec.img),
      roughness: 0.6,
      metalness: 0,
      emissive: 0xffffff,
      emissiveMap: tex(spec.img),
      emissiveIntensity: 0.35,
    }),
  )
  face.position.set(0, frame.position.y, 0.11)
  g.add(face)
  for (const dx of [-w / 2 + 0.3, w / 2 - 0.3]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.7, 8), steel)
    post.position.set(dx, 1.35, 0)
    post.castShadow = true
    g.add(post)
  }
  return g
}

/** A gantry: two pillars, a beam carrying the banner on both faces. */
function buildGantry(track: Track, spec: (typeof GANTRIES)[number]): THREE.Group {
  const g = new THREE.Group()
  const { point, tangent, normal } = track.at(spec.u)
  const span = ROAD_W + SHOULDER_W * 2 + 3
  const heading = Math.atan2(tangent.x, tangent.z)
  const bannerH = 1.7
  const bannerW = bannerH * 6
  const clearance = 10.5
  for (const side of [1, -1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.6, clearance, 0.6), spec.dark ? purpleMat : inkMat)
    pillar.position.copy(point).addScaledVector(normal, side * (span / 2))
    pillar.position.y = point.y + clearance / 2
    pillar.castShadow = true
    g.add(pillar)
  }
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(span + 0.6, bannerH + 0.3, 0.5),
    spec.dark ? inkMat : purpleMat,
  )
  beam.position.copy(point)
  beam.position.y = point.y + clearance + bannerH / 2 - 0.3
  beam.rotation.y = heading
  beam.castShadow = true
  g.add(beam)
  const t = bannerTexture(spec.text, spec.sub, spec.dark)
  for (const face of [1, -1]) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.min(bannerW, span), bannerH),
      new THREE.MeshStandardMaterial({
        map: t,
        roughness: 0.7,
        emissive: 0xffffff,
        emissiveMap: t,
        emissiveIntensity: 0.3,
      }),
    )
    m.position.copy(beam.position).addScaledVector(tangent, face * 0.27)
    m.rotation.y = heading + (face > 0 ? 0 : Math.PI)
    g.add(m)
  }
  return g
}

/** Stickers on the tunnel walls at van height. */
function buildTunnelStickers(track: Track, u0: number, u1: number, halfWidth: number): THREE.Group {
  const g = new THREE.Group()
  const imgs = [
    'sticker-06-signin.png',
    'sticker-08-everything.png',
    'sticker-01-clerk-mark.png',
    'sticker-04-collab.png',
    'sticker-03-crafter-mark.png',
  ]
  const n = 10
  for (let i = 0; i < n; i++) {
    const u = u0 + ((u1 - u0) * (i + 0.5)) / n
    const side = i % 2 === 0 ? 1 : -1
    const { point, tangent, normal } = track.at(u)
    const img = imgs[i % imgs.length] ?? imgs[0] ?? ''
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 3.2),
      new THREE.MeshStandardMaterial({
        map: tex(img),
        transparent: true,
        side: THREE.DoubleSide,
        roughness: 0.8,
        emissive: 0xffffff,
        emissiveMap: tex(img),
        emissiveIntensity: 0.6,
      }),
    )
    // On the wall, 1.8 m up, tilted to follow the arch.
    const lat = halfWidth - 0.45
    m.position.copy(point).addScaledVector(normal, side * lat)
    m.position.y = point.y + 2.6
    m.lookAt(point.x, point.y + 2.6, point.z)
    m.rotateY(Math.PI)
    m.rotation.z += side * 0.12
    void tangent
    g.add(m)
  }
  return g
}

/** Checkered flags on poles at the start and along the final bend. */
export type BillboardsOptions = { tunnel: { u0: number; u1: number; halfWidth: number } }

export function buildBillboards(root: THREE.Group, track: Track, options: BillboardsOptions): void {
  const g = new THREE.Group()
  g.name = 'billboards'
  for (const p of POSTERS) g.add(buildPoster(track, p))
  for (const s of GANTRIES) g.add(buildGantry(track, s))
  g.add(buildTunnelStickers(track, options.tunnel.u0, options.tunnel.u1, options.tunnel.halfWidth))
  root.add(g)
}

/** Footprints the vegetation must keep clear of (posters and gantry pillars). */
export function billboardBlocked(track: Track): Array<{ x: number; z: number; r: number }> {
  const out: Array<{ x: number; z: number; r: number }> = []
  for (const p of POSTERS) {
    const { point, normal } = track.at(p.u)
    const c = point.clone().addScaledVector(normal, p.side * (ROAD_W / 2 + SHOULDER_W + 5))
    out.push({ x: c.x, z: c.z, r: 5 })
  }
  return out
}
