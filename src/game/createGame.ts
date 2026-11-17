import * as THREE from 'three'
import { buildBots } from './bots'
import { buildCollectibles, type Collectible } from './collectibles'
import { BOT_STEALS, type Collected, emptyCollected, type ItemKind, scoreRun } from './items'
import { ROAD_W, SHORTCUT_W, SHOULDER_W } from './track'
import { BOOST_SECONDS, loadVan, VanController } from './van'
import { BRIDGE, buildWorld, HAIRPIN_WALL, TUNNEL } from './world'

export type RacePhase = 'loading' | 'ready' | 'countdown' | 'racing' | 'finished'

export type Score = ReturnType<typeof scoreRun>

export type RunResult = {
  timeMs: number
  collected: Collected
  score: Score
  botHits: number
  cookiesLost: number
  /** Item ids in pickup order, so the server can check them against the track. */
  pickups: number[]
  startedAt: number
  finishedAt: number
}

export type Snapshot = {
  phase: RacePhase
  progress: number
  countdown: number
  timeMs: number
  speedKmh: number
  collected: Collected
  score: Score
  boost: number
  lap: number
  botHits: number
  cookiesLost: number
  signin: [boolean, boolean, boolean]
  result: RunResult | null
  lite: boolean
  /** Last throttle input, for the engine sound. */
  throttle: number
}

export type GameEvent =
  | { type: 'pickup'; kind: ItemKind }
  | { type: 'hit' }
  | { type: 'countdown'; n: number }
  | { type: 'go' }
  | { type: 'finish' }
  | { type: 'offroad'; on: boolean }

export type TouchInput = { throttle: number; steer: number; brake: boolean }

export type GameHandle = {
  start: () => void
  restart: () => void
  setTouch: (input: TouchInput) => void
  subscribe: (cb: (s: Snapshot) => void) => () => void
  on: (cb: (e: GameEvent) => void) => () => void
  getSnapshot: () => Snapshot
  destroy: () => void
}

const VAN_RADIUS = 2.4
const CHECKPOINTS = [0.25, 0.55, 0.8]

