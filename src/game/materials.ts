import * as THREE from 'three'

/**
 * Stylised road surfaces: flat dark asphalt with a faint speckle, crisp painted markings, warm
 * gravel for the shortcut. Everything is drawn on canvases, so there is nothing to download.
 */
export type RoadMaterials = {
  asphalt: THREE.MeshStandardMaterial
  markings: THREE.MeshBasicMaterial
  shoulder: THREE.MeshStandardMaterial
  gravel: THREE.MeshStandardMaterial
}

const ROAD_WIDTH = 10
const DASH_PERIOD = 9

function speckle(base: string, dots: string[], size = 256, density = 900): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d') as CanvasRenderingContext2D
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)
  let seed = 3
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  for (let i = 0; i < density; i++) {
    ctx.fillStyle = dots[Math.floor(rand() * dots.length)] ?? dots[0] ?? '#000'
    const r = 1 + rand() * 2.5
    ctx.beginPath()
    ctx.arc(rand() * size, rand() * size, r, 0, Math.PI * 2)
    ctx.fill()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

export function createRoadMaterials(): RoadMaterials {
  const asphaltTex = speckle('#3b3b46', ['#454552', '#33333d', '#4a4a58'])
  asphaltTex.repeat.set(1, 1 / ROAD_WIDTH)
  const asphalt = new THREE.MeshStandardMaterial({
    map: asphaltTex,
    roughness: 0.92,
    metalness: 0,
    envMapIntensity: 0.25,
  })
  const markings = new THREE.MeshBasicMaterial({
    map: makeMarkingsTexture(),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  const shoulderTex = speckle('#d9d2bf', ['#cfc6b0', '#e4ddc9', '#c4bca6'], 128, 300)
  shoulderTex.repeat.set((ROAD_WIDTH + 2.4) / 3, 1 / 3)
  const shoulder = new THREE.MeshStandardMaterial({
    map: shoulderTex,
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0.2,
  })
  const gravelTex = speckle('#d8b98a', ['#c9a876', '#e3c79c', '#bf9d6c'], 128, 400)
  gravelTex.repeat.set(2, 1 / 3)
  const gravel = new THREE.MeshStandardMaterial({
    map: gravelTex,
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0.2,
  })
  return { asphalt, markings, shoulder, gravel }
}

/** Two white edge lines and a dashed centre line per DASH_PERIOD metres of road. */
function makeMarkingsTexture(): THREE.CanvasTexture {
  const w = 512
  const h = Math.round((w * DASH_PERIOD) / ROAD_WIDTH)
  const pxPerM = w / ROAD_WIDTH
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  ctx.clearRect(0, 0, w, h)
  const lineW = Math.max(4, Math.round(0.16 * pxPerM))
  const inset = Math.round(0.35 * pxPerM)
  ctx.fillStyle = 'rgba(248,248,252,0.95)'
  ctx.fillRect(inset, 0, lineW, h)
  ctx.fillRect(w - inset - lineW, 0, lineW, h)
  ctx.fillStyle = 'rgba(255,224,110,0.95)'
  const dashW = Math.max(4, Math.round(0.18 * pxPerM))
  ctx.fillRect(Math.round(w / 2 - dashW / 2), Math.round(0.2 * pxPerM), dashW, Math.round(3.2 * pxPerM))
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  tex.repeat.set(1, 1 / DASH_PERIOD)
  return tex
}
