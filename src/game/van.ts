import * as THREE from 'three'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { assetUrl } from './assets'

export const VAN_URL = assetUrl('/models/clerk_van.glb')
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
/** Seconds of drift needed for each mini-turbo tier, and the boost each tier grants. */
export const DRIFT_TIERS = [0.7, 1.6, 2.6] as const
export const DRIFT_BOOST_SECONDS = [0.6, 1.1, 1.8] as const

export type DriftState = {
  active: boolean
  /** +1 drifting left, -1 drifting right. */
  dir: number
  /** Seconds held. */
  time: number
  tier: number
}

/**
 * Arcade kart model. The van has a heading (where the body points) and a travel direction that
 * lags behind it: on asphalt they stay together, in a drift the body swings out and the travel
 * direction follows slowly, which is the slide. Steering is smoothed and scaled with speed so
 * small inputs are precise and the wheel never snaps.
 */
export class VanController {
  readonly position = new THREE.Vector3()
  heading = 0
  /** Direction of travel (yaw). */
  travel = 0
  speed = 0
  steer = 0
  boost = 0
  grip = 1
  readonly drift: DriftState = { active: false, dir: 0, time: 0, tier: 0 }
  /** Visual roll of the body, radians (positive leans right). */
  lean = 0
  readonly maxReverse = 5
  readonly maxSteer = THREE.MathUtils.degToRad(30)
  private readonly forward = new THREE.Vector3()
  private hop = 0

  constructor(readonly rig: VanRig) {}

  get maxSpeed(): number {
    return VAN_MAX_SPEED * (this.boost > 0 ? BOOST_MULTIPLIER : 1) * this.grip
  }

  /** Starts a drift if the van is moving and the wheel is turned. */
  startDrift(steerInput: number): boolean {
    if (this.drift.active || this.speed < 7 || Math.abs(steerInput) < 0.2) return false
    this.drift.active = true
    this.drift.dir = Math.sign(steerInput)
    this.drift.time = 0
    this.drift.tier = 0
    this.hop = 1
    return true
  }

  /** Ends the drift; returns the mini-turbo tier earned (0 = none). */
  endDrift(): number {
    if (!this.drift.active) return 0
    const tier = this.drift.tier
    this.drift.active = false
    this.drift.time = 0
    this.drift.tier = 0
    if (tier > 0) this.boost = Math.max(this.boost, DRIFT_BOOST_SECONDS[tier - 1] ?? 0.6)
    return tier
  }

  /** throttle ∈ [-1, 1], steerInput ∈ [-1, 1] (positive = left), brake = hard brake. */
  update(dt: number, throttle: number, steerInput: number, brake: boolean) {
    const accel = (this.boost > 0 ? 16 : 10) * Math.max(this.grip, 0.5)
    const drag = 2.2
    this.boost = Math.max(0, this.boost - dt)
    if (brake) this.speed = THREE.MathUtils.damp(this.speed, 0, 6, dt)
    else if (throttle !== 0) this.speed += throttle * accel * dt
    else this.speed = THREE.MathUtils.damp(this.speed, 0, drag, dt)
    const max = this.maxSpeed
    if (this.speed > max) this.speed = THREE.MathUtils.damp(this.speed, max, 4, dt)
    this.speed = THREE.MathUtils.clamp(this.speed, -this.maxReverse, VAN_MAX_SPEED * BOOST_MULTIPLIER)

    // Steering: less lock at speed, smoothed so taps are gentle.
    const k = THREE.MathUtils.clamp(Math.abs(this.speed) / VAN_MAX_SPEED, 0, 1)
    const lock = this.maxSteer * (1 - 0.45 * k)
    let targetSteer = steerInput * lock
    let yawRate: number
    if (this.drift.active) {
      // Locked into the drift direction; the stick tightens or widens the arc.
      this.drift.time += dt
      this.drift.tier = DRIFT_TIERS.filter((t) => this.drift.time >= t).length
      const bias = 0.55 + 0.45 * THREE.MathUtils.clamp(steerInput * this.drift.dir, -1, 1)
      targetSteer = this.drift.dir * lock * (0.9 + bias * 0.5)
      this.steer = THREE.MathUtils.damp(this.steer, targetSteer, 8, dt)
      yawRate = (Math.abs(this.speed) / WHEELBASE) * Math.tan(this.steer)
      // Drifting scrubs a little speed; the mini-turbo pays it back.
      this.speed = THREE.MathUtils.damp(this.speed, Math.max(6, this.speed * 0.99), 1.2, dt)
      if (this.speed < 5) this.endDrift()
    } else {
      this.steer = THREE.MathUtils.damp(this.steer, targetSteer, 9, dt)
      yawRate = (this.speed / WHEELBASE) * Math.tan(this.steer)
    }
    this.heading += yawRate * dt

    // Travel direction chases the heading: tight on asphalt, loose in a drift or on grass.
    const follow = this.drift.active ? 4 : 6 + 10 * this.grip
    let diff = this.heading - this.travel
    diff = Math.atan2(Math.sin(diff), Math.cos(diff))
    this.travel += diff * (1 - Math.exp(-follow * dt))
    this.forward.set(Math.sin(this.heading), 0, Math.cos(this.heading))
    const dir = this.speed >= 0 ? this.travel : this.heading
    this.position.x += Math.sin(dir) * this.speed * dt
    this.position.z += Math.cos(dir) * this.speed * dt

    // Body: hop at drift start, lean into corners, slip angle shown as extra yaw.
    this.hop = Math.max(0, this.hop - dt * 4)
    const targetLean = -this.steer * 0.35 * k - (this.drift.active ? this.drift.dir * 0.12 : 0)
    this.lean = THREE.MathUtils.damp(this.lean, targetLean, 6, dt)
    const { root, wheels, steer } = this.rig
    root.position.copy(this.position)
    root.position.y += Math.sin(Math.min(1, this.hop) * Math.PI) * 0.45
    root.rotation.set(0, this.heading, this.lean)
    const roll = (this.speed * dt) / WHEEL_R
    for (const w of wheels) w.rotation.x += roll
    for (const s of steer) s.node.rotation.y = s.restY + this.steer
  }

  teleport(position: THREE.Vector3, heading: number) {
    this.position.copy(position)
    this.heading = heading
    this.travel = heading
    this.speed = 0
    this.steer = 0
    this.boost = 0
    this.lean = 0
    this.hop = 0
    this.drift.active = false
    this.drift.time = 0
    this.drift.tier = 0
    this.forward.set(Math.sin(heading), 0, Math.cos(heading))
    this.rig.root.position.copy(position)
    this.rig.root.rotation.set(0, heading, 0)
  }

  get forwardDir() {
    return this.forward
  }

  /** Unit travel direction in XZ (the way the van is actually moving). */
  get travelDir(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.travel), 0, Math.cos(this.travel))
  }

  /** How far the body points away from the travel direction, radians. */
  get slip(): number {
    let d = this.heading - this.travel
    d = Math.atan2(Math.sin(d), Math.cos(d))
    return d
  }
}
