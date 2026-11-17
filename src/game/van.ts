import * as THREE from 'three'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export const VAN_URL = '/models/clerk_van.glb'
const WHEEL_R = 0.356
const WHEELBASE = 3.75

export type VanRig = {
  root: THREE.Group
  wheels: THREE.Object3D[]
  steer: { node: THREE.Object3D; restY: number }[]
  setHeadlights: (on: boolean) => void
}

/** Loads the Clerk Van and wires the named pivots the model ships with. */
export function loadVan(onProgress: (ratio: number) => void): Promise<VanRig> {
  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  return new Promise((resolve, reject) => {
    loader.load(
      VAN_URL,
      (gltf) => {
        const root = gltf.scene
        const nodes = new Map<string, THREE.Object3D>()
        const mats = new Map<string, THREE.MeshStandardMaterial>()
        root.traverse((o) => {
          if (o.name) nodes.set(o.name, o)
          if (o instanceof THREE.Mesh) {
            o.castShadow = true
            o.receiveShadow = true
            const ms = Array.isArray(o.material) ? o.material : [o.material]
            for (const m of ms) if (m instanceof THREE.MeshStandardMaterial && m.name) mats.set(m.name, m)
          }
          if (o instanceof THREE.Light) {
            o.visible = false
            o.intensity = 0
          }
        })
        const wheels = ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR']
          .map((n) => nodes.get(n))
          .filter((n): n is THREE.Object3D => Boolean(n))
        const steer = ['Steer_L', 'Steer_R']
          .map((n) => nodes.get(n))
          .filter((n): n is THREE.Object3D => Boolean(n))
          .map((node) => ({ node, restY: node.rotation.y }))
        const headLens = mats.get('Headlight_Lens')
        const tailLens = mats.get('Taillight_Lens')
        if (headLens) headLens.emissive.set(0xfff6e0)
        if (tailLens) tailLens.emissive.set(0xff1a10)
        const setHeadlights = (on: boolean) => {
          if (headLens) headLens.emissiveIntensity = on ? 2.5 : 0
          if (tailLens) tailLens.emissiveIntensity = on ? 1.5 : 0
        }
        setHeadlights(false)
        resolve({ root, wheels, steer, setHeadlights })
      },
      (ev) => {
        if (ev.total) onProgress(ev.loaded / ev.total)
      },
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
    )
  })
}

export const VAN_MAX_SPEED = 17
export const BOOST_MULTIPLIER = 1.45
export const BOOST_SECONDS = 3

/** Arcade car model: no physics engine, just speed, steering angle and a bicycle-model yaw. */
export class VanController {
  readonly position = new THREE.Vector3()
  heading = 0
  speed = 0
  steer = 0
  /** Seconds of session boost left. */
  boost = 0
  /** 1 on asphalt, lower on gravel and grass; scales the top speed and the acceleration. */
  grip = 1
  readonly maxReverse = 5
  readonly maxSteer = THREE.MathUtils.degToRad(32)
  private readonly forward = new THREE.Vector3()

  constructor(readonly rig: VanRig) {}

  get maxSpeed(): number {
    return VAN_MAX_SPEED * (this.boost > 0 ? BOOST_MULTIPLIER : 1) * this.grip
  }

  /** throttle ∈ [-1, 1], steerInput ∈ [-1, 1] (positive = left). */
  update(dt: number, throttle: number, steerInput: number, brake: boolean) {
    const accel = (this.boost > 0 ? 16 : 10) * Math.max(this.grip, 0.5)
    const drag = 2.5
    this.boost = Math.max(0, this.boost - dt)
    if (brake) {
      this.speed = THREE.MathUtils.damp(this.speed, 0, 7, dt)
    } else if (throttle !== 0) {
      this.speed += throttle * accel * dt
    } else {
      this.speed = THREE.MathUtils.damp(this.speed, 0, drag, dt)
    }
    const max = this.maxSpeed
    // Over the limit (boost just ended, or onto grass): bleed speed rather than clamp hard.
    if (this.speed > max) this.speed = THREE.MathUtils.damp(this.speed, max, 4, dt)
    this.speed = THREE.MathUtils.clamp(this.speed, -this.maxReverse, VAN_MAX_SPEED * BOOST_MULTIPLIER)

    const targetSteer = steerInput * this.maxSteer
    this.steer = THREE.MathUtils.damp(this.steer, targetSteer, 10, dt)

    // Bicycle model: yaw rate depends on speed and steering angle. Reversing flips the turn.
    const yawRate = (this.speed / WHEELBASE) * Math.tan(this.steer)
    this.heading += yawRate * dt
    this.forward.set(Math.sin(this.heading), 0, Math.cos(this.heading))
    this.position.x += this.forward.x * this.speed * dt
    this.position.z += this.forward.z * this.speed * dt

    const { root, wheels, steer } = this.rig
    root.position.copy(this.position)
    root.rotation.y = this.heading
    const roll = (this.speed * dt) / WHEEL_R
    for (const w of wheels) w.rotation.x += roll
    for (const s of steer) s.node.rotation.y = s.restY + this.steer
  }

  teleport(position: THREE.Vector3, heading: number) {
    this.position.copy(position)
    this.heading = heading
    this.speed = 0
    this.steer = 0
    this.boost = 0
    this.forward.set(Math.sin(heading), 0, Math.cos(heading))
    this.rig.root.position.copy(position)
    this.rig.root.rotation.y = heading
  }

  get forwardDir() {
    return this.forward
  }
}
