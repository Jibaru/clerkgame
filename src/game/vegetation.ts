import { Tree, TreePreset } from '@dgreenheck/ez-tree'
import * as THREE from 'three'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { assetUrl } from './assets'
import { ROAD_W, type Track } from './track'

/**
 * Realistic vegetation for the landscape around the loop:
 * - trees generated procedurally with ez-tree (bark PBR + leaf cards), ten variants instanced
 * - photoscanned plants and rocks from Poly Haven (decimated, meshopt + WebP) instanced
 * - GPU grass: tens of thousands of swaying blades near the road
 * Everything is deterministic (seeded) and placed on the terrain through `heightAt`.
 */

const REAL_URL = assetUrl('/models/real')

const PLANT_MODELS = {
  fern: 'real/fern_02',
  grassB: 'real/grass_medium_02',
  dandelion: 'real/dandelion_01',
  heliophila: 'real/flower_heliophila',
} as const

const ROCK_MODELS = {
  rock07: 'real/rock_07',
  rock09: 'real/rock_09',
  stone: 'real/stone_01',
  boulder: 'real/boulder_01',
  nama02: 'real/namaqualand_boulder_02',
  nama04: 'real/namaqualand_boulder_04',
  nama06: 'real/namaqualand_boulder_06',
} as const

const OTHER_MODELS = {
  trunk: 'real/dead_tree_trunk',
  fir: 'real/fir_sapling',
} as const

/** Every photoscan the module may load, as `real/<name>` references. */
export const VEGETATION_MODELS: string[] = [
  ...Object.values(PLANT_MODELS),
  ...Object.values(ROCK_MODELS),
  ...Object.values(OTHER_MODELS),
]

/** Sampling area around the track, in metres. */
const EXTENT = 650
const ROAD_CLEAR = ROAD_W / 2 + 3

/** Anything the game builds beside the road (buildings, tunnel, shortcut, stream) says no here. */
export type Blocked = (x: number, z: number) => boolean
const MAX_HEIGHT = 70

// ---------------------------------------------------------------------------------------------
// Utilities

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

/**
 * Coarse grid of "distance to road centreline" so tens of thousands of samples do not each
 * walk the track's 600 points. Cells are 8 m, bilinear read, exact check only near the road.
 */
class RoadDistanceGrid {
  private readonly cell = 8
  private readonly cols: number
  private readonly rows: number
  private readonly minX: number
  private readonly minZ: number
  private readonly data: Float32Array

