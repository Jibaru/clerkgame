import * as THREE from 'three'
import { buildEnvironment, type Environment } from './environment'
import { loadKitModel } from './kits'
import { createRoadMaterials, loadTiling, TEXTURES_URL } from './materials'
import { buildRibbon, ROAD_W, SHORTCUT_W, SHOULDER_W, Shortcut, Track, type TrackSample } from './track'
import type { Blocked } from './vegetation'

export const COLORS = {
  purple: 0x6c47ff,
  lime: 0x7cff00,
  ink: 0x131316,
  white: 0xffffff,
} as const

/** Track ratios of the built sections. The tunnel and bridge also drive gameplay (lights, walls). */
export const TUNNEL = { u0: 0.505, u1: 0.585, halfWidth: 6.4, height: 5.6 }
export const BRIDGE = { u: 0.845, half: 0.036 }
export const HAIRPIN_WALL = { u0: 0.3, u1: 0.465 }
/** Where the shortcut meets the road, in main-track ratio. */
export const SHORTCUT_JOIN = { leave: 0.305, rejoin: 0.465 }

export type Obstacle = { box: THREE.Box3 }

export type World = {
  track: Track
  shortcut: Shortcut
  env: Environment
  obstacles: Obstacle[]
  /** Centre line of the stream (a, b) and its half width. */
  stream: { a: THREE.Vector3; b: THREE.Vector3; half: number }
  /** Resolves when the props are placed; vegetation keeps streaming after. */
  ready: Promise<void>
  update: (time: number) => void
  dispose: () => void
}

export type WorldOptions = { lite: boolean }

export function buildWorld(scene: THREE.Scene, renderer: THREE.WebGLRenderer, options: WorldOptions): World {
  const track = new Track()
  const shortcut = new Shortcut()
  const root = new THREE.Group()
  root.name = 'world'
  scene.add(root)

  // --- The stream crosses under the bridge, along the road normal. -------------------------
  const bridge = track.at(BRIDGE.u)
  const stream = {
    a: bridge.point.clone().setY(0).addScaledVector(bridge.normal, -170),
    b: bridge.point.clone().setY(0).addScaledVector(bridge.normal, 170),
    half: 7,
  }
  const streamDistance = (x: number, z: number) => segmentDistance(x, z, stream.a, stream.b)
  const carve = (x: number, z: number) => {
    const d = streamDistance(x, z)
    if (d >= stream.half) return 0
    const t = 1 - (d / stream.half) ** 2
    return -1.6 * t
  }

  // The sky waits for the props (and so for the van, which loads first): on a slow link the
  // start screen appears sooner and the HDRI pops in behind it.
  let propsReady: () => void = () => undefined
  const propsDone = new Promise<void>((resolve) => {
    propsReady = resolve
  })
  const env = buildEnvironment(scene, track, renderer, carve, propsDone)
  const roadMats = createRoadMaterials()

  // --- Road: gravel shoulder under PBR asphalt, painted markings floating just above. -------
  const shoulder = new THREE.Mesh(track.buildRibbon(ROAD_W + SHOULDER_W * 2, 0.02), roadMats.shoulder)
  shoulder.receiveShadow = true
  root.add(shoulder)
  const road = new THREE.Mesh(track.buildRibbon(ROAD_W, 0.04), roadMats.asphalt)
  road.receiveShadow = true
  root.add(road)
  const markings = new THREE.Mesh(track.buildRibbon(ROAD_W, 0.05), roadMats.markings)
  markings.renderOrder = 1
  root.add(markings)

  // --- Shortcut: a gravel ribbon between two points of the road. ----------------------------
  const gravel = new THREE.Mesh(shortcut.buildRibbon(SHORTCUT_W, 0.03), roadMats.gravel)
  gravel.receiveShadow = true
  root.add(gravel)

  // --- Start/finish line. --------------------------------------------------------------------
  root.add(buildStartLine(track))

  // --- Water. ---------------------------------------------------------------------------------
  const water = buildWater(stream)
  root.add(water.mesh)

  // --- Bridge deck sides and the tunnel. ----------------------------------------------------
  root.add(buildBridge(track))
  const tunnel = buildTunnel(track)
  root.add(tunnel)

  // --- Collision boxes for the buildings, filled in as the kits load. -----------------------
  const obstacles: Obstacle[] = []
  const ready = Promise.all([
    buildClerkHQ(root, track, obstacles),
    buildStartArea(root, track, obstacles),
    placeBarriers(root, track),
    placeLamps(root, track),
  ]).then(() => {
    propsReady()
  })

  // --- Vegetation keeps clear of everything built above. -------------------------------------
  const probe = new THREE.Vector3()
  const blocked: Blocked = (x, z) => {
    if (streamDistance(x, z) < stream.half + 2) return true
    if (shortcut.distance(probe.set(x, 0, z)) < SHORTCUT_W / 2 + 3) return true
    const near = track.nearest(probe)
    if (near.u > TUNNEL.u0 - 0.01 && near.u < TUNNEL.u1 + 0.01 && near.distance < 26) return true
    // The start area and HQ: the first 110 m of the lap, 60 m to the outside.
    if ((near.u < 0.11 || near.u > 0.985) && near.distance < 60) return true
    for (const o of obstacles) {
      if (x > o.box.min.x - 4 && x < o.box.max.x + 4 && z > o.box.min.z - 4 && z < o.box.max.z + 4)
        return true
    }
    return false
  }
  // The vegetation module (ez-tree ships its bark and leaf textures inline, several MB of JS)
  // is fetched only once the props are in, so it never delays the start screen.
  ready
    .then(() => import('./vegetation'))
    .then((m) => m.scatterVegetation(root, track, blocked, env.heightAt, { lite: options.lite }))
    .catch((err) => console.error('vegetation failed', err))

  return {
    track,
    shortcut,
    env,
    obstacles,
    stream,
    ready,
    update: (time) => water.update(time),
    dispose: () => {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose()
      })
      scene.remove(root)
      env.dispose()
    },
  }
}

