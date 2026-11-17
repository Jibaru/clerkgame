import * as THREE from 'three'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { loadTiling, TEXTURES_URL } from './materials'
import type { Track } from './track'

/**
 * The landscape around the road: a photographic HDRI sky that also lights the scene, and a
 * displaced terrain with a flat road corridor, rolling foothills and low mountains that meet
 * the Alps painted in the HDRI. The terrain is shaded with three tiling PBR sets (grass, dirt,
 * rock) blended by slope, height, a macro noise mask and wear along the road.
 */
export type Environment = {
  /** Height of the terrain at world x,z. Flat (0, or the carve) anywhere within FLAT_RADIUS of the road centreline. */
  heightAt: (x: number, z: number) => number
  /** The terrain mesh (for raycasting taps). */
  terrain: THREE.Mesh
  /** Unit vector pointing toward the sun as seen in the HDRI, so the shadow light can be aligned. */
  sunDirection: THREE.Vector3
  update: (dt: number, cameraPosition: THREE.Vector3) => void
  dispose: () => void
  /** Resolves when the HDRI and textures are loaded. */
  ready: Promise<void>
}

export const FLAT_RADIUS = 72

const BLEND_WIDTH = 40
const TERRAIN_SIZE = 1600
const TERRAIN_SEGMENTS = 220
const MOUNTAIN_START = 260
const FOG_NEAR = 250
const FOG_FAR = 900
const HDRI_URL = `${TEXTURES_URL}/alps_field/alps_field_1k.hdr`

/** Road-distance grid cell size in metres. Shared by the height field and the shader. */
const ROAD_CELL = 8

// --------------------------------------------------------------------------- noise

/** Deterministic hash → [0, 1). */
function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

/** Value noise in [0, 1] with smooth interpolation. */
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

/** Fractal value noise in [0, 1]. */
function fbm(x: number, y: number, octaves: number, lacunarity = 2, gain = 0.5): number {
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

type HeightField = {
  at: (x: number, z: number) => number
  roadDistance: (x: number, z: number) => number
  centre: THREE.Vector2
  /** The road-distance grid, for the shader. */
  grid: { data: Float32Array; n: number; min: THREE.Vector2; size: number }
}

/**
 * Builds the height function. The distance to the road is sampled once on a coarse grid
 * (Track.nearest loops 600 samples, so it is not something to call per vertex, let alone
 * per frame) and bilinearly interpolated afterwards.
 */
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

    // Rolling foothills: 4–16 m, low frequency with a touch of detail.
    const hillNoise = fbm(x * 0.006 + 13.7, z * 0.006 + 71.3, 4)
    const hills = 4 + 12 * hillNoise

    // Low mountains that start ~260 m out and hand over to the Alps in the HDRI.
    const ring = smoothstep(MOUNTAIN_START, MOUNTAIN_START + 260, d)
    const ridge = 1 - Math.abs(2 * fbm(x * 0.0028 + 3.1, z * 0.0028 + 9.4, 5, 2.1, 0.55) - 1)
    const peaks = fbm(x * 0.0045 + 101, z * 0.0045 + 47, 3)
    const mountain = ring * (30 + 40 * (0.55 * ridge + 0.45 * peaks))

    return rise * (hills + mountain)
  }

  return { at, roadDistance, centre, grid: { data: dist, n, min, size: (n - 1) * ROAD_CELL } }
}

// --------------------------------------------------------------------------- terrain

type SplatSet = { color: THREE.Texture; normal: THREE.Texture; rough: THREE.Texture }

function loadSet(folder: string, prefix: string): SplatSet {
  return {
    color: loadTiling(`${TEXTURES_URL}/${folder}/${prefix}_Color.jpg`, true),
    normal: loadTiling(`${TEXTURES_URL}/${folder}/${prefix}_NormalGL.jpg`, false),
    rough: loadTiling(`${TEXTURES_URL}/${folder}/${prefix}_Roughness.jpg`, false),
  }
}

/**
 * MeshStandardMaterial with the texture sampling replaced: three PBR sets tiled in world
 * space, blended by per-vertex weights (rock, dirt) and a road-distance texture (wear).
 */
