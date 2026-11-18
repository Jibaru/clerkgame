import * as THREE from 'three'
import { assetUrl } from './assets'
import { fbm } from './environment'
import { ROAD_W, type Track } from './track'

/**
 * Low-poly vegetation from Kenney's Nature Kit (CC0): trees, bushes, rocks, flowers and
 * mushrooms instanced by model, plus GPU grass blades near the road. Deterministic placement
 * on the terrain through `heightAt`. The forest section of the lap is a wall of pines.
 */
export type Blocked = (x: number, z: number) => boolean
export type VegetationOptions = { lite?: boolean }

const KIT = assetUrl('/models/kits/nature-kit')
const EXTENT = 650
const ROAD_CLEAR = ROAD_W / 2 + 3
const MAX_HEIGHT = 75

const TREES = {
  broadleaf: ['tree_oak', 'tree_default', 'tree_detailed', 'tree_fat', 'tree_tall', 'tree_simple'],
  pine: [
    'tree_pineTallA_detailed',
    'tree_pineTallB_detailed',
    'tree_pineDefaultA',
    'tree_pineRoundA',
    'tree_pineTallC_detailed',
  ],
  small: ['tree_small', 'tree_thin', 'tree_cone', 'tree_pineSmallA'],
} as const
const BUSHES = ['plant_bush', 'plant_bushLarge', 'plant_bushDetailed', 'plant_bushSmall']
const ROCKS = ['rock_largeA', 'rock_largeB', 'rock_largeC', 'rock_tallA', 'rock_tallB', 'stone_largeA']
const SMALL_ROCKS = ['rock_smallA', 'rock_smallB', 'rock_smallC', 'stone_smallA']
const FLOWERS = ['flower_purpleA', 'flower_purpleB', 'flower_yellowA', 'flower_yellowB', 'flower_redA']
const MUSHROOMS = ['mushroom_red', 'mushroom_tanGroup', 'mushroom_redGroup']

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

class RoadDistanceGrid {
  private readonly cell = 8
  private readonly cols: number
  private readonly minX = -EXTENT
  private readonly minZ = -EXTENT
  private readonly data: Float32Array
  constructor(track: Track) {
    this.cols = Math.ceil((EXTENT * 2) / this.cell) + 1
    this.data = new Float32Array(this.cols * this.cols)
    const p = new THREE.Vector3()
    for (let r = 0; r < this.cols; r++) {
      for (let c = 0; c < this.cols; c++) {
        p.set(this.minX + c * this.cell, 0, this.minZ + r * this.cell)
        this.data[r * this.cols + c] = track.nearest(p).distance
      }
    }
  }
  at(x: number, z: number): number {
    const fx = (x - this.minX) / this.cell
    const fz = (z - this.minZ) / this.cell
    const c0 = THREE.MathUtils.clamp(Math.floor(fx), 0, this.cols - 2)
    const r0 = THREE.MathUtils.clamp(Math.floor(fz), 0, this.cols - 2)
    const tx = THREE.MathUtils.clamp(fx - c0, 0, 1)
    const tz = THREE.MathUtils.clamp(fz - r0, 0, 1)
    const d00 = this.data[r0 * this.cols + c0] ?? 0
    const d10 = this.data[r0 * this.cols + c0 + 1] ?? 0
    const d01 = this.data[(r0 + 1) * this.cols + c0] ?? 0
    const d11 = this.data[(r0 + 1) * this.cols + c0 + 1] ?? 0
    return (d00 * (1 - tx) + d10 * tx) * (1 - tz) + (d01 * (1 - tx) + d11 * tx) * tz
  }
}

// ---------------------------------------------------------------------------------- loading

let loaderPromise: Promise<typeof import('three/addons/loaders/GLTFLoader.js')> | null = null
const cache = new Map<string, Promise<THREE.Group | null>>()

function loadModel(name: string): Promise<THREE.Group | null> {
  let p = cache.get(name)
  if (!p) {
    loaderPromise ??= import('three/addons/loaders/GLTFLoader.js')
    p = loaderPromise.then(
      ({ GLTFLoader }) =>
        new Promise<THREE.Group | null>((resolve) => {
          new GLTFLoader().load(
            `${KIT}/${name}.glb`,
            (gltf) => {
              gltf.scene.traverse((o) => {
                if (!(o instanceof THREE.Mesh)) return
                const mats = Array.isArray(o.material) ? o.material : [o.material]
                for (const m of mats) {
                  if (m instanceof THREE.MeshStandardMaterial) {
                    m.roughness = 0.9
                    m.metalness = 0
                    m.envMapIntensity = 0.3
                  }
                }
              })
              resolve(gltf.scene)
            },
            undefined,
            () => {
              console.warn(`vegetation: missing ${name}`)
              resolve(null)
            },
          )
        }),
    )
    cache.set(name, p)
  }
  return p
}

type Placement = { x: number; z: number; scale: number; yaw: number }