// ------------------------------------------------------------------------------------------ helpers

function segmentDistance(px: number, pz: number, a: THREE.Vector3, b: THREE.Vector3): number {
  const abx = b.x - a.x
  const abz = b.z - a.z
  const len2 = abx * abx + abz * abz || 1
  const t = THREE.MathUtils.clamp(((px - a.x) * abx + (pz - a.z) * abz) / len2, 0, 1)
  return Math.hypot(px - (a.x + abx * t), pz - (a.z + abz * t))
}

function rockMaterial(repeatU: number, repeatV: number, color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: loadTiling(`${TEXTURES_URL}/Rock051/Rock051_1K-JPG_Color.jpg`, true, repeatU, repeatV),
    normalMap: loadTiling(`${TEXTURES_URL}/Rock051/Rock051_1K-JPG_NormalGL.jpg`, false, repeatU, repeatV),
    roughnessMap: loadTiling(`${TEXTURES_URL}/Rock051/Rock051_1K-JPG_Roughness.jpg`, false, repeatU, repeatV),
    roughness: 1,
    metalness: 0,
    color,
    envMapIntensity: 0.5,
  })
}

/**
 * A tube around a stretch of track: `profile(a)` gives (lateral, up) in metres for the angle
 * a ∈ [0, π] from the right-hand base over the top to the left-hand base. `taper(t)` scales the
 * profile along the stretch so mounds can close down to portals at both ends.
 */
