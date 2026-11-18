import * as THREE from 'three'
import type { Track } from './track'

/**
 * A stylised valley: gradient sky dome with cartoon clouds, flat-shaded rolling terrain in
 * saturated greens with a dirt wear strip along the road, and image-based light baked from
 * the sky itself so the van's paint still picks up a soft reflection. No photographs.
 */
export type Environment = {
  /** Height of the terrain at world x,z. Flat (0, or the carve) within FLAT_RADIUS of the road. */
  heightAt: (x: number, z: number) => number
  terrain: THREE.Mesh
  /** Unit vector toward the sun, for the shadow light. */
  sunDirection: THREE.Vector3
  update: (dt: number, cameraPosition: THREE.Vector3) => void
  dispose: () => void
  ready: Promise<void>
}

export const FLAT_RADIUS = 72
const BLEND_WIDTH = 40
const TERRAIN_SIZE = 1600
const TERRAIN_SEGMENTS = 200
const MOUNTAIN_START = 260
const FOG_NEAR = 220
const FOG_FAR = 820
const ROAD_CELL = 8

export const PALETTE = {
  skyTop: new THREE.Color('#3f7ee8'),
  skyHorizon: new THREE.Color('#bfe3ff'),
  skyGround: new THREE.Color('#dff5c8'),
  grass: new THREE.Color('#7fd13b'),
  grassDark: new THREE.Color('#5cb12d'),
  dirt: new THREE.Color('#c9a06b'),
  rock: new THREE.Color('#8e8fa3'),
  snow: new THREE.Color('#f4f7ff'),
  cloud: new THREE.Color('#ffffff'),
  fog: new THREE.Color('#c9e4ff'),
} as const

// --------------------------------------------------------------------------- noise

function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}
function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = smooth(x - x0)
  const fy = smooth(y - y0)
  const a = hash2(x0, y0)
  const b = hash2(x0 + 1, y0)
  const c = hash2(x0, y0 + 1)
  const d = hash2(x0 + 1, y0 + 1)
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}
export function fbm(x: number, y: number, octaves: number, lacunarity = 2, gain = 0.5): number {
  let amp = 1
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq) * amp
    norm += amp
    amp *= gain
    freq *= lacunarity
  }
  return sum / norm
}
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

// --------------------------------------------------------------------------- height field

export type Carve = (x: number, z: number) => number

type HeightField = {
  at: (x: number, z: number) => number
  roadDistance: (x: number, z: number) => number
  centre: THREE.Vector2
}

function buildHeightField(track: Track, carve: Carve): HeightField {
  const pts = track.curve.points
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  for (const p of pts) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minZ = Math.min(minZ, p.z)
    maxZ = Math.max(maxZ, p.z)
  }
  const centre = new THREE.Vector2((minX + maxX) / 2, (minZ + maxZ) / 2)
  const n = Math.ceil(TERRAIN_SIZE / ROAD_CELL) + 1
  const half = TERRAIN_SIZE / 2
  const min = new THREE.Vector2(centre.x - half, centre.y - half)
  const dist = new Float32Array(n * n)
  const probe = new THREE.Vector3()
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      probe.set(min.x + i * ROAD_CELL, 0, min.y + j * ROAD_CELL)
      dist[j * n + i] = track.nearest(probe).distance
    }
  }
  const roadDistance = (x: number, z: number): number => {
    const gx = THREE.MathUtils.clamp((x - min.x) / ROAD_CELL, 0, n - 1.0001)
    const gz = THREE.MathUtils.clamp((z - min.y) / ROAD_CELL, 0, n - 1.0001)
    const i0 = Math.floor(gx)
    const j0 = Math.floor(gz)
    const fx = gx - i0
    const fz = gz - j0
    const i1 = Math.min(i0 + 1, n - 1)
    const j1 = Math.min(j0 + 1, n - 1)
    const a = dist[j0 * n + i0] ?? 0
    const b = dist[j0 * n + i1] ?? 0
    const c = dist[j1 * n + i0] ?? 0
    const d = dist[j1 * n + i1] ?? 0
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz
  }
  const at = (x: number, z: number): number => {
    const d = roadDistance(x, z)
    if (d < FLAT_RADIUS) return carve(x, z)
    const rise = smoothstep(FLAT_RADIUS, FLAT_RADIUS + BLEND_WIDTH, d)
    const hills = 4 + 12 * fbm(x * 0.006 + 13.7, z * 0.006 + 71.3, 4)
    const ring = smoothstep(MOUNTAIN_START, MOUNTAIN_START + 260, d)
    const ridge = 1 - Math.abs(2 * fbm(x * 0.0028 + 3.1, z * 0.0028 + 9.4, 5, 2.1, 0.55) - 1)
    const peaks = fbm(x * 0.0045 + 101, z * 0.0045 + 47, 3)
    const mountain = ring * (40 + 70 * (0.55 * ridge + 0.45 * peaks))
    return rise * (hills + mountain)
  }
  return { at, roadDistance, centre }
}