/** One InstancedMesh per mesh inside the model, keeping each child's offset and material. */
function instance(
  root: THREE.Group,
  model: THREE.Group,
  placements: Placement[],
  heightAt: (x: number, z: number) => number,
  shadow: boolean,
): number {
  model.updateMatrixWorld(true)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const v = new THREE.Vector3()
  const s = new THREE.Vector3()
  const world = placements.map((p) => {
    e.set(0, p.yaw, 0)
    q.setFromEuler(e)
    v.set(p.x, heightAt(p.x, p.z) - 0.05, p.z)
    s.setScalar(p.scale)
    return m.compose(v, q, s).clone()
  })
  let draws = 0
  const tmp = new THREE.Matrix4()
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const mesh = new THREE.InstancedMesh(child.geometry, child.material, world.length)
    world.forEach((wm, i) => {
      mesh.setMatrixAt(i, tmp.multiplyMatrices(wm, child.matrixWorld))
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.castShadow = shadow
    mesh.receiveShadow = shadow
    mesh.frustumCulled = false
    root.add(mesh)
    draws++
  })
  return draws
}

// ---------------------------------------------------------------------------------- grass

const windStart = performance.now()
const GRASS_COLORS = ['#8ee04a', '#7fd13b', '#a3ea5e', '#6cc232'].map((c) => new THREE.Color(c))