function buildTube(
  sample: (u: number) => TrackSample,
  u0: number,
  u1: number,
  profile: (a: number) => [number, number],
  inward: boolean,
  along = 48,
  around = 18,
  taper: (t: number) => number = () => 1,
  jitter = 0,
): THREE.BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  let dist = 0
  let prev: THREE.Vector3 | null = null
  const up = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i <= along; i++) {
    const t = i / along
    const { point, normal } = sample(u0 + (u1 - u0) * t)
    if (prev) dist += point.distanceTo(prev)
    prev = point
    const k = taper(t)
    for (let j = 0; j <= around; j++) {
      const a = (j / around) * Math.PI
      const [lat, h] = profile(a)
      const noise = jitter
        ? 1 + jitter * (Math.sin(i * 1.7 + j * 2.3) * 0.5 + Math.sin(i * 0.6 + j * 5.1) * 0.5)
        : 1
      const p = point
        .clone()
        .addScaledVector(normal, lat * k * noise)
        .addScaledVector(up, h * k * noise - 0.3)
      positions.push(p.x, p.y, p.z)
      uvs.push(dist / 8, j / around)
    }
  }
  for (let i = 0; i < along; i++) {
    for (let j = 0; j < around; j++) {
      const a = i * (around + 1) + j
      const b = a + around + 1
      if (inward) indices.push(a, a + 1, b, a + 1, b + 1, b)
      else indices.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

function buildTunnel(track: Track): THREE.Group {
  const g = new THREE.Group()
  g.name = 'tunnel'
  const sample = (u: number) => track.at(u)
  const { u0, u1, halfWidth, height } = TUNNEL
  // Inner arch, seen from inside.
  const inner = new THREE.Mesh(
    buildTube(sample, u0, u1, (a) => [Math.cos(a) * halfWidth, Math.sin(a) * height], true, 48, 16),
    rockMaterial(1, 2, 0x5a5856),
  )
  inner.receiveShadow = true
  g.add(inner)
  // Outer mound, tapering to a portal at both ends.
  const taper = (t: number) => {
    const edge = Math.min(t, 1 - t)
    const s = THREE.MathUtils.smoothstep(edge, 0, 0.22)
    return 1.12 + s * 2.4
  }
  const outer = new THREE.Mesh(
    buildTube(
      sample,
      u0 - 0.004,
      u1 + 0.004,
      (a) => [Math.cos(a) * halfWidth, Math.sin(a) * height],
      false,
      48,
      18,
      taper,
      0.06,
    ),
    rockMaterial(1, 3, 0x8d8a84),
  )
  outer.castShadow = true
  outer.receiveShadow = true
  g.add(outer)
  // Portal rings: a flat ring of stone at each mouth.
  for (const u of [u0, u1]) {
    const { point, tangent, normal } = track.at(u)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(halfWidth * 1.02, halfWidth * 1.35, 24, 1, 0, Math.PI),
      rockMaterial(2, 2, 0x6e6b66),
    )
    ring.position.copy(point).setY(point.y - 0.3)
    ring.lookAt(point.clone().add(tangent))
    // RingGeometry lies in XY facing +Z; after lookAt its X axis must match the track normal.
    const x = new THREE.Vector3(1, 0, 0).applyQuaternion(ring.quaternion)
    if (x.dot(normal) < 0) ring.rotateZ(Math.PI)
    ring.castShadow = true
    g.add(ring)
  }
  // Ceiling lamps: warm emissive strips every 9 m.
  const lampGeo = new THREE.BoxGeometry(0.5, 0.12, 1.6)
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfff1c8,
    emissive: 0xffd27a,
    emissiveIntensity: 3,
  })
  const n = Math.floor(((u1 - u0) * track.length) / 9)
  for (let i = 0; i <= n; i++) {
    const u = u0 + ((u1 - u0) * (i + 0.5)) / (n + 1)
    const { point, tangent } = track.at(u)
    const lamp = new THREE.Mesh(lampGeo, lampMat)
    lamp.position.copy(point).setY(height - 0.45)
    lamp.lookAt(point.clone().add(tangent))
    g.add(lamp)
  }
  return g
}

function buildBridge(track: Track): THREE.Group {
  const g = new THREE.Group()
  g.name = 'bridge'
  const u0 = BRIDGE.u - BRIDGE.half
  const u1 = BRIDGE.u + BRIDGE.half
  const sample = (u: number) => track.at(u)
  const stone = rockMaterial(1, 1, 0x9a948a)
  stone.side = THREE.DoubleSide
  // Side walls from the deck down to the ground, 0.9 m parapet on top.
  for (const side of [1, -1]) {
    const off = side * (ROAD_W / 2 + SHOULDER_W)
    const wall = new THREE.Mesh(buildRibbonVertical(sample, u0, u1, off, -2.2, 0.9), stone)
    wall.castShadow = true
    wall.receiveShadow = true
    g.add(wall)
  }
  // The deck underside so the bridge reads as a slab from the stream bed.
  const under = new THREE.Mesh(buildRibbon(sample, ROAD_W + SHOULDER_W * 2 + 0.2, -0.6, 40, u0, u1), stone)
  g.add(under)
  return g
}

