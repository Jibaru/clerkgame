import * as THREE from 'three'
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js'

/**
 * game-icons.net SVGs (512 × 512, a black background path and a white icon path) extruded into
 * geometry. The result is centred and scaled so the icon spans `size` metres, facing +z.
 */
const cache = new Map<string, Promise<THREE.BufferGeometry>>()

export function loadIconGeometry(name: string, size: number, depth = 0.12): Promise<THREE.BufferGeometry> {
  const key = `${name}|${size}|${depth}`
  let p = cache.get(key)
  if (!p) {
    p = new Promise((resolve, reject) => {
      new SVGLoader().load(
        `/icons/${name}.svg`,
        (data) => {
          const shapes: THREE.Shape[] = []
          for (const path of data.paths) {
            const style = (path.userData as { style?: { fill?: string } } | undefined)?.style
            const fill = style?.fill
            // Skip the background square (no fill attribute, so SVGLoader reports black).
            if (!fill || fill === 'none' || /^#0{3}(0{3})?$/.test(fill) || fill === 'black') continue
            shapes.push(...SVGLoader.createShapes(path))
          }
          if (!shapes.length) {
            reject(new Error(`icon ${name} has no filled shapes`))
            return
          }
          const geo = new THREE.ExtrudeGeometry(shapes, {
            depth: 512 * (depth / size),
            bevelEnabled: true,
            bevelThickness: 6,
            bevelSize: 4,
            bevelSegments: 2,
            curveSegments: 6,
          })
          // SVG y runs down; flip, centre and scale to metres.
          geo.scale(size / 512, -size / 512, size / 512)
          geo.computeBoundingBox()
          const bb = geo.boundingBox
          if (bb) {
            const c = new THREE.Vector3()
            bb.getCenter(c)
            geo.translate(-c.x, -c.y, -c.z)
          }
          geo.computeVertexNormals()
          resolve(geo)
        },
        undefined,
        (err) => reject(err instanceof Error ? err : new Error(`failed to load icon ${name}`)),
      )
    })
    cache.set(key, p)
  }
  return p
}
