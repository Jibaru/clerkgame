import * as THREE from 'three'

/**
 * PBR materials for the road surfaces. Textures: Poly Haven asphalt_02 and ambientCG Gravel023,
 * both CC0, downscaled to 512 px (see public/models/CREDITS.md). The road ribbon from
 * Track.buildRibbon has u ∈ [0, 1] across its width and v in metres along its length, so the
 * repeats below are "tiles per width" × "tiles per metre".
 */

export const TEXTURES_URL = '/textures'

const loader = new THREE.TextureLoader()

/** Load a tiling texture; colour maps are sRGB, data maps (normal, roughness, arm) stay linear. */
export function loadTiling(url: string, srgb: boolean, repeatX = 1, repeatY = 1): THREE.Texture {
  const tex = loader.load(url)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  tex.repeat.set(repeatX, repeatY)
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export type RoadMaterials = {
  asphalt: THREE.MeshStandardMaterial
  markings: THREE.MeshBasicMaterial
  shoulder: THREE.MeshStandardMaterial
  gravel: THREE.MeshStandardMaterial
}

/** Road width the markings canvas is drawn for, in metres. Must match track.ROAD_W. */
const ROAD_WIDTH = 10
/** Dash period: 3 m painted, 6 m gap. */
const DASH_PERIOD = 9

export function createRoadMaterials(): RoadMaterials {
  // Asphalt: one square tile per 10 m of width, so 1/10 of a tile per metre of length.
  const asphaltRepeat: [number, number] = [1, 1 / ROAD_WIDTH]
  const diff = loadTiling(`${TEXTURES_URL}/asphalt_02/asphalt_02_diff_1k.jpg`, true, ...asphaltRepeat)
  const nor = loadTiling(`${TEXTURES_URL}/asphalt_02/asphalt_02_nor_gl_1k.jpg`, false, ...asphaltRepeat)
  const arm = loadTiling(`${TEXTURES_URL}/asphalt_02/asphalt_02_arm_1k.jpg`, false, ...asphaltRepeat)
  // aoMap reads uv channel 1 by default; the ribbon only has channel 0.
  arm.channel = 0
  const asphalt = new THREE.MeshStandardMaterial({
    map: diff,
    normalMap: nor,
    normalScale: new THREE.Vector2(0.8, 0.8),
    aoMap: arm,
    aoMapIntensity: 0.8,
    roughnessMap: arm,
    metalnessMap: arm,
    roughness: 1,
    metalness: 1,
    color: new THREE.Color(0x8c8c8c),
    envMapIntensity: 0.35,
  })

  const markings = new THREE.MeshBasicMaterial({
    map: makeMarkingsTexture(),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    toneMapped: true,
  })

  // Gravel shoulder: the ribbon is ROAD_W + 2.4 m wide, tile every ~3 m.
  const shoulderW = ROAD_WIDTH + 2.4
  const shoulderRepeat: [number, number] = [shoulderW / 3, 1 / 3]
  const shoulder = new THREE.MeshStandardMaterial({
    map: loadTiling(`${TEXTURES_URL}/Gravel023/Gravel023_1K-JPG_Color.jpg`, true, ...shoulderRepeat),
    normalMap: loadTiling(
      `${TEXTURES_URL}/Gravel023/Gravel023_1K-JPG_NormalGL.jpg`,
      false,
      ...shoulderRepeat,
    ),
    normalScale: new THREE.Vector2(0.7, 0.7),
    roughnessMap: loadTiling(
      `${TEXTURES_URL}/Gravel023/Gravel023_1K-JPG_Roughness.jpg`,
      false,
      ...shoulderRepeat,
    ),
    roughness: 1,
    metalness: 0,
    color: new THREE.Color(0xb9b2a6),
    envMapIntensity: 0.4,
  })

  // The shortcut ribbon is SHORTCUT_W (6 m) wide with v in metres: tile every 3 m.
  const gravelRepeat: [number, number] = [2, 1 / 3]
  const gravel = new THREE.MeshStandardMaterial({
    map: loadTiling(`${TEXTURES_URL}/Gravel023/Gravel023_1K-JPG_Color.jpg`, true, ...gravelRepeat),
    normalMap: loadTiling(`${TEXTURES_URL}/Gravel023/Gravel023_1K-JPG_NormalGL.jpg`, false, ...gravelRepeat),
    normalScale: new THREE.Vector2(0.7, 0.7),
    roughnessMap: loadTiling(
      `${TEXTURES_URL}/Gravel023/Gravel023_1K-JPG_Roughness.jpg`,
      false,
      ...gravelRepeat,
    ),
    roughness: 1,
    metalness: 0,
    color: new THREE.Color(0xcfc8bc),
    envMapIntensity: 0.4,
  })

  return { asphalt, markings, shoulder, gravel }
}

/**
 * Painted lines on a transparent tile covering ROAD_WIDTH m across × DASH_PERIOD m along:
 * two white edge lines and a dashed centre line, with worn patches so they look painted.
 */
function makeMarkingsTexture(): THREE.CanvasTexture {
  const w = 512
  const h = Math.round((w * DASH_PERIOD) / ROAD_WIDTH)
  const pxPerM = w / ROAD_WIDTH
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  ctx.clearRect(0, 0, w, h)

  const lineW = Math.max(3, Math.round(0.12 * pxPerM))
  const inset = Math.round(0.35 * pxPerM)
  ctx.fillStyle = 'rgba(236,236,230,0.92)'
  ctx.fillRect(inset, 0, lineW, h)
  ctx.fillRect(w - inset - lineW, 0, lineW, h)

  // Centre dash: 3 m painted then 6 m gap, slightly warm.
  ctx.fillStyle = 'rgba(240,228,176,0.95)'
  const dashW = Math.max(3, Math.round(0.14 * pxPerM))
  ctx.fillRect(Math.round(w / 2 - dashW / 2), Math.round(0.2 * pxPerM), dashW, Math.round(3 * pxPerM))

  // Wear: knock out random specks so the paint is not perfectly solid.
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  let seed = 7
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  for (let i = 3; i < d.length; i += 4) {
    const a = d[i] ?? 0
    if (a === 0) continue
    const r = rand()
    if (r < 0.08) d[i] = 0
    else if (r < 0.3) d[i] = Math.round(a * (0.55 + rand() * 0.4))
  }
  ctx.putImageData(img, 0, 0)

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  tex.repeat.set(1, 1 / DASH_PERIOD)
  return tex
}