/** A vertical ribbon at a lateral offset, from `bottom` to `top` metres relative to the road surface. */
function buildRibbonVertical(
  sample: (u: number) => TrackSample,
  u0: number,
  u1: number,
  offset: number,
  bottom: number,
  top: number,
  segments = 40,
): THREE.BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  let dist = 0
  let prev: THREE.Vector3 | null = null
  for (let i = 0; i <= segments; i++) {
    const { point, normal } = sample(u0 + ((u1 - u0) * i) / segments)
    if (prev) dist += point.distanceTo(prev)
    prev = point
    const base = point.clone().addScaledVector(normal, offset)
    positions.push(base.x, Math.min(0, point.y + bottom), base.z, base.x, point.y + top, base.z)
    uvs.push(dist / 4, 0, dist / 4, 1)
    if (i < segments) {
      const a = i * 2
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

function buildWater(stream: World['stream']): { mesh: THREE.Mesh; update: (t: number) => void } {
  const dir = stream.b.clone().sub(stream.a)
  const len = dir.length()
  dir.normalize()
  const geo = new THREE.PlaneGeometry(len, stream.half * 2 - 1, 1, 1)
  geo.rotateX(-Math.PI / 2)
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2f86b8,
    transparent: true,
    opacity: 0.72,
    roughness: 0.12,
    metalness: 0.1,
    envMapIntensity: 1.2,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.copy(stream.a).add(stream.b).multiplyScalar(0.5).setY(-0.55)
  mesh.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI / 2
  mesh.receiveShadow = true
  return {
    mesh,
    update: (t) => {
      mesh.position.y = -0.55 + Math.sin(t * 1.3) * 0.04
    },
  }
}

function checkerTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 32
  const ctx = c.getContext('2d') as CanvasRenderingContext2D
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 8; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#111113' : '#f4f4f6'
      ctx.fillRect(x * 16, y * 16, 16, 16)
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

/** Checkered band painted across the road at u = 0. */
function buildStartLine(track: Track): THREE.Mesh {
  const { point, tangent } = track.at(0)
  const tex = checkerTexture()
  tex.repeat.set(ROAD_W / 2, 1)
  const geo = new THREE.PlaneGeometry(ROAD_W, 2)
  geo.rotateX(-Math.PI / 2)
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    }),
  )
  mesh.position.copy(point).setY(0.06)
  mesh.rotation.y = Math.atan2(tangent.x, tangent.z)
  mesh.renderOrder = 2
  return mesh
}

function textTexture(
  text: string,
  bg: string,
  fg: string,
  font = '700 96px Inter, ui-sans-serif, system-ui, sans-serif',
): THREE.CanvasTexture {
  const measure = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D
  measure.font = font
  const w = Math.ceil(measure.measureText(text).width + 120)
  const h = 160
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d') as CanvasRenderingContext2D
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)
  ctx.font = font
  ctx.fillStyle = fg
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, w / 2, h / 2 + 4)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.userData.aspect = w / h
  return tex
}