function buildTerrainMaterial(field: HeightField): {
  material: THREE.MeshStandardMaterial
  textures: THREE.Texture[]
} {
  const grass = loadSet('Grass005', 'Grass005_1K-JPG')
  const dirt = loadSet('Ground037', 'Ground037_1K-JPG')
  const rock = loadSet('Rock051', 'Rock051_1K-JPG')

  const g = field.grid
  // Distance in whole metres, clamped to 255, in an 8-bit texture: float textures are not
  // filterable on every GPU and the wear strip only needs metre precision.
  const bytes = new Uint8Array(g.n * g.n * 4)
  for (let i = 0; i < g.n * g.n; i++) {
    const d = Math.min(255, Math.round(g.data[i] ?? 255))
    bytes[i * 4] = d
    bytes[i * 4 + 1] = d
    bytes[i * 4 + 2] = d
    bytes[i * 4 + 3] = 255
  }
  const roadTex = new THREE.DataTexture(bytes, g.n, g.n, THREE.RGBAFormat, THREE.UnsignedByteType)
  roadTex.minFilter = THREE.LinearFilter
  roadTex.magFilter = THREE.LinearFilter
  roadTex.wrapS = THREE.ClampToEdgeWrapping
  roadTex.wrapT = THREE.ClampToEdgeWrapping
  roadTex.needsUpdate = true

  // A real map keeps USE_MAP/USE_NORMALMAP/USE_ROUGHNESSMAP defined so the standard pipeline
  // compiles the branches we then replace.
  const material = new THREE.MeshStandardMaterial({
    map: grass.color,
    normalMap: grass.normal,
    roughnessMap: grass.rough,
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0.6,
    vertexColors: true,
  })

  const uniforms = {
    uGrassColor: { value: grass.color },
    uGrassNormal: { value: grass.normal },
    uGrassRough: { value: grass.rough },
    uDirtColor: { value: dirt.color },
    uDirtNormal: { value: dirt.normal },
    uDirtRough: { value: dirt.rough },
    uRockColor: { value: rock.color },
    uRockNormal: { value: rock.normal },
    uRockRough: { value: rock.rough },
    uRoadDist: { value: roadTex },
    uRoadMin: { value: g.min.clone() },
    uRoadSize: { value: g.size },
    uShoulder: { value: 6.2 }, // ROAD_W / 2 + shoulder (1.2); wear starts here
    uWear: { value: 2.5 },
  }

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        attribute vec3 splat;
        varying vec3 vSplat;
        varying vec3 vWorldPos;`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        vSplat = splat;
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform sampler2D uGrassColor; uniform sampler2D uGrassNormal; uniform sampler2D uGrassRough;
        uniform sampler2D uDirtColor;  uniform sampler2D uDirtNormal;  uniform sampler2D uDirtRough;
        uniform sampler2D uRockColor;  uniform sampler2D uRockNormal;  uniform sampler2D uRockRough;
        uniform sampler2D uRoadDist;
        uniform vec2 uRoadMin;
        uniform float uRoadSize;
        uniform float uShoulder;
        uniform float uWear;
        varying vec3 vSplat;
        varying vec3 vWorldPos;
        // Sample a tiling set at two scales to hide the repeat.
        vec4 tile2(sampler2D t, vec2 p, float s) {
          vec4 a = texture2D(t, p / s);
          vec4 b = texture2D(t, p / (s * 3.7) + vec2(0.31, 0.57));
          return mix(a, b, 0.4);
        }
        float roadDistance(vec2 p) {
          vec2 uv = (p - uRoadMin) / uRoadSize;
          return texture2D(uRoadDist, clamp(uv, 0.0, 1.0)).r * 255.0;
        }
        struct Splat { float grass; float dirt; float rock; };
        Splat splatWeights() {
          float wear = 1.0 - smoothstep(uShoulder, uShoulder + uWear, roadDistance(vWorldPos.xz));
          float rock = clamp(vSplat.x, 0.0, 1.0);
          float dirt = clamp(max(vSplat.y, wear) * (1.0 - rock), 0.0, 1.0);
          float grass = clamp(1.0 - rock - dirt, 0.0, 1.0);
          float sum = grass + dirt + rock;
          Splat s; s.grass = grass / sum; s.dirt = dirt / sum; s.rock = rock / sum;
          return s;
        }`,
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        Splat sw = splatWeights();
        vec2 wp = vWorldPos.xz;
        vec4 cGrass = tile2(uGrassColor, wp, 6.0);
        vec4 cDirt = tile2(uDirtColor, wp, 5.0);
        vec4 cRock = tile2(uRockColor, wp, 9.0);
        vec4 sampledDiffuseColor = cGrass * sw.grass + cDirt * sw.dirt + cRock * sw.rock;
        diffuseColor *= sampledDiffuseColor;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
        float roughnessFactor = roughness;
        {
          Splat sr = splatWeights();
          vec2 wr = vWorldPos.xz;
          float r = tile2(uGrassRough, wr, 6.0).g * sr.grass + tile2(uDirtRough, wr, 5.0).g * sr.dirt + tile2(uRockRough, wr, 9.0).g * sr.rock;
          roughnessFactor *= mix(0.85, 1.0, r);
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
        {
          Splat sn = splatWeights();
          vec2 wn = vWorldPos.xz;
          vec3 mapN = (tile2(uGrassNormal, wn, 6.0).xyz * sn.grass + tile2(uDirtNormal, wn, 5.0).xyz * sn.dirt + tile2(uRockNormal, wn, 9.0).xyz * sn.rock) * 2.0 - 1.0;
          mapN.xy *= 0.9;
          // World-space UVs run along +X and +Z, so build the tangent frame from those axes.
          vec3 T = normalize(mat3(viewMatrix) * vec3(1.0, 0.0, 0.0));
          vec3 B = normalize(mat3(viewMatrix) * vec3(0.0, 0.0, 1.0));
          T = normalize(T - normal * dot(normal, T));
          B = normalize(B - normal * dot(normal, B));
          normal = normalize(mat3(T, B, normal) * mapN);
        }`,
      )
  }
  // Different define per shader program so three does not reuse a cached variant.
  material.customProgramCacheKey = () => 'terrain-splat-v1'

  return {
    material,
    textures: [
      grass.color,
      grass.normal,
      grass.rough,
      dirt.color,
      dirt.normal,
      dirt.rough,
      rock.color,
      rock.normal,
      rock.rough,
      roadTex,
    ],
  }
}

function buildTerrain(field: HeightField): { mesh: THREE.Mesh; textures: THREE.Texture[] } {
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const count = pos.count

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i) + field.centre.x
    const z = pos.getZ(i) + field.centre.y
    pos.setXYZ(i, x, field.at(x, z), z)
  }
  geo.computeVertexNormals()
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute

  // splat = (rock, dirt, unused); color = subtle tint variation multiplied into the albedo.
  const splat = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const tint = new THREE.Color()
  for (let i = 0; i < count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const h = pos.getY(i)
    const slope = 1 - nrm.getY(i) // 0 flat … 1 vertical

    const rock = Math.max(smoothstep(0.18, 0.42, slope), smoothstep(42, 70, h))
    const dryMask = smoothstep(0.55, 0.78, fbm(x * 0.008 + 91, z * 0.008 + 17, 3))
    const dirt = dryMask * (1 - rock) * 0.85
    splat[i * 3] = rock
    splat[i * 3 + 1] = dirt
    splat[i * 3 + 2] = 0

    const variation = fbm(x * 0.02 + 7, z * 0.02 + 3, 3)
    const hue = (fbm(x * 0.004 + 31, z * 0.004 + 5, 2) - 0.5) * 0.06
    tint.setHSL(0.26 + hue, 0.05, 0.5 + (variation - 0.5) * 0.14)
    // Normalise around 1 so the texture colours stay honest.
    colors[i * 3] = tint.r * 2
    colors[i * 3 + 1] = tint.g * 2
    colors[i * 3 + 2] = tint.b * 2
  }
  geo.setAttribute('splat', new THREE.BufferAttribute(splat, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeBoundingSphere()

  const { material, textures } = buildTerrainMaterial(field)
  const mesh = new THREE.Mesh(geo, material)
  mesh.name = 'terrain'
  mesh.receiveShadow = true
  // Sits just under the road's y=0 so the flat corridor never z-fights with the ribbons.
  mesh.position.y = -0.05
  return { mesh, textures }
}

// --------------------------------------------------------------------------- sky

type SkyResult = {
  background: THREE.Texture
  envMap: THREE.Texture
  sunDirection: THREE.Vector3
  horizon: THREE.Color
}

/** Decode one HDR texel (RGBA, half or float) into linear RGB. */
function texel(data: Uint16Array | Float32Array, index: number, out: THREE.Vector3): THREE.Vector3 {
  const half = data instanceof Uint16Array
  const r = data[index] ?? 0
  const g = data[index + 1] ?? 0
  const b = data[index + 2] ?? 0
  if (half) {
    return out.set(
      THREE.DataUtils.fromHalfFloat(r),
      THREE.DataUtils.fromHalfFloat(g),
      THREE.DataUtils.fromHalfFloat(b),
    )
  }
  return out.set(r, g, b)
}

/**
 * Finds the sun (brightest texel) and the average horizon colour in an equirect HDR.
 * HDR files store the top scanline first and HDRLoader sets flipY so it lands at v = 1, so with
 * flipY row 0 is the top of the image; without it, row 0 is the bottom.
 */
function analyseHdr(tex: THREE.DataTexture): { sun: THREE.Vector3; horizon: THREE.Color } {
  const image = tex.image as { data: Uint16Array | Float32Array; width: number; height: number }
  const { data, width, height } = image
  const px = new THREE.Vector3()
  let best = -1
  let bestI = 0
  let bestJ = 0
  const stride = 4
  // Coarse scan: every 2nd texel is plenty for a 1k map.
  for (let j = 0; j < height; j += 2) {
    for (let i = 0; i < width; i += 2) {
      texel(data, (j * width + i) * stride, px)
      const lum = px.x * 0.2126 + px.y * 0.7152 + px.z * 0.0722
      if (lum > best) {
        best = lum
        bestI = i
        bestJ = j
      }
    }
  }
  const u = (bestI + 0.5) / width
  const rowFromBottom = tex.flipY ? height - 1 - bestJ : bestJ
  const v = (rowFromBottom + 0.5) / height
  // Inverse of three's equirectUv: u = atan(z, x) / 2π + 0.5, v = asin(y) / π + 0.5.
  const theta = (u - 0.5) * Math.PI * 2
  const phi = (v - 0.5) * Math.PI
  const sun = new THREE.Vector3(
    Math.cos(theta) * Math.cos(phi),
    Math.sin(phi),
    Math.sin(theta) * Math.cos(phi),
  ).normalize()

  // Horizon band: a row just above the horizon, averaged across all longitudes.
  const horizonRowFromBottom = Math.round(height * 0.515)
  const j = tex.flipY ? height - 1 - horizonRowFromBottom : horizonRowFromBottom
  const acc = new THREE.Vector3()
  let n = 0
  for (let i = 0; i < width; i += 4) {
    texel(data, (j * width + i) * stride, px)
    acc.add(px)
    n++
  }
  acc.divideScalar(Math.max(1, n))
  // Clamp so a bright sky band does not wash the fog out.
  const horizon = new THREE.Color(Math.min(acc.x, 1.2), Math.min(acc.y, 1.2), Math.min(acc.z, 1.2))
  return { sun, horizon }
}

function loadSky(renderer: THREE.WebGLRenderer): Promise<SkyResult> {
  return new Promise((resolve, reject) => {
    const loader = new HDRLoader()
    loader.setDataType(THREE.HalfFloatType)
    loader.load(
      HDRI_URL,
      (tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping
        const { sun, horizon } = analyseHdr(tex)
        const pmrem = new THREE.PMREMGenerator(renderer)
        pmrem.compileEquirectangularShader()
        const envMap = pmrem.fromEquirectangular(tex).texture
        pmrem.dispose()
        resolve({ background: tex, envMap, sunDirection: sun, horizon })
      },
      undefined,
      (err) => reject(err instanceof Error ? err : new Error('failed to load the sky HDRI')),
    )
  })
}

// --------------------------------------------------------------------------- environment

/** Height correction inside the flat corridor (negative digs the stream bed). */
export type Carve = (x: number, z: number) => number

export function buildEnvironment(
  scene: THREE.Scene,
  track: Track,
  renderer: THREE.WebGLRenderer,
  carve: Carve = () => 0,
  /** The HDRI download starts once this resolves, so it never competes with the van. */
  skyAfter: Promise<unknown> = Promise.resolve(),
): Environment {
  const field = buildHeightField(track, carve)
  const { mesh: terrain, textures } = buildTerrain(field)
  scene.add(terrain)

  const previous = { background: scene.background, environment: scene.environment, fog: scene.fog }
  // A plausible placeholder until the HDRI arrives: pale sky, fog to match.
  const placeholder = new THREE.Color('#dfe9f3')
  scene.background = placeholder
  scene.fog = new THREE.Fog(placeholder, FOG_NEAR, FOG_FAR)

  // Default: a late-morning sun from the south-east, replaced by the HDRI's real sun.
  const sunDirection = new THREE.Vector3(0.45, 0.62, 0.64).normalize()
  let sky: SkyResult | null = null
  let disposed = false

  const ready = skyAfter
    .then(() => loadSky(renderer))
    .then((result) => {
      if (disposed) {
        result.background.dispose()
        result.envMap.dispose()
        return
      }
      sky = result
      scene.background = result.background
      scene.environment = result.envMap
      scene.backgroundIntensity = 1.0
      scene.environmentIntensity = 0.9
      scene.backgroundBlurriness = 0
      scene.fog = new THREE.Fog(result.horizon, FOG_NEAR, FOG_FAR)
      sunDirection.copy(result.sunDirection)
    })
    .catch((err) => {
      console.error('sky failed, keeping the flat colour', err)
    })

  return {
    heightAt: field.at,
    terrain,
    sunDirection,
    ready,
    update: () => {
      // The HDRI sky needs no per-frame work; kept for API symmetry.
    },
    dispose: () => {
      disposed = true
      scene.remove(terrain)
      terrain.geometry.dispose()
      ;(terrain.material as THREE.Material).dispose()
      for (const t of textures) t.dispose()
      if (sky) {
        sky.background.dispose()
        sky.envMap.dispose()
      }
      scene.background = previous.background
      scene.environment = previous.environment
      scene.fog = previous.fog
    },
  }
}