  constructor(track: Track) {
    this.minX = -EXTENT
    this.minZ = -EXTENT
    this.cols = Math.ceil((EXTENT * 2) / this.cell) + 1
    this.rows = this.cols
    this.data = new Float32Array(this.cols * this.rows)
    const p = new THREE.Vector3()
    for (let r = 0; r < this.rows; r++) {
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
    const r0 = THREE.MathUtils.clamp(Math.floor(fz), 0, this.rows - 2)
    const tx = THREE.MathUtils.clamp(fx - c0, 0, 1)
    const tz = THREE.MathUtils.clamp(fz - r0, 0, 1)
    const d00 = this.data[r0 * this.cols + c0] ?? 0
    const d10 = this.data[r0 * this.cols + c0 + 1] ?? 0
    const d01 = this.data[(r0 + 1) * this.cols + c0] ?? 0
    const d11 = this.data[(r0 + 1) * this.cols + c0 + 1] ?? 0
    return (d00 * (1 - tx) + d10 * tx) * (1 - tz) + (d01 * (1 - tx) + d11 * tx) * tz
  }
}

// ---------------------------------------------------------------------------------------------
// Loading photoscans

const loader = new GLTFLoader()
loader.setMeshoptDecoder(MeshoptDecoder)
const cache = new Map<string, Promise<THREE.Group | null>>()

function loadReal(ref: string, foliage = false): Promise<THREE.Group | null> {
  const key = `${ref}|${foliage ? 'f' : 's'}`
  let p = cache.get(key)
  if (!p) {
    const name = ref.replace(/^real\//, '')
    p = new Promise<THREE.Group | null>((resolve) => {
      loader.load(
        `${REAL_URL}/${name}.glb`,
        (gltf) => {
          gltf.scene.traverse((o) => {
            if (!(o instanceof THREE.Mesh)) return
            const mats = Array.isArray(o.material) ? o.material : [o.material]
            for (const m of mats) {
              if (!(m instanceof THREE.MeshStandardMaterial)) continue
              // Foliage and cut-outs: hard alpha so instances never need sorting. Some scans
              // (grass_bermuda) ship alpha in the texture but an opaque material, so every
              // plant material is cut, not only the ones flagged.
              if (foliage || m.transparent || m.alphaTest > 0 || m.alphaMap) {
                m.alphaTest = 0.5
                m.transparent = false
                m.depthWrite = true
                m.side = THREE.DoubleSide
                // Photoscanned foliage has a dark albedo; lift it with its own texture as a
                // faint emissive so it reads under a low sun (cheap stand-in for translucency).
                m.envMapIntensity = 1.2
                m.emissive.set(0xffffff)
                m.emissiveMap = m.map
                m.emissiveIntensity = 0.8
              } else {
                m.envMapIntensity = 0.8
              }
              m.needsUpdate = true
            }
          })
          resolve(gltf.scene)
        },
        undefined,
        () => {
          console.warn(`vegetation: skipped missing model ${ref}`)
          resolve(null)
        },
      )
    })
    cache.set(key, p)
  }
  return p
}

/** One InstancedMesh per Mesh inside the group, keeping each child's offset and material. */
function instanceGroup(
  root: THREE.Group,
  group: THREE.Group,
  matrices: THREE.Matrix4[],
  castShadow: boolean,
): number {
  group.updateMatrixWorld(true)
  let drawCalls = 0
  const tmp = new THREE.Matrix4()
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const mesh = new THREE.InstancedMesh(child.geometry, child.material, matrices.length)
    const local = child.matrixWorld
    for (let i = 0; i < matrices.length; i++) {
      const m = matrices[i]
      if (!m) continue
      tmp.multiplyMatrices(m, local)
      mesh.setMatrixAt(i, tmp)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.castShadow = castShadow
    // Thin double-sided foliage self-shadows into black under the sun's map, so only solid
    // pieces (the ones that cast) receive shadows.
    mesh.receiveShadow = castShadow
    mesh.frustumCulled = false
    root.add(mesh)
    drawCalls++
  })
  return drawCalls
}

// ---------------------------------------------------------------------------------------------
// Trees (ez-tree)

type TreeKind = 'broadleaf' | 'pine' | 'bush'
type TreeVariant = {
  kind: TreeKind
  branches: THREE.BufferGeometry
  leaves: THREE.BufferGeometry
  bark: THREE.MeshStandardMaterial
  leaf: THREE.MeshStandardMaterial
  /** Scale that turns the tree's own units into the target height in metres. */
  scale: number
}

const TREE_VARIANTS: Array<{
  preset: keyof typeof TreePreset
  kind: TreeKind
  height: number
  seed: number
}> = [
  { preset: 'Oak Medium', kind: 'broadleaf', height: 13, seed: 101 },
  { preset: 'Oak Large', kind: 'broadleaf', height: 16, seed: 202 },
  { preset: 'Ash Medium', kind: 'broadleaf', height: 14, seed: 303 },
  { preset: 'Ash Large', kind: 'broadleaf', height: 17, seed: 404 },
  { preset: 'Aspen Medium', kind: 'broadleaf', height: 11, seed: 505 },
  { preset: 'Aspen Large', kind: 'broadleaf', height: 14, seed: 606 },
  { preset: 'Pine Medium', kind: 'pine', height: 16, seed: 707 },
  { preset: 'Pine Large', kind: 'pine', height: 21, seed: 808 },
  { preset: 'Bush 1', kind: 'bush', height: 2.4, seed: 909 },
  { preset: 'Bush 2', kind: 'bush', height: 2.8, seed: 1010 },
]

const MAX_TREE_TRIS = 9000

const windStart = performance.now()
type WindShader = { uniforms: { uTime: { value: number } } }

/** Local-space sway injected before instancing, so it works for InstancedMesh. */
function attachWind(material: THREE.MeshStandardMaterial, strength: number) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 }
    shader.uniforms.uWind = { value: strength }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec3 wp = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          #else
            vec3 wp = vec3(0.0);
          #endif
          float phase = wp.x * 0.13 + wp.z * 0.17;
          float h = clamp(transformed.y / 12.0, 0.0, 1.0);
          float sway = uWind * h * (0.6 * sin(uTime * 0.9 + phase) + 0.3 * sin(uTime * 2.1 + phase * 1.7) + 0.1 * sin(uTime * 4.3 + phase * 2.3));
          transformed.x += sway;
          transformed.z += sway * 0.5;
        }`,
      )
    material.userData.shader = shader
  }
  material.onBeforeRender = () => {
    const shader = material.userData.shader as WindShader | undefined
    if (shader) shader.uniforms.uTime.value = (performance.now() - windStart) / 1000
  }
}

/** Generates the tree variants once. Adaptive: trims leaves and twigs until a tree fits the budget. */
function buildTreeVariants(): TreeVariant[] {
  const t0 = performance.now()
  const variants: TreeVariant[] = []
  for (const v of TREE_VARIANTS) {
    const tree = new Tree()
    tree.options.copy(TreePreset[v.preset] as typeof tree.options)
    tree.options.seed = v.seed
    let tris = Number.POSITIVE_INFINITY
    for (let attempt = 0; attempt < 4 && tris > MAX_TREE_TRIS; attempt++) {
      if (attempt > 0) {
        tree.options.leaves.count = Math.max(4, Math.floor(tree.options.leaves.count * 0.6))
        tree.options.branch.children[2] = Math.max(1, Math.floor(tree.options.branch.children[2] * 0.7))
      }
      tree.generate()
      const bi = tree.branchesMesh.geometry.index
      const li = tree.leavesMesh.geometry.index
      tris = ((bi ? bi.count : 0) + (li ? li.count : 0)) / 3
    }
    const branches = tree.branchesMesh.geometry
    const leaves = tree.leavesMesh.geometry
    branches.computeBoundingBox()
    leaves.computeBoundingBox()
    const top = Math.max(branches.boundingBox?.max.y ?? 1, leaves.boundingBox?.max.y ?? 1)
    const scale = v.height / Math.max(top, 1)

    const phongBark = tree.branchesMesh.material as THREE.MeshPhongMaterial
    const bark = new THREE.MeshStandardMaterial({
      map: phongBark.map,
      normalMap: phongBark.normalMap,
      roughnessMap: (phongBark as unknown as { roughnessMap?: THREE.Texture }).roughnessMap ?? null,
      aoMap: phongBark.aoMap,
      color: phongBark.color,
      roughness: 0.95,
      metalness: 0,
      envMapIntensity: 0.4,
    })
    const phongLeaf = tree.leavesMesh.material as THREE.MeshPhongMaterial
    const leaf = new THREE.MeshStandardMaterial({
      map: phongLeaf.map,
      color: phongLeaf.color,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.85,
      metalness: 0,
      envMapIntensity: 0.5,
    })
    attachWind(leaf, v.kind === 'bush' ? 0.08 : 0.35)
    phongBark.dispose()
    phongLeaf.dispose()
    variants.push({ kind: v.kind, branches, leaves, bark, leaf, scale })
  }
  console.warn(
    `vegetation: generated ${variants.length} tree variants in ${Math.round(performance.now() - t0)} ms`,
  )
  return variants
}

// ---------------------------------------------------------------------------------------------
// GPU grass

const GRASS_COLORS = [
  new THREE.Color('#4f8f2a'),
  new THREE.Color('#6aa83a'),
  new THREE.Color('#8fbf3f'),
  new THREE.Color('#7aa02e'),
]

/** Two crossed, slightly bent quads with 3 segments; uv.y runs root → tip. 1 m tall at scale 1. */
function bladeGeometry(): THREE.BufferGeometry {
  const w = 0.1
  const segs = 3
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (const rot of [0, Math.PI / 2]) {
    const base = positions.length / 3
    for (let s = 0; s <= segs; s++) {
      const t = s / segs
      const bend = 0.12 * t * t
      const half = (w / 2) * (1 - t * 0.85)
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
    envMapIntensity: 0.4,
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
        `#include <color_fragment>
        diffuseColor.rgb *= mix(0.55, 1.15, vTip);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.1, 1.05, 0.7), vTip * 0.35);`,
      )
    m.userData.shader = shader
  }
  m.onBeforeRender = () => {
    const shader = m.userData.shader as WindShader | undefined
    if (shader) shader.uniforms.uTime.value = (performance.now() - windStart) / 1000
  }
  return m
}

// ---------------------------------------------------------------------------------------------
// Planning

type Placement = { x: number; z: number; scale: number; yaw: number; tilt: number }

type Plan = {
  trees: Placement[][]
  plants: Map<string, Placement[]>
  rocks: Map<string, Placement[]>
  firs: Placement[]
  trunks: Placement[]
  grass: Placement[]
}

function planVegetation(
  track: Track,
  blocked: Blocked,
  heightAt: (x: number, z: number) => number,
  variants: TreeVariant[],
): Plan {
  const rand = mulberry32(2026)
  const grid = new RoadDistanceGrid(track)
  const probe = new THREE.Vector3()

  /** Distance to the road, or -1 when the spot is unusable. */
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
  const slopeAt = (x: number, z: number): number => {
    const dx = heightAt(x + 1.5, z) - heightAt(x - 1.5, z)
    const dz = heightAt(x, z + 1.5) - heightAt(x, z - 1.5)
    return Math.hypot(dx, dz) / 3
  }
  // The forest section of the lap: trees come right up to the shoulder between these ratios.
  const inForest = (x: number, z: number) => {
    probe.set(x, 0, z)
    const u = track.nearest(probe).u
    return u > 0.6 && u < 0.84
  }
  const put = (list: Placement[], x: number, z: number, scale: number, tilt = 0) =>
    list.push({ x, z, scale, yaw: rand() * Math.PI * 2, tilt: (rand() - 0.5) * tilt })

  const broadleaf = variants.map((v, i) => (v.kind === 'broadleaf' ? i : -1)).filter((i) => i >= 0)
  const pines = variants.map((v, i) => (v.kind === 'pine' ? i : -1)).filter((i) => i >= 0)
  const bushes = variants.map((v, i) => (v.kind === 'bush' ? i : -1)).filter((i) => i >= 0)
  const trees: Placement[][] = variants.map(() => [])
  const plants = new Map<string, Placement[]>()
  const rocks = new Map<string, Placement[]>()
  for (const key of Object.values(PLANT_MODELS)) plants.set(key, [])
  for (const key of Object.values(ROCK_MODELS)) rocks.set(key, [])
  const firs: Placement[] = []
  const trunks: Placement[] = []
  const grass: Placement[] = []
  const pickIndex = (list: number[]) => list[Math.min(list.length - 1, Math.floor(rand() * list.length))] ?? 0
  const treeList = (index: number) => trees[index] ?? []
  const listOf = (map: Map<string, Placement[]>, key: string) => map.get(key) ?? []

  // --- Trees: uniform samples with zone rules. ----------------------------------------------
  const TREE_BUDGET = 1300
  let treeCount = 0
  for (let i = 0; i < 40000 && treeCount < TREE_BUDGET; i++) {
    const x = (rand() * 2 - 1) * EXTENT
    const z = (rand() * 2 - 1) * EXTENT
    const road = clearance(x, z)
    if (road < 11) continue
    const h = heightAt(x, z)
    if (h > MAX_HEIGHT) continue
    const slope = slopeAt(x, z)
    if (slope > 0.9) continue
    const r = rand()
    if (road < 40 && !inForest(x, z)) continue
    if (road < 80) {
      // Groves beside the road: dense, mixed with bushes; the forest section is a wall of trees.
      if (r < (inForest(x, z) ? 0.7 : 0.32)) {
        put(treeList(pickIndex(h > 25 ? pines : broadleaf)), x, z, 0.85 + rand() * 0.4)
        treeCount++
      } else if (r < 0.4) put(treeList(pickIndex(bushes)), x, z, 0.8 + rand() * 0.6)
      continue
    }
    if (road < 260) {
      // Forest, thinning out with distance.
      const density = 0.3 * (1 - (road - 80) / 180) + 0.08
      if (r < density) {
        put(treeList(pickIndex(h > 25 || rand() < 0.2 ? pines : broadleaf)), x, z, 0.9 + rand() * 0.5)
        treeCount++
      }
      continue
    }
    if (r < 0.03) {
      put(treeList(pickIndex(h > 20 ? pines : broadleaf)), x, z, 1 + rand() * 0.5)
      treeCount++
    }
  }

  // --- Rocks and stones on slopes and hills. --------------------------------------------------
  const rockKeys = Object.values(ROCK_MODELS) as string[]
  for (let i = 0, n = 0; i < 20000 && n < 300; i++) {
    const x = (rand() * 2 - 1) * EXTENT
    const z = (rand() * 2 - 1) * EXTENT
    const road = clearance(x, z)
    if (road < 12) continue
    const h = heightAt(x, z)
    if (h > MAX_HEIGHT + 20) continue
    const slope = slopeAt(x, z)
    const chance = 0.05 + slope * 0.6 + (h > 20 ? 0.2 : 0)
    if (rand() > chance) continue
    const key = rockKeys[Math.floor(rand() * rockKeys.length)] ?? ROCK_MODELS.rock07
    const big = key === ROCK_MODELS.boulder || key.startsWith('real/namaqualand')
    put(listOf(rocks, key), x, z, big ? 2 + rand() * 3 : 4 + rand() * 14, 0.4)
    n++
  }

  // --- Young firs and dead trunks in the belt. ------------------------------------------------
  for (let i = 0, n = 0; i < 6000 && n < 60; i++) {
    const x = (rand() * 2 - 1) * EXTENT
    const z = (rand() * 2 - 1) * EXTENT
    const road = clearance(x, z)
    if (road < 14 || road > 120 || heightAt(x, z) > MAX_HEIGHT) continue
    put(firs, x, z, 3 + rand() * 3)
    n++
  }
  for (let i = 0, n = 0; i < 3000 && n < 10; i++) {
    const x = (rand() * 2 - 1) * EXTENT
    const z = (rand() * 2 - 1) * EXTENT
    const road = clearance(x, z)
    if (road < 16 || road > 100) continue
    put(trunks, x, z, 1.4 + rand() * 0.6, 0.1)
    n++
  }

  // --- Plant clumps in the belt, sampled along the road so they follow it. -------------------
  for (let i = 0, n = 0; i < 12000 && n < 1500; i++) {
    const u = rand()
    const side = rand() < 0.5 ? -1 : 1
    const dist = ROAD_CLEAR + 1 + rand() * rand() * 44
    const { point, normal } = track.at(u)
    const x = point.x + normal.x * side * dist + (rand() - 0.5) * 6
    const z = point.z + normal.z * side * dist + (rand() - 0.5) * 6
    if (clearance(x, z) < 0 || heightAt(x, z) > MAX_HEIGHT) continue
    const r = rand()
    let key: string = PLANT_MODELS.heliophila
    let scale = 0.8 + rand() * 0.4
    // Bermuda, nettle and the dark grass clump read as black shards from the chase camera,
    // so the belt mixes ferns, light grass clumps, dandelions and wildflowers only.
    if (r < 0.36) {
      key = PLANT_MODELS.fern
      scale = 1 + rand() * 0.6
    } else if (r < 0.62) {
      key = PLANT_MODELS.grassB
      scale = 3 + rand() * 2
    } else if (r < 0.8) {
      key = PLANT_MODELS.dandelion
      scale = 2 + rand() * 1.5
    }
    put(listOf(plants, key), x, z, scale)
    n++
  }

  // --- GPU grass: dense within 12 m of the shoulder, thinning out to 45 m. --------------------
  const GRASS_BUDGET = 90000
  for (let i = 0, n = 0; i < GRASS_BUDGET * 2 && n < GRASS_BUDGET; i++) {
    const u = rand()
    const side = rand() < 0.5 ? -1 : 1
    const t = rand()
    const dist = ROAD_W / 2 + 1.2 + t * t * 44
    const { point, normal } = track.at(u)
    const x = point.x + normal.x * side * dist + (rand() - 0.5) * 3
    const z = point.z + normal.z * side * dist + (rand() - 0.5) * 3
    if (clearance(x, z) < 0 || heightAt(x, z) > MAX_HEIGHT) continue
    grass.push({ x, z, scale: 0.25 + rand() * 0.35, yaw: rand() * Math.PI * 2, tilt: 0 })
    n++
  }

  return { trees, plants, rocks, firs, trunks, grass }
}

// ---------------------------------------------------------------------------------------------
// Entry point

export type VegetationOptions = {
  /** Phones: fewer grass blades and no photoscan clutter. */
  lite?: boolean
}

export async function scatterVegetation(
  root: THREE.Group,
  track: Track,
  blocked: Blocked,
  heightAt: (x: number, z: number) => number,
  options: VegetationOptions = {},
): Promise<void> {
  const variants = buildTreeVariants()
  const plan = planVegetation(track, blocked, heightAt, variants)
  if (options.lite) plan.grass.length = Math.min(plan.grass.length, 20000)

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const v = new THREE.Vector3()
  const s = new THREE.Vector3()
  const compose = (p: Placement, extraScale: number, sy = 1) => {
    e.set(p.tilt, p.yaw, p.tilt * 0.6)
    q.setFromEuler(e)
    v.set(p.x, heightAt(p.x, p.z), p.z)
    const k = p.scale * extraScale
    s.set(k, k * sy, k)
    m.compose(v, q, s)
    return m
  }
  const matricesFor = (list: Placement[], extraScale = 1) => list.map((p) => compose(p, extraScale).clone())

  let drawCalls = 0
  let treeInstances = 0

  // Trees: one InstancedMesh for branches and one for leaves per variant.
  variants.forEach((variant, i) => {
    const placements = plan.trees[i] ?? []
    if (!placements.length) return
    const matrices = matricesFor(placements, variant.scale)
    const parts: Array<[THREE.BufferGeometry, THREE.MeshStandardMaterial]> = [
      [variant.branches, variant.bark],
      [variant.leaves, variant.leaf],
    ]
    for (const [geometry, material] of parts) {
      const mesh = new THREE.InstancedMesh(geometry, material, matrices.length)
      matrices.forEach((mat, k) => {
        mesh.setMatrixAt(k, mat)
      })
      mesh.instanceMatrix.needsUpdate = true
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.frustumCulled = false
      root.add(mesh)
      drawCalls++
    }
    treeInstances += placements.length
  })

  // Grass blades.
  if (plan.grass.length) {
    const grassMesh = new THREE.InstancedMesh(bladeGeometry(), grassMaterial(), plan.grass.length)
    const color = new THREE.Color()
    const fallback = GRASS_COLORS[0] ?? new THREE.Color('#6aa83a')
    plan.grass.forEach((p, k) => {
      // Blades are 1 m tall at scale 1; keep them a little wider than tall.
      grassMesh.setMatrixAt(k, compose(p, 1.1, 1 / 1.1))
      color.copy(GRASS_COLORS[k % GRASS_COLORS.length] ?? fallback)
      color.offsetHSL(Math.sin(k * 12.9898) * 0.01, 0, Math.sin(k * 78.233) * 0.04)
      grassMesh.setColorAt(k, color)
    })
    grassMesh.instanceMatrix.needsUpdate = true
    if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true
    grassMesh.castShadow = false
    grassMesh.receiveShadow = true
    grassMesh.frustumCulled = false
    root.add(grassMesh)
    drawCalls++
  }

  // Photoscans: plants, rocks, young firs, dead trunks.
  const jobs: Array<{ ref: string; placements: Placement[]; shadow: boolean; foliage?: boolean }> = []
  for (const [ref, placements] of plan.plants) jobs.push({ ref, placements, shadow: false, foliage: true })
  for (const [ref, placements] of plan.rocks) jobs.push({ ref, placements, shadow: true })
  jobs.push({ ref: OTHER_MODELS.fir, placements: plan.firs, shadow: true })
  jobs.push({ ref: OTHER_MODELS.trunk, placements: plan.trunks, shadow: true })
  let scanInstances = 0
  await Promise.all(
    jobs.map(async (job) => {
      if (!job.placements.length) return
      const group = await loadReal(job.ref, job.foliage)
      if (!group) return
      drawCalls += instanceGroup(root, group, matricesFor(job.placements), job.shadow)
      scanInstances += job.placements.length
    }),
  )

  console.warn(
    `vegetation: ${treeInstances} trees, ${plan.grass.length} grass blades, ${scanInstances} photoscan instances, ~${drawCalls} draw calls`,
  )
}
