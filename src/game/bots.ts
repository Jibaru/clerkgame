import * as THREE from 'three'
import { loadIconGeometry } from './icons'
import { ROAD_W, type Track } from './track'

/**
 * Spam bots: flat icon "drones" that patrol across the road in the forest section. Touching one
 * costs cookies and shoves the van. They are deterministic so the server can trust that a run
 * with n bot hits lost 3n cookies at most.
 */
export type Bot = {
  u: number
  phase: number
  speed: number
  mesh: THREE.Group
  position: THREE.Vector3
  /** Seconds until this bot can hit again. */
  cooldown: number
}

export type Bots = {
  all: Bot[]
  update: (dt: number, time: number, vanPosition: THREE.Vector3, racing: boolean) => Bot[]
  reset: () => void
  dispose: () => void
}

const BOT_US = [0.655, 0.69, 0.725, 0.76, 0.8]
const HIT_RADIUS = 2.4

export async function buildBots(scene: THREE.Scene, track: Track): Promise<Bots> {
  const group = new THREE.Group()
  group.name = 'bots'
  scene.add(group)
  const geometry = await loadIconGeometry('robot-antennas', 2.0, 0.2)
  const body = new THREE.MeshStandardMaterial({
    color: 0x2a2a30,
    emissive: 0xff2d55,
    emissiveIntensity: 0.9,
    roughness: 0.4,
    metalness: 0.5,
  })
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xff2d55,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
  })

  const all: Bot[] = BOT_US.map((u, i) => {
    const mesh = new THREE.Group()
    const icon = new THREE.Mesh(geometry, body)
    icon.castShadow = true
    mesh.add(icon)
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.65, 32), ringMat)
    ring.rotation.x = -Math.PI / 2
    ring.position.y = -1.3
    mesh.add(ring)
    group.add(mesh)
    return { u, phase: i * 1.7, speed: 0.9 + i * 0.12, mesh, position: new THREE.Vector3(), cooldown: 0 }
  })

  const hits: Bot[] = []
  const update = (dt: number, time: number, van: THREE.Vector3, racing: boolean) => {
    hits.length = 0
    for (const b of all) {
      const { point, tangent, normal } = track.at(b.u)
      // Sweep across the full road width, pausing at the edges (sin wave).
      const lateral = Math.sin(time * b.speed + b.phase) * (ROAD_W / 2 - 0.8)
      b.position.copy(point).addScaledVector(normal, lateral)
      b.position.y = point.y + 1.5 + Math.sin(time * 3 + b.phase) * 0.15
      b.mesh.position.copy(b.position)
      b.mesh.rotation.y = Math.atan2(tangent.x, tangent.z) + Math.PI
      b.mesh.rotation.z = Math.cos(time * b.speed + b.phase) * 0.25
      b.cooldown = Math.max(0, b.cooldown - dt)
      if (!racing || b.cooldown > 0) continue
      const dx = b.position.x - van.x
      const dz = b.position.z - van.z
      if (dx * dx + dz * dz < HIT_RADIUS * HIT_RADIUS) {
        b.cooldown = 1.5
        hits.push(b)
      }
    }
    return hits
  }

  return {
    all,
    update,
    reset: () => {
      for (const b of all) b.cooldown = 0
    },
    dispose: () => {
      scene.remove(group)
      geometry.dispose()
      body.dispose()
    },
  }
}