function bladeGeometry(): THREE.BufferGeometry {
  const w = 0.14
  const segs = 2
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (const rot of [0, Math.PI / 2]) {
    const base = positions.length / 3
    for (let s = 0; s <= segs; s++) {
      const t = s / segs
      const bend = 0.1 * t * t
      const half = (w / 2) * (1 - t * 0.9)
      const c = Math.cos(rot)
      const sn = Math.sin(rot)
      positions.push(-half * c, t, -half * sn + bend, half * c, t, half * sn + bend)
      uvs.push(0, t, 1, t)
    }
    for (let s = 0; s < segs; s++) {
      const a = base + s * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

function grassMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
    envMapIntensity: 0.3,
  })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vTip;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vTip = uv.y;
        {
          #ifdef USE_INSTANCING
            vec3 wp = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          #else
            vec3 wp = vec3(0.0);
          #endif
          float phase = wp.x * 0.35 + wp.z * 0.27;
          float k = uv.y * uv.y;
          transformed.x += k * (0.08 * sin(uTime * 1.4 + phase) + 0.04 * sin(uTime * 3.1 + phase * 1.9));
          transformed.z += k * 0.05 * sin(uTime * 1.1 + phase * 0.7);
        }`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vTip;')
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n diffuseColor.rgb *= mix(0.7, 1.1, vTip);',
      )
    m.userData.shader = shader
  }
  m.onBeforeRender = () => {
    const shader = m.userData.shader as { uniforms: { uTime: { value: number } } } | undefined
    if (shader) shader.uniforms.uTime.value = (performance.now() - windStart) / 1000
  }
  return m
}

// ---------------------------------------------------------------------------------- planning

type Plan = Map<string, Placement[]>

function plan(track: Track, blocked: Blocked, heightAt: (x: number, z: number) => number, lite: boolean) {
  const rand = mulberry32(2026)
  const grid = new RoadDistanceGrid(track)
  const probe = new THREE.Vector3()
  const byModel: Plan = new Map()
  const put = (model: string, x: number, z: number, scale: number) => {
    let list = byModel.get(model)
    if (!list) {
      list = []
      byModel.set(model, list)
    }
    list.push({ x, z, scale, yaw: rand() * Math.PI * 2 })
  }
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)] as T
  const clearance = (x: number, z: number): number => {
    if (Math.abs(x) > EXTENT || Math.abs(z) > EXTENT) return -1
    const coarse = grid.at(x, z)
    if (coarse < ROAD_CLEAR + 10) {
      probe.set(x, 0, z)
      if (track.nearest(probe).distance < ROAD_CLEAR) return -1
    }
    if (blocked(x, z)) return -1
    return coarse
  }
  const inForest = (x: number, z: number) => {
    probe.set(x, 0, z)
    const u = track.nearest(probe).u
    return u > 0.6 && u < 0.84
  }
  const slopeAt = (x: number, z: number) =>
    Math.hypot(heightAt(x + 1.5, z) - heightAt(x - 1.5, z), heightAt(x, z + 1.5) - heightAt(x, z - 1.5)) / 3

  // Trees. Kenney trees are ~1.5 units tall; scale 6-9 makes 9-14 m trees.
  const budget = lite ? 700 : 1400
  for (let i = 0, n = 0; i < 60000 && n < budget; i++) {
    const x = (rand() * 2 - 1) * EXTENT
    const z = (rand() * 2 - 1) * EXTENT
    const road = clearance(x, z)
    if (road < 10) continue
    const h = heightAt(x, z)
    if (h > MAX_HEIGHT || slopeAt(x, z) > 0.8) continue
    const forest = inForest(x, z)
    const r = rand()
    if (road < 45 && !forest && r > 0.12) continue
    const density = forest && road < 60 ? 0.85 : road < 120 ? 0.35 : road < 300 ? 0.18 : 0.05
    if (r > density) continue
    const kind = forest || h > 25 || rand() < 0.3 ? TREES.pine : TREES.broadleaf
    put(pick(kind), x, z, 6 + rand() * 3.5)
    n++
  }
  // Bushes and small trees in the belt by the road.
  for (let i = 0, n = 0; i < 20000 && n < (lite ? 250 : 500); i++) {
    const u = rand()
    const side = rand() < 0.5 ? -1 : 1
    const dist = ROAD_CLEAR + 1 + rand() * rand() * 40
    const { point, normal } = track.at(u)
    const x = point.x + normal.x * side * dist + (rand() - 0.5) * 6
    const z = point.z + normal.z * side * dist + (rand() - 0.5) * 6
    if (clearance(x, z) < 0 || heightAt(x, z) > MAX_HEIGHT) continue
    const r = rand()
    if (r < 0.55) put(pick(BUSHES), x, z, 3 + rand() * 3)
    else if (r < 0.75) put(pick(TREES.small), x, z, 4 + rand() * 3)
    else if (r < 0.92) put(pick(FLOWERS), x, z, 3 + rand() * 2)
    else put(pick(MUSHROOMS), x, z, 2.5 + rand() * 2)
    n++
  }
  // Rocks on slopes and hills, pebbles by the road.
  for (let i = 0, n = 0; i < 20000 && n < 260; i++) {
    const x = (rand() * 2 - 1) * EXTENT
    const z = (rand() * 2 - 1) * EXTENT
    const road = clearance(x, z)
    if (road < 12) continue
    const h = heightAt(x, z)
    if (h > MAX_HEIGHT + 30) continue
    const chance = 0.05 + slopeAt(x, z) * 0.6 + (h > 20 ? 0.2 : 0)
    if (rand() > chance) continue
    put(pick(ROCKS), x, z, 4 + rand() * 9)
    n++
  }
  for (let i = 0, n = 0; i < 6000 && n < 160; i++) {
    const u = rand()
    const side = rand() < 0.5 ? -1 : 1
    const { point, normal } = track.at(u)
    const dist = ROAD_CLEAR + rand() * 20
    const x = point.x + normal.x * side * dist
    const z = point.z + normal.z * side * dist
    if (clearance(x, z) < 0) continue
    put(pick(SMALL_ROCKS), x, z, 2 + rand() * 3)
    n++
  }
  // Grass blades, dense near the shoulder.
  const grass: Placement[] = []
  const GRASS = lite ? 20000 : 70000
  for (let i = 0; i < GRASS * 2 && grass.length < GRASS; i++) {
    const u = rand()
    const side = rand() < 0.5 ? -1 : 1
    const t = rand()
    const dist = ROAD_W / 2 + 1.2 + t * t * 44
    const { point, normal } = track.at(u)
    const x = point.x + normal.x * side * dist + (rand() - 0.5) * 3
    const z = point.z + normal.z * side * dist + (rand() - 0.5) * 3
    if (clearance(x, z) < 0 || heightAt(x, z) > MAX_HEIGHT) continue
    grass.push({
      x,
      z,
      scale: 0.35 + rand() * 0.4 + fbm(x * 0.05, z * 0.05, 2) * 0.3,
      yaw: rand() * Math.PI * 2,
    })
  }
  return { byModel, grass }
}

// ---------------------------------------------------------------------------------- entry

export async function scatterVegetation(
  root: THREE.Group,
  track: Track,
  blocked: Blocked,
  heightAt: (x: number, z: number) => number,
  options: VegetationOptions = {},
): Promise<void> {
  const { byModel, grass } = plan(track, blocked, heightAt, Boolean(options.lite))
  let draws = 0
  let instances = 0
  await Promise.all(
    [...byModel.entries()].map(async ([name, placements]) => {
      const model = await loadModel(name)
      if (!model) return
      const shadow = !name.startsWith('flower') && !name.startsWith('mushroom')
      draws += instance(root, model, placements, heightAt, shadow && !options.lite)
      instances += placements.length
    }),
  )
  if (grass.length) {
    const mesh = new THREE.InstancedMesh(bladeGeometry(), grassMaterial(), grass.length)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const v = new THREE.Vector3()
    const s = new THREE.Vector3()
    const color = new THREE.Color()
    grass.forEach((p, k) => {
      e.set(0, p.yaw, 0)
      q.setFromEuler(e)
      v.set(p.x, heightAt(p.x, p.z), p.z)
      s.set(p.scale * 1.2, p.scale, p.scale * 1.2)
      mesh.setMatrixAt(k, m.compose(v, q, s))
      color.copy(GRASS_COLORS[k % GRASS_COLORS.length] ?? GRASS_COLORS[0] ?? new THREE.Color())
      mesh.setColorAt(k, color)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    root.add(mesh)
    draws++
  }
  console.warn(`vegetation: ${instances} kit instances, ${grass.length} grass blades, ~${draws} draw calls`)
}