export function createGame(parent: HTMLElement): GameHandle {
  const lite =
    window.matchMedia('(pointer: coarse)').matches ||
    window.innerWidth < 760 ||
    new URLSearchParams(window.location.search).has('lite')
  const renderer = new THREE.WebGLRenderer({ antialias: !lite, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lite ? 1.5 : 2))
  renderer.shadowMap.enabled = !lite
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.touchAction = 'none'
  parent.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(52, 1, 0.5, 700)
  scene.add(new THREE.HemisphereLight(0xdfe9f3, 0x5f7a3a, 0.55))
  const sun = new THREE.DirectionalLight(0xfff3e0, 2.0)
  sun.castShadow = !lite
  sun.shadow.mapSize.set(2048, 2048)
  const sc = sun.shadow.camera
  sc.left = -70
  sc.right = 70
  sc.top = 70
  sc.bottom = -70
  sc.near = 1
  sc.far = 260
  sun.shadow.bias = -0.0006
  sun.shadow.normalBias = 0.04
  scene.add(sun, sun.target)

  const world = buildWorld(scene, renderer, { lite })
  const { track, shortcut } = world

  // ------------------------------------------------------------------------------------ state
  let van: VanController | null = null
  let collectibles: Awaited<ReturnType<typeof buildCollectibles>> | null = null
  let bots: Awaited<ReturnType<typeof buildBots>> | null = null
  let disposed = false
  let phase: RacePhase = 'loading'
  let progress = 0
  let countdown = 0
  let countdownShown = 0
  let timeMs = 0
  let startedAt = 0
  let collected = emptyCollected()
  let pickups: number[] = []
  let botHits = 0
  let cookiesLost = 0
  let result: RunResult | null = null
  let checkpoints = [false, false, false]
  let prevU = 0
  let offroad = false
  let shake = 0
  let lastThrottle = 0
  /** Dev only: a fixed camera for screenshots, set through window.__game.view(). */
  let camOverride: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null
  const touch: TouchInput = { throttle: 0, steer: 0, brake: false }
  const keys = new Set<string>()
  const listeners = new Set<(s: Snapshot) => void>()
  const eventListeners = new Set<(e: GameEvent) => void>()
  let lastPublish = 0

  const spawn = track.at(0.995)
  const spawnPos = spawn.point.clone()
  const spawnHeading = Math.atan2(spawn.tangent.x, spawn.tangent.z)

  const camPos = new THREE.Vector3()
  const camLook = new THREE.Vector3()
  const tmp = new THREE.Vector3()
  camera.position.copy(spawnPos).add(new THREE.Vector3(12, 6, -10))
  camera.lookAt(spawnPos)

  const snapshot = (): Snapshot => ({
    phase,
    progress,
    countdown,
    timeMs,
    speedKmh: van ? Math.abs(van.speed) * 3.6 : 0,
    collected,
    score: scoreRun(collected, timeMs),
    boost: van ? van.boost : 0,
    lap: track.nearest(van ? van.position : spawnPos).u,
    botHits,
    cookiesLost,
    signin: [collected.signin_open > 0, collected.signin_name > 0, collected.signin_close > 0],
    result,
    lite,
    throttle: lastThrottle,
  })
  const publish = (force = false) => {
    const now = performance.now()
    if (!force && now - lastPublish < 100) return
    lastPublish = now
    const s = snapshot()
    for (const cb of listeners) cb(s)
  }
  const emit = (e: GameEvent) => {
    for (const cb of eventListeners) cb(e)
  }

  // ------------------------------------------------------------------------------------ pickup fx
  const burstGeo = new THREE.PlaneGeometry(0.35, 0.35)
  const burst: Array<{ mesh: THREE.Mesh; vel: THREE.Vector3; life: number }> = []
  const burstMats = new Map<number, THREE.MeshBasicMaterial>()
  const spawnBurst = (at: THREE.Vector3, color: number) => {
    let mat = burstMats.get(color)
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      burstMats.set(color, mat)
    }
    for (let i = 0; i < 10; i++) {
      const mesh = new THREE.Mesh(burstGeo, mat)
      mesh.position.copy(at)
      scene.add(mesh)
      const a = Math.random() * Math.PI * 2
      burst.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(a) * 4, 3 + Math.random() * 4, Math.sin(a) * 4),
        life: 0.6 + Math.random() * 0.3,
      })
    }
  }
  const updateBurst = (dt: number) => {
    for (let i = burst.length - 1; i >= 0; i--) {
      const b = burst[i]
      if (!b) continue
      b.life -= dt
      if (b.life <= 0) {
        scene.remove(b.mesh)
        burst.splice(i, 1)
        continue
      }
      b.vel.y -= 12 * dt
      b.mesh.position.addScaledVector(b.vel, dt)
      b.mesh.rotation.set(b.life * 5, b.life * 7, 0)
      b.mesh.scale.setScalar(Math.min(1, b.life * 2.5))
    }
  }

  // ------------------------------------------------------------------------------------ race
  const resetRun = () => {
    collected = emptyCollected()
    pickups = []
    botHits = 0
    cookiesLost = 0
    result = null
    timeMs = 0
    checkpoints = [false, false, false]
    prevU = 0.995
    collectibles?.reset()
    bots?.reset()
    van?.teleport(spawnPos.clone(), spawnHeading)
  }

  const start = () => {
    if (phase !== 'ready' && phase !== 'finished') return
    resetRun()
    phase = 'countdown'
    countdown = 3.4
    countdownShown = 0
    publish(true)
  }

  const finish = () => {
    phase = 'finished'
    const finishedAt = Date.now()
    result = {
      timeMs: Math.round(timeMs),
      collected: { ...collected },
      score: scoreRun(collected, timeMs),
      botHits,
      cookiesLost,
      pickups: [...pickups],
      startedAt,
      finishedAt,
    }
    emit({ type: 'finish' })
    publish(true)
  }

  const onPickup = (c: Collectible) => {
    collected[c.kind]++
    pickups.push(c.id)
    if (c.kind === 'boost' && van) van.boost = BOOST_SECONDS
    spawnBurst(c.mesh.position, c.kind === 'cookie' ? 0xf2b84b : c.kind === 'passkey' ? 0x7cff00 : 0x6c47ff)
    emit({ type: 'pickup', kind: c.kind })
  }

  const onBotHit = (botPos: THREE.Vector3) => {
    if (!van) return
    const lost = Math.min(collected.cookie, BOT_STEALS)
    collected.cookie -= lost
    cookiesLost += lost
    botHits++
    van.speed *= 0.35
    // Shove away from the bot.
    tmp.subVectors(van.position, botPos).setY(0).normalize()
    van.position.addScaledVector(tmp, 1.2)
    shake = 0.6
    spawnBurst(van.position.clone().setY(1.5), 0xff2d55)
    emit({ type: 'hit' })
  }

  // ------------------------------------------------------------------------------------ input
  const resize = () => {
    const w = parent.clientWidth || 1
    const h = parent.clientHeight || 1
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  const ro = new ResizeObserver(resize)
  ro.observe(parent)
  resize()

  const DRIVE_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ']
  const onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase()
    if (DRIVE_KEYS.includes(k)) {
      e.preventDefault()
      keys.add(k)
    }
    if (k === 'r' && (phase === 'finished' || phase === 'racing')) {
      phase = 'ready'
      resetRun()
      start()
    }
    if (k === 'enter' && (phase === 'ready' || phase === 'finished')) start()
  }
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase())
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  // ------------------------------------------------------------------------------------ physics helpers
  const lateralOf = (p: THREE.Vector3, point: THREE.Vector3, normal: THREE.Vector3) =>
    (p.x - point.x) * normal.x + (p.z - point.z) * normal.z

  /** Walls, buildings and world bounds. */
  const collide = (dt: number) => {
    if (!van) return
    const p = van.position
    const near = track.nearest(p)
    const { point, normal } = track.at(near.u)
    const lateral = lateralOf(p, point, normal)
    const inRange = (u0: number, u1: number) => near.u > u0 && near.u < u1
    // Tunnel: keep inside the arch.
    if (inRange(TUNNEL.u0, TUNNEL.u1)) {
      const limit = TUNNEL.halfWidth - 1.3
      if (Math.abs(lateral) > limit) {
        p.addScaledVector(normal, Math.sign(lateral) * limit - lateral)
        van.speed *= 0.97
      }
    }
    // Bridge parapets.
    if (inRange(BRIDGE.u - BRIDGE.half, BRIDGE.u + BRIDGE.half)) {
      const limit = ROAD_W / 2 + SHOULDER_W - 1.1
      if (Math.abs(lateral) > limit) {
        p.addScaledVector(normal, Math.sign(lateral) * limit - lateral)
        van.speed *= 0.95
      }
    }
    // Hairpin barriers on the outside (negative normal side).
    if (inRange(HAIRPIN_WALL.u0, HAIRPIN_WALL.u1)) {
      const limit = -(ROAD_W / 2 + SHOULDER_W - 0.9)
      if (lateral < limit) {
        p.addScaledVector(normal, limit - lateral)
        van.speed *= 0.9
      }
    }
    // Buildings and props: circle vs box.
    for (const o of world.obstacles) {
      const box = o.box
      const cx = THREE.MathUtils.clamp(p.x, box.min.x, box.max.x)
      const cz = THREE.MathUtils.clamp(p.z, box.min.z, box.max.z)
      const dx = p.x - cx
      const dz = p.z - cz
      const d = Math.hypot(dx, dz)
      if (d < VAN_RADIUS) {
        if (d < 1e-4) {
          p.addScaledVector(van.forwardDir, -1)
        } else {
          const push = (VAN_RADIUS - d) / d
          p.x += dx * push
          p.z += dz * push
        }
        van.speed *= 0.3
        shake = Math.max(shake, 0.3)
      }
    }
    const limit = 520
    p.x = THREE.MathUtils.clamp(p.x, -limit, limit)
    p.z = THREE.MathUtils.clamp(p.z, -limit, limit)
    void dt
  }

  // ------------------------------------------------------------------------------------ loop
  const timer = new THREE.Timer()
  let raf = 0
  const tick = () => {
    if (disposed) return
    raf = requestAnimationFrame(tick)
    timer.update()
    const dt = Math.min(timer.getDelta(), 0.05)
    const time = timer.getElapsed()

    if (phase === 'countdown') {
      countdown -= dt
      const n = Math.ceil(countdown)
      if (n !== countdownShown && n >= 1 && n <= 3) {
        countdownShown = n
        emit({ type: 'countdown', n })
      }
      if (countdown <= 0) {
        phase = 'racing'
        startedAt = Date.now()
        timeMs = 0
        emit({ type: 'go' })
        publish(true)
      }
    }

    if (van) {
      let throttle = 0
      let steer = 0
      let brake = false
      const driving = phase === 'racing'
      if (driving) {
        if (keys.has('w') || keys.has('arrowup')) throttle += 1
        if (keys.has('s') || keys.has('arrowdown')) throttle -= 1
        if (keys.has('a') || keys.has('arrowleft')) steer += 1
        if (keys.has('d') || keys.has('arrowright')) steer -= 1
        if (keys.has(' ')) brake = true
        throttle = THREE.MathUtils.clamp(throttle + touch.throttle, -1, 1)
        steer = THREE.MathUtils.clamp(steer + touch.steer, -1, 1)
        brake = brake || touch.brake
      } else if (phase === 'countdown') {
        brake = true
      } else if (phase === 'finished') {
        // Roll to a stop past the line.
        throttle = 0
        brake = Math.abs(van.speed) < 4
      }

      // Surface under the van.
      const near = track.nearest(van.position)
      const onRoad = near.distance < ROAD_W / 2 + 0.9
      const onShortcut = !onRoad && shortcut.distance(van.position) < SHORTCUT_W / 2 + 0.9
      const groundY = world.env.heightAt(van.position.x, van.position.z)
      const inWater = groundY < -0.4
      van.grip = onRoad ? 1 : onShortcut ? 0.74 : inWater ? 0.35 : 0.52
      const nowOffroad = !onRoad && !onShortcut
      if (nowOffroad !== offroad) {
        offroad = nowOffroad
        emit({ type: 'offroad', on: offroad })
      }

      const steerScale = THREE.MathUtils.clamp(Math.abs(van.speed) / 3, 0.25, 1)
      lastThrottle = throttle
      van.update(dt, throttle, steer * steerScale * Math.sign(van.speed || 1), brake)
      collide(dt)

      // Height: road surface (bridge hump) when on the asphalt, terrain otherwise.
      const targetY = onRoad ? track.at(near.u).point.y : groundY
      van.position.y = THREE.MathUtils.damp(van.position.y, targetY, 12, dt)
      van.rig.root.position.copy(van.position)

      // Lap bookkeeping.
      if (driving) {
        timeMs += dt * 1000
        const u = near.u
        CHECKPOINTS.forEach((cp, i) => {
          if (Math.abs(u - cp) < 0.03) checkpoints[i] = true
        })
        const crossed = prevU > 0.9 && u < 0.1
        if (crossed && checkpoints.every(Boolean)) finish()
        prevU = u
      }

      // Items and bots.
      if (collectibles) for (const c of collectibles.update(dt, time, van.position, driving)) onPickup(c)
      if (bots) for (const b of bots.update(dt, time, van.position, driving)) onBotHit(b.position)

      // Camera.
      const fwd = van.forwardDir
      if (camOverride) {
        camera.position.copy(camOverride.pos)
        camera.lookAt(camOverride.look)
        camera.fov = 50
      } else if (phase === 'ready') {
        // Slow orbit around the parked van.
        const a = time * 0.25
        camPos.set(van.position.x + Math.sin(a) * 13, 4.5, van.position.z + Math.cos(a) * 13)
        camLook.copy(van.position).setY(1.4)
        camera.position.lerp(camPos, 1 - Math.exp(-dt * 2))
        camera.lookAt(camLook)
        camera.fov = THREE.MathUtils.damp(camera.fov, 45, 3, dt)
      } else {
        const speedK = Math.abs(van.speed) / 17
        const back = lite ? 15 : 12.5 + speedK * 2.5
        const up = lite ? 7.5 : 6 + speedK * 1.2
        camPos.copy(van.position).addScaledVector(fwd, -back)
        camPos.y = van.position.y + up
        camLook.copy(van.position).addScaledVector(fwd, 12)
        camLook.y = van.position.y + 1.6
        const k = phase === 'countdown' ? 2.5 : 6
        camera.position.x = THREE.MathUtils.damp(camera.position.x, camPos.x, k, dt)
        camera.position.y = THREE.MathUtils.damp(camera.position.y, camPos.y, k, dt)
        camera.position.z = THREE.MathUtils.damp(camera.position.z, camPos.z, k, dt)
        if (shake > 0) {
          shake = Math.max(0, shake - dt * 1.8)
          camera.position.x += (Math.random() - 0.5) * shake * 0.6
          camera.position.y += (Math.random() - 0.5) * shake * 0.4
        }
        camera.lookAt(camLook)
        const targetFov = 52 + speedK * 14 + (van.boost > 0 ? 6 : 0)
        camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 4, dt)
      }
      camera.updateProjectionMatrix()

      sun.position.copy(van.position).addScaledVector(world.env.sunDirection, 130)
      sun.target.position.set(van.position.x, 0, van.position.z)
    }

    updateBurst(dt)
    world.update(time)
    renderer.render(scene, camera)
    publish()
  }

  // ------------------------------------------------------------------------------------ loading
  const setProgress = (p: number) => {
    progress = p
    publish(true)
  }
  loadVan((r) => setProgress(r * 0.5))
    .then(async (rig) => {
      if (disposed) return
      scene.add(rig.root)
      rig.setHeadlights(true)
      van = new VanController(rig)
      van.teleport(spawnPos.clone(), spawnHeading)
      setProgress(0.55)
      const [c, b] = await Promise.all([
        buildCollectibles(scene, track, shortcut, world.env.heightAt),
        buildBots(scene, track),
      ])
      if (disposed) return
      collectibles = c
      bots = b
      setProgress(0.75)
      await world.ready
      setProgress(0.9)
      await world.env.ready
      if (scene.fog) scene.fog.color.set(0xbfcdd9)
    })
    .catch((err) => console.error('game failed to load', err))
    .finally(() => {
      if (disposed) return
      phase = 'ready'
      setProgress(1)
    })

  tick()

  if (process.env.NODE_ENV !== 'production') {
    ;(window as unknown as { __game?: unknown }).__game = {
      scene,
      camera,
      get van() {
        return van
      },
      snapshot,
      start,
      press: (k: string) => keys.add(k),
      release: (k: string) => keys.delete(k),
      teleport: (u: number) => {
        const s = track.at(u)
        van?.teleport(s.point.clone(), Math.atan2(s.tangent.x, s.tangent.z))
      },
      setPhase: (p: RacePhase) => {
        phase = p
      },
      /** Park the van at u and look at it from (lateral, height, back) metres away. */
      view: (u: number, lateral: number, height: number, back: number, lookAhead = 0) => {
        const s = track.at(u)
        van?.teleport(s.point.clone(), Math.atan2(s.tangent.x, s.tangent.z))
        const pos = s.point.clone().addScaledVector(s.normal, lateral).addScaledVector(s.tangent, -back)
        pos.y += height
        const look = track.at(u + lookAhead / track.length).point.clone()
        look.y += 1.5
        camOverride = { pos, look }
      },
      freeCamera: () => {
        camOverride = null
      },
    }
  }

  return {
    start,
    restart: () => {
      phase = 'ready'
      resetRun()
      start()
    },
    setTouch: (input) => {
      touch.throttle = input.throttle
      touch.steer = input.steer
      touch.brake = input.brake
    },
    subscribe: (cb) => {
      listeners.add(cb)
      cb(snapshot())
      return () => listeners.delete(cb)
    },
    on: (cb) => {
      eventListeners.add(cb)
      return () => eventListeners.delete(cb)
    },
    getSnapshot: snapshot,
    destroy: () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      collectibles?.dispose()
      bots?.dispose()
      world.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