/** Start arch (two pillars, a beam with the checkered band and a "FINISH" banner) and a grandstand. */
async function buildStartArea(root: THREE.Group, track: Track, obstacles: Obstacle[]): Promise<void> {
  const { point, tangent, normal } = track.at(0.004)
  const g = new THREE.Group()
  g.name = 'start-area'
  g.position.copy(point)
  g.rotation.y = Math.atan2(tangent.x, tangent.z)
  // In the group's frame +z is along the track and +x is... the track normal flipped; use a
  // local basis instead so placements read as (lateral, up, along).
  const place = (o: THREE.Object3D, lateral: number, up: number, along: number) => {
    o.position.copy(point).addScaledVector(normal, lateral).addScaledVector(tangent, along)
    o.position.y += up
  }

  const steel = new THREE.MeshStandardMaterial({ color: 0xe8e8ec, roughness: 0.5, metalness: 0.6 })
  const purple = new THREE.MeshStandardMaterial({ color: COLORS.purple, roughness: 0.6, metalness: 0.1 })
  const span = ROAD_W + SHOULDER_W * 2 + 2
  for (const side of [1, -1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 7.5, 0.8), purple)
    place(pillar, side * (span / 2), 3.75, 0)
    pillar.castShadow = true
    root.add(pillar)
    const foot = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.6), steel)
    place(foot, side * (span / 2), 0.25, 0)
    root.add(foot)
    obstacles.push({ box: new THREE.Box3().setFromObject(pillar) })
  }
  // The beam is the banner: a dark box with the name on the face the van approaches and the
  // checkered band under it.
  const ink = new THREE.MeshStandardMaterial({ color: COLORS.ink, roughness: 0.7, metalness: 0.2 })
  const beam = new THREE.Mesh(new THREE.BoxGeometry(span + 0.8, 1.9, 1.0), ink)
  place(beam, 0, 7.6, 0)
  beam.rotation.y = g.rotation.y
  beam.castShadow = true
  root.add(beam)
  const banner = textTexture('CLERK VAN RUN', '#131316', '#ffffff')
  const bannerH = 1.5
  for (const face of [-1, 1]) {
    const bannerMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(bannerH * (banner.userData.aspect as number), bannerH),
      new THREE.MeshBasicMaterial({ map: banner }),
    )
    place(bannerMesh, 0, 7.75, face * 0.52)
    bannerMesh.rotation.y = g.rotation.y + (face > 0 ? 0 : Math.PI)
    root.add(bannerMesh)
  }
  const checker = checkerTexture()
  checker.repeat.set(span / 2, 1)
  const band = new THREE.Mesh(
    new THREE.PlaneGeometry(span + 0.8, 0.5),
    new THREE.MeshBasicMaterial({ map: checker, side: THREE.DoubleSide }),
  )
  place(band, 0, 6.4, 0)
  band.rotation.y = g.rotation.y
  root.add(band)

  // Grandstand on the inside of the straight (the HQ is on the outside), 5 stepped rows.
  const stand = new THREE.Group()
  const seatMats = [
    new THREE.MeshStandardMaterial({ color: COLORS.purple, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0xe9e4ff, roughness: 0.8 }),
  ]
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb8b6b0, roughness: 0.95 })
  const rows = 5
  const standLen = 46
  for (let r = 0; r < rows; r++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1 * (r + 1), standLen), concrete)
    step.position.set(r * 2.2, (1.1 * (r + 1)) / 2, 0)
    step.castShadow = true
    step.receiveShadow = true
    stand.add(step)
    for (let s = 0; s < 18; s++) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 1.6), seatMats[(s + r) % 2])
      seat.position.set(r * 2.2 - 0.3, 1.1 * (r + 1) + 0.25, -standLen / 2 + 2 + s * 2.4)
      stand.add(seat)
    }
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(rows * 2.2 + 2, 0.3, standLen + 2), steel)
  roof.position.set((rows * 2.2) / 2 - 0.5, rows * 1.1 + 3.6, 0)
  roof.castShadow = true
  stand.add(roof)
  for (const zz of [-standLen / 2 + 1, standLen / 2 - 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, rows * 1.1 + 3.6), steel)
    post.position.set(rows * 2.2 + 0.3, (rows * 1.1 + 3.6) / 2, zz)
    stand.add(post)
  }
  // Rotating by the track heading + π puts local +x on the track normal (toward the inside)
  // and local z along the track, so the steps climb away from the road.
  stand.position
    .copy(point)
    .addScaledVector(normal, ROAD_W / 2 + SHOULDER_W + 4)
    .addScaledVector(tangent, 36)
  stand.rotation.y = Math.atan2(tangent.x, tangent.z) + Math.PI
  root.add(stand)
  obstacles.push({ box: new THREE.Box3().setFromObject(stand) })

  // Pit tents and the race office on the outside, before the HQ.
  const [tent, office, garage] = await Promise.all([
    loadKitModel('racing-kit/tentLong.glb').catch(() => null),
    loadKitModel('racing-kit/pitsOffice.glb').catch(() => null),
    loadKitModel('racing-kit/pitsGarageClosed.glb').catch(() => null),
  ])
  const outside = (m: THREE.Group | null, along: number, lateral: number, scale: number, rot = 0) => {
    if (!m) return
    m.scale.setScalar(scale)
    m.position.copy(point).addScaledVector(normal, -lateral).addScaledVector(tangent, along)
    m.rotation.y = Math.atan2(normal.x, normal.z) + rot
    root.add(m)
    obstacles.push({ box: new THREE.Box3().setFromObject(m) })
  }
  outside(tent, -30, ROAD_W / 2 + 10, 7)
  outside(tent?.clone(true) ?? null, -42, ROAD_W / 2 + 10, 7)
  outside(office, 8, ROAD_W / 2 + 12, 7)
  outside(garage, 22, ROAD_W / 2 + 12, 7)
}