// --------------------------------------------------------------------------- terrain

function buildTerrain(field: HeightField): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const count = pos.count
  for (let i = 0; i < count; i++) {
    const x = pos.getX(i) + field.centre.x
    const z = pos.getZ(i) + field.centre.y
    pos.setXYZ(i, x, field.at(x, z), z)
  }
  // Flat shading needs unshared vertices.
  const flat = geo.toNonIndexed()
  flat.computeVertexNormals()
  const fpos = flat.getAttribute('position') as THREE.BufferAttribute
  const fnrm = flat.getAttribute('normal') as THREE.BufferAttribute
  const colors = new Float32Array(fpos.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < fpos.count; i += 3) {
    // One colour per triangle, from its centroid: dirt near the road, grass, rock on slopes, snow up high.
    const x = (fpos.getX(i) + fpos.getX(i + 1) + fpos.getX(i + 2)) / 3
    const y = (fpos.getY(i) + fpos.getY(i + 1) + fpos.getY(i + 2)) / 3
    const z = (fpos.getZ(i) + fpos.getZ(i + 1) + fpos.getZ(i + 2)) / 3
    const slope = 1 - (fnrm.getY(i) + fnrm.getY(i + 1) + fnrm.getY(i + 2)) / 3
    const road = field.roadDistance(x, z)
    const patch = fbm(x * 0.03 + 5, z * 0.03 + 9, 2)
    c.copy(PALETTE.grass).lerp(PALETTE.grassDark, patch * 0.7)
    // Dirt only well away from the road (the shoulder ribbon handles the verge), so no chunky triangles.
    c.lerp(PALETTE.dirt, smoothstep(0.6, 0.85, patch) * smoothstep(30, 60, road) * 0.5)
    const rock = Math.max(smoothstep(0.38, 0.62, slope), smoothstep(62, 95, y))
    c.lerp(PALETTE.rock, rock)
    c.lerp(PALETTE.snow, smoothstep(95, 120, y))
    for (let k = 0; k < 3; k++) {
      colors[(i + k) * 3] = c.r
      colors[(i + k) * 3 + 1] = c.g
      colors[(i + k) * 3 + 2] = c.b
    }
  }
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  flat.computeBoundingSphere()
  geo.dispose()
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.95,
    metalness: 0,
    envMapIntensity: 0.3,
  })
  const mesh = new THREE.Mesh(flat, material)
  mesh.name = 'terrain'
  mesh.receiveShadow = true
  mesh.position.y = -0.05
  return mesh
}

// --------------------------------------------------------------------------- sky

