import * as THREE from 'three'
import { loadIconGeometry } from './icons'
import { ITEMS, type Item, type ItemKind } from './items'
import type { Shortcut, Track } from './track'
import { COLORS } from './world'

/** Pickup radius around an item, in metres (the van is 2.5 m wide). */
const PICK_RADIUS = 2.4
const HOVER_Y = 1.4

type Visual = { geometry: THREE.BufferGeometry; material: THREE.Material; glow: number }

export type Collectible = Item & {
  position: THREE.Vector3
  mesh: THREE.Object3D
  taken: boolean
}

export type Collectibles = {
  all: Collectible[]
  /** Resets every item so a new run can start. */
  reset: () => void
  /** Call once per frame; returns the items picked up this frame. */
  update: (dt: number, time: number, vanPosition: THREE.Vector3, racing: boolean) => Collectible[]
  dispose: () => void
}

const ICONS: Partial<Record<ItemKind, string>> = {
  cookie: 'cookie',
  key: 'key-lock',
  passkey: 'finger-print',
  boost: 'focused-lightning',
}

const TINT: Record<ItemKind, number> = {
  cookie: 0xf2b84b,
  key: 0xf4f4f6,
  passkey: COLORS.lime,
  boost: 0x37d4ff,
  signin_open: COLORS.purple,
  signin_name: COLORS.purple,
  signin_close: COLORS.purple,
}

function glowSprite(color: number, size: number): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: glowTexture(),
    color,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const s = new THREE.Sprite(mat)
  s.scale.setScalar(size)
  return s
}

let glowTex: THREE.CanvasTexture | null = null
function glowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const ctx = c.getContext('2d') as CanvasRenderingContext2D
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,0.9)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  glowTex = new THREE.CanvasTexture(c)
  return glowTex
}

function labelTexture(text: string): THREE.CanvasTexture {
  const font = '700 150px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace'
  const m = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D
  m.font = font
  const w = Math.ceil(m.measureText(text).width + 80)
  const h = 200
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d') as CanvasRenderingContext2D
  ctx.fillStyle = '#131316'
  ctx.beginPath()
  ctx.roundRect(0, 0, w, h, 36)
  ctx.fill()
  ctx.strokeStyle = '#6c47ff'
  ctx.lineWidth = 12
  ctx.stroke()
  ctx.font = font
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, w / 2, h / 2 + 6)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.userData.aspect = w / h
  return tex
}

const LABELS: Partial<Record<ItemKind, string>> = {
  signin_open: '<',
  signin_name: 'SignIn',
  signin_close: '/>',
}

/** Builds every collectible from ITEMS, placing each on the road surface it belongs to. */
export async function buildCollectibles(
  scene: THREE.Scene,
  track: Track,
  shortcut: Shortcut,
  heightAt: (x: number, z: number) => number,
): Promise<Collectibles> {
  const group = new THREE.Group()
  group.name = 'collectibles'
  scene.add(group)

  const visuals = new Map<ItemKind, Visual>()
  const sizes: Partial<Record<ItemKind, number>> = { cookie: 1.3, key: 1.5, passkey: 1.7, boost: 1.6 }
  await Promise.all(
    (Object.keys(ICONS) as ItemKind[]).map(async (kind) => {
      const icon = ICONS[kind]
      if (!icon) return
      const geometry = await loadIconGeometry(icon, sizes[kind] ?? 1.4)
      const material = new THREE.MeshStandardMaterial({
        color: TINT[kind],
        emissive: TINT[kind],
        emissiveIntensity: kind === 'cookie' ? 0.35 : 0.8,
        roughness: 0.35,
        metalness: kind === 'key' ? 0.8 : 0.1,
      })
      visuals.set(kind, { geometry, material, glow: (sizes[kind] ?? 1.4) * 2.6 })
    }),
  )

  const all: Collectible[] = ITEMS.map((item) => {
    const s = item.path === 'shortcut' ? shortcut.at(item.u) : track.at(item.u)
    const position = s.point.clone().addScaledVector(s.normal, item.offset)
    // Items off the asphalt sit on the terrain (stream bed, grass); on it, on the road surface.
    const ground = Math.abs(item.offset) > 6 ? heightAt(position.x, position.z) : s.point.y
    position.y = ground + HOVER_Y

    const mesh = new THREE.Group()
    const label = LABELS[item.kind]
    if (label) {
      const tex = labelTexture(label)
      const h = 1.6
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(h * (tex.userData.aspect as number), h),
        new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true }),
      )
      mesh.add(plane, glowSprite(COLORS.purple, 4.5))
    } else {
      const v = visuals.get(item.kind)
      if (v) {
        const m = new THREE.Mesh(v.geometry, v.material)
        m.castShadow = true
        mesh.add(m, glowSprite(TINT[item.kind], v.glow))
      }
    }
    mesh.position.copy(position)
    // Face the direction of travel so the icon reads as the van approaches.
    mesh.rotation.y = Math.atan2(s.tangent.x, s.tangent.z) + Math.PI
    group.add(mesh)
    return { ...item, position, mesh, taken: false }
  })

  const reset = () => {
    for (const c of all) {
      c.taken = false
      c.mesh.visible = true
      c.mesh.scale.setScalar(1)
    }
  }

  const picked: Collectible[] = []
  const update = (dt: number, time: number, van: THREE.Vector3, racing: boolean) => {
    picked.length = 0
    for (const c of all) {
      if (c.taken) {
        // Shrink away after pickup.
        if (c.mesh.visible) {
          const k = c.mesh.scale.x - dt * 5
          if (k <= 0) c.mesh.visible = false
          else c.mesh.scale.setScalar(k)
        }
        continue
      }
      c.mesh.rotation.y += dt * (c.kind === 'cookie' ? 1.6 : 2.4)
      c.mesh.position.y = c.position.y + Math.sin(time * 2 + c.id) * 0.18
      if (!racing) continue
      const dx = c.position.x - van.x
      const dz = c.position.z - van.z
      if (dx * dx + dz * dz < PICK_RADIUS * PICK_RADIUS && Math.abs(c.position.y - HOVER_Y - van.y) < 2.5) {
        c.taken = true
        picked.push(c)
      }
    }
    return picked
  }

  return {
    all,
    reset,
    update,
    dispose: () => {
      scene.remove(group)
      for (const v of visuals.values()) {
        v.geometry.dispose()
        v.material.dispose()
      }
    },
  }
}