/** Clerk HQ: Kenney commercial buildings on the outside of the start straight with a sign. */
async function buildClerkHQ(root: THREE.Group, track: Track, obstacles: Obstacle[]): Promise<void> {
  const { point, tangent, normal } = track.at(0.06)
  const [tower, bA, bB] = await Promise.all([
    loadKitModel('city-kit-commercial/building-skyscraper-a.glb').catch(() => null),
    loadKitModel('city-kit-commercial/building-c.glb').catch(() => null),
    loadKitModel('city-kit-commercial/building-h.glb').catch(() => null),
  ])
  const facing = Math.atan2(normal.x, normal.z)
  const put = (m: THREE.Group | null, along: number, lateral: number, scale: number) => {
    if (!m) return null
    m.scale.setScalar(scale)
    m.position.copy(point).addScaledVector(normal, -lateral).addScaledVector(tangent, along)
    m.rotation.y = facing
    root.add(m)
    const box = new THREE.Box3().setFromObject(m)
    obstacles.push({ box })
    return box
  }
  const box = put(tower, 0, ROAD_W / 2 + 30, 9)
  put(bA, -22, ROAD_W / 2 + 24, 8)
  put(bB, 22, ROAD_W / 2 + 24, 8)
  // Plaza in front of the tower and the sign.
  const plaza = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 22),
    new THREE.MeshStandardMaterial({ color: 0xd7d5d0, roughness: 0.9 }),
  )
  plaza.rotateX(-Math.PI / 2)
  plaza.position
    .copy(point)
    .addScaledVector(normal, -(ROAD_W / 2 + 12))
    .setY(0.03)
  plaza.rotation.z = -Math.atan2(tangent.x, tangent.z)
  plaza.receiveShadow = true
  root.add(plaza)

  const sign = textTexture(
    'clerk',
    '#131316',
    '#ffffff',
    '700 110px Inter, ui-sans-serif, system-ui, sans-serif',
  )
  const h = 4
  const signMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(h * (sign.userData.aspect as number), h),
    new THREE.MeshBasicMaterial({ map: sign }),
  )
  const top = box ? box.max.y : 30
  signMesh.position
    .copy(point)
    .addScaledVector(normal, -(ROAD_W / 2 + 30))
    .setY(top + 3)
  signMesh.rotation.y = facing + Math.PI
  root.add(signMesh)
  const post = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 6, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x333338, roughness: 0.7 }),
  )
  post.position.copy(signMesh.position).setY(top)
  root.add(post)
}

/** Red/white barriers along the outside of the hairpin, and cones at the shortcut mouths. */
async function placeBarriers(root: THREE.Group, track: Track): Promise<void> {
  const [barrier, pylon] = await Promise.all([
    loadKitModel('racing-kit/barrierRed.glb').catch(() => null),
    loadKitModel('racing-kit/pylon.glb').catch(() => null),
  ])
  if (barrier) {
    const { u0, u1 } = HAIRPIN_WALL
    const n = Math.floor(((u1 - u0) * track.length) / 3.2)
    for (let i = 0; i <= n; i++) {
      const u = u0 + ((u1 - u0) * i) / n
      const { point, tangent, normal } = track.at(u)
      const m = barrier.clone(true)
      m.scale.setScalar(6)
      m.position.copy(point).addScaledVector(normal, -(ROAD_W / 2 + SHOULDER_W + 0.6))
      m.rotation.y = Math.atan2(tangent.x, tangent.z) + Math.PI / 2
      root.add(m)
    }
  }
  if (pylon) {
    for (const u of [SHORTCUT_JOIN.leave, SHORTCUT_JOIN.rejoin]) {
      for (const d of [-6, 6]) {
        const { point, tangent, normal } = track.at(u + d / track.length)
        const m = pylon.clone(true)
        m.scale.setScalar(5)
        m.position.copy(point).addScaledVector(normal, ROAD_W / 2 + SHOULDER_W + 0.4)
        m.rotation.y = Math.atan2(tangent.x, tangent.z)
        root.add(m)
      }
    }
  }
}

/** Light posts along the start straight and the final bend. */
async function placeLamps(root: THREE.Group, track: Track): Promise<void> {
  const lamp = await loadKitModel('racing-kit/lightPostModern.glb').catch(() => null)
  if (!lamp) return
  const spots: Array<[number, number]> = []
  for (let i = 0; i < 6; i++) spots.push([0.9 + i * 0.02, -1])
  for (let i = 0; i < 6; i++) spots.push([0.01 + i * 0.02, 1])
  for (const [u, side] of spots) {
    const { point, tangent, normal } = track.at(u)
    const m = lamp.clone(true)
    m.scale.setScalar(7)
    m.position.copy(point).addScaledVector(normal, side * (ROAD_W / 2 + SHOULDER_W + 1.5))
    m.rotation.y = Math.atan2(tangent.x, tangent.z) + (side > 0 ? Math.PI / 2 : -Math.PI / 2)
    root.add(m)
  }
}