function buildSkyDome(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1400, 32, 16)
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: PALETTE.skyTop },
      horizon: { value: PALETTE.skyHorizon },
      ground: { value: PALETTE.skyGround },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 ground;
      varying vec3 vDir;
      void main() {
        float y = vDir.y;
        vec3 c = y > 0.0 ? mix(horizon, top, pow(min(1.0, y * 1.6), 0.7)) : mix(horizon, ground, min(1.0, -y * 6.0));
        gl_FragColor = vec4(c, 1.0);
      }`,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = 'sky'
  mesh.renderOrder = -10
  mesh.frustumCulled = false
  return mesh
}

/** Puffy clouds: a few overlapping flat-shaded spheres per cloud, drifting slowly. */
function buildClouds(centre: THREE.Vector2): { group: THREE.Group; update: (dt: number) => void } {
  const group = new THREE.Group()
  group.name = 'clouds'
  // Unlit so they stay white against the sky whatever the sun does.
  const mat = new THREE.MeshBasicMaterial({ color: PALETTE.cloud, fog: false })
  const geo = new THREE.IcosahedronGeometry(1, 1)
  const clouds: Array<{ mesh: THREE.Group; speed: number }> = []
  let seed = 11
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  for (let i = 0; i < 26; i++) {
    const cloud = new THREE.Group()
    const puffs = 4 + Math.floor(rand() * 4)
    const size = 18 + rand() * 26
    for (let p = 0; p < puffs; p++) {
      const m = new THREE.Mesh(geo, mat)
      const s = size * (0.45 + rand() * 0.55)
      m.scale.set(s, s * 0.55, s)
      m.position.set(
        (p - puffs / 2) * size * 0.55 + (rand() - 0.5) * 8,
        (rand() - 0.5) * 6,
        (rand() - 0.5) * 14,
      )
      cloud.add(m)
    }
    const a = rand() * Math.PI * 2
    const r = 380 + rand() * 520
    cloud.position.set(centre.x + Math.cos(a) * r, 150 + rand() * 120, centre.y + Math.sin(a) * r)
    cloud.rotation.y = rand() * Math.PI
    group.add(cloud)
    clouds.push({ mesh: cloud, speed: 1.5 + rand() * 2 })
  }
  return {
    group,
    update: (dt) => {
      for (const c of clouds) {
        c.mesh.position.x += c.speed * dt
        if (c.mesh.position.x > centre.x + 950) c.mesh.position.x = centre.x - 950
      }
    },
  }
}

// --------------------------------------------------------------------------- environment

export function buildEnvironment(
  scene: THREE.Scene,
  track: Track,
  renderer: THREE.WebGLRenderer,
  carve: Carve = () => 0,
  _skyAfter: Promise<unknown> = Promise.resolve(),
): Environment {
  void _skyAfter
  const field = buildHeightField(track, carve)
  const terrain = buildTerrain(field)
  scene.add(terrain)

  const previous = { background: scene.background, environment: scene.environment, fog: scene.fog }
  const sky = buildSkyDome()
  scene.add(sky)
  const clouds = buildClouds(field.centre)
  scene.add(clouds.group)
  scene.background = PALETTE.skyHorizon.clone()
  scene.fog = new THREE.Fog(PALETTE.fog, FOG_NEAR, FOG_FAR)

  // Image-based light from the sky dome alone: a soft blue-white that reads on the van.
  const pmrem = new THREE.PMREMGenerator(renderer)
  const skyScene = new THREE.Scene()
  skyScene.add(buildSkyDome())
  const envMap = pmrem.fromScene(skyScene, 0.04).texture
  pmrem.dispose()
  scene.environment = envMap
  scene.environmentIntensity = 0.7

  // Late-morning sun from the south-east.
  const sunDirection = new THREE.Vector3(0.45, 0.72, 0.52).normalize()

  return {
    heightAt: field.at,
    terrain,
    sunDirection,
    ready: Promise.resolve(),
    update: (dt) => clouds.update(dt),
    dispose: () => {
      scene.remove(terrain, sky, clouds.group)
      terrain.geometry.dispose()
      ;(terrain.material as THREE.Material).dispose()
      ;(sky.material as THREE.Material).dispose()
      sky.geometry.dispose()
      envMap.dispose()
      scene.background = previous.background
      scene.environment = previous.environment
      scene.fog = previous.fog
    },
  }
}
