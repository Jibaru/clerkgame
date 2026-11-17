import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const loader = new GLTFLoader()
const cache = new Map<string, Promise<THREE.Group>>()

export const KITS_URL = '/models/kits'

/** Loads a kit model once and hands out clones. Path is `<kit>/<file>.glb`. */
export function loadKitModel(path: string): Promise<THREE.Group> {
  let p = cache.get(path)
  if (!p) {
    p = new Promise((resolve, reject) => {
      loader.load(
        `${KITS_URL}/${path}`,
        (gltf) => {
          gltf.scene.traverse((o) => {
            if (o instanceof THREE.Mesh) {
              o.castShadow = true
              o.receiveShadow = true
            }
          })
          resolve(gltf.scene)
        },
        undefined,
        (err) => reject(err instanceof Error ? err : new Error(`failed to load ${path}`)),
      )
    })
    cache.set(path, p)
  }
  return p.then((g) => g.clone(true))
}

export type Piece = {
  model: string
  x?: number
  z?: number
  y?: number
  /** Rotation around Y in degrees. */
  rot?: number
  scale?: number
}

/** A place is a list of kit pieces placed around its anchor, facing +z (toward the road). */
export type PlaceSpec = {
  /** Uniform scale for the whole place, so kits built at different units match. */
  scale: number
  pieces: Piece[]
}

export async function buildPlace(spec: PlaceSpec): Promise<THREE.Group> {
  const group = new THREE.Group()
  const models = await Promise.all(spec.pieces.map((p) => loadKitModel(p.model).catch(() => null)))
  spec.pieces.forEach((p, i) => {
    const m = models[i]
    if (!m) return
    m.position.set(p.x ?? 0, p.y ?? 0, p.z ?? 0)
    m.rotation.y = THREE.MathUtils.degToRad(p.rot ?? 0)
    const s = p.scale ?? 1
    m.scale.setScalar(s)
    group.add(m)
  })
  group.scale.setScalar(spec.scale)
  return group
}
