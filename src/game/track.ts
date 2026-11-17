import * as THREE from 'three'

/** Road width in metres. The van is 2.5 m wide. */
export const ROAD_W = 10
export const SHOULDER_W = 1.2
/** The gravel shortcut is narrower and unpaved. */
export const SHORTCUT_W = 6

/**
 * The circuit, clockwise seen from above (+x right, +z down). About 950 m around.
 *
 * Sections, by waypoint index:
 *  0-2   start/finish straight in front of Clerk HQ (HQ on the -z side)
 *  3-6   the long right-hand sweep into the hairpin
 *  7-9   hairpin; the shortcut leaves after 6 and rejoins before 10
 *  11-13 tunnel through the rock outcrop
 *  14-17 forest section
 *  18-20 bridge over the stream, then the final bend to the line
 */
export const WAYPOINTS: Array<[number, number]> = [
  [-51, 0], // 0 start line
  [17, 0],
  [85, 2],
  [136, 12], // 3
  [174, 37],
  [197, 75],
  [202, 116], // 6 shortcut leaves here
  [189, 148], // 7 hairpin
  [158, 155],
  [134, 136], // 9
  [124, 104], // 10 shortcut rejoins
  [95, 87], // 11 tunnel mouth
  [51, 95],
  [14, 124], // 13 tunnel exit
  [-31, 151], // 14 forest
  [-83, 167],
  [-133, 151],
  [-163, 114], // 17
  [-167, 71], // 18 bridge
  [-150, 36],
  [-105, 10], // 20
]

/** Where the shortcut leaves and rejoins the main road, as waypoint-space anchors. */
export const SHORTCUT_POINTS: Array<[number, number]> = [
  [201, 102],
  [189, 117],
  [162, 116],
  [138, 108],
  [124, 104],
]

export type TrackSample = { point: THREE.Vector3; tangent: THREE.Vector3; normal: THREE.Vector3 }

/** Bridge hump: centred at the stream crossing, 2.2 m high, 70 m long. */
const BRIDGE_U = 0.845
const BRIDGE_HALF = 0.036
export const BRIDGE_HEIGHT = 2.2

export class Track {
  readonly curve: THREE.CatmullRomCurve3
  readonly length: number
  private readonly samples: THREE.Vector3[]
  private readonly tangents: THREE.Vector3[]

  constructor() {
    this.curve = new THREE.CatmullRomCurve3(
      WAYPOINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      true,
      'catmullrom',
      0.5,
    )
    this.length = this.curve.getLength()
    const n = 800
    this.samples = this.curve.getSpacedPoints(n)
    this.tangents = this.samples.map((_, i) =>
      this.curve
        .getTangentAt(i / n)
        .setY(0)
        .normalize(),
    )
  }

  /** Road surface height above the terrain at arc-length ratio u (the bridge hump). */
  elevation(u: number): number {
    const d = Math.abs(wrapDelta(u, BRIDGE_U))
    if (d > BRIDGE_HALF) return 0
    const t = 1 - d / BRIDGE_HALF
    return BRIDGE_HEIGHT * (t * t * (3 - 2 * t))
  }

  /** Point (with elevation), tangent and left-hand normal at arc-length ratio u ∈ [0, 1). */
  at(u: number): TrackSample {
    const t = ((u % 1) + 1) % 1
    const point = this.curve.getPointAt(t).setY(this.elevation(t))
    const tangent = this.curve.getTangentAt(t).setY(0).normalize()
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x)
    return { point, tangent, normal }
  }

  /** Closest sample to a world position: XZ distance from the centreline and its ratio. */
  nearest(p: THREE.Vector3): { distance: number; u: number; tangent: THREE.Vector3 } {
    let best = 0
    let bestD = Number.POSITIVE_INFINITY
    for (let i = 0; i < this.samples.length; i++) {
      const s = this.samples[i] as THREE.Vector3
      const d = (s.x - p.x) ** 2 + (s.z - p.z) ** 2
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    return {
      distance: Math.sqrt(bestD),
      u: best / this.samples.length,
      tangent: this.tangents[best] as THREE.Vector3,
    }
  }

  /** A ribbon mesh along the loop with UVs that run along its length (v, metres) and across (u). */
  buildRibbon(width: number, y: number, segments = 800, uStart = 0, uEnd = 1): THREE.BufferGeometry {
    return buildRibbon((u) => this.at(u), width, y, segments, uStart, uEnd)
  }
}

/** Signed shortest difference b→a on the unit loop. */
export function wrapDelta(a: number, b: number): number {
  let d = a - b
  d -= Math.round(d)
  return d
}

export function buildRibbon(
  sample: (u: number) => TrackSample,
  width: number,
  y: number,
  segments: number,
  uStart: number,
  uEnd: number,
): THREE.BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  let dist = 0
  let prev: THREE.Vector3 | null = null
  for (let i = 0; i <= segments; i++) {
    const { point, normal } = sample(uStart + ((uEnd - uStart) * i) / segments)
    if (prev) dist += point.distanceTo(prev)
    prev = point
    const l = point.clone().addScaledVector(normal, width / 2)
    const r = point.clone().addScaledVector(normal, -width / 2)
    positions.push(l.x, point.y + y, l.z, r.x, point.y + y, r.z)
    uvs.push(0, dist, 1, dist)
    if (i < segments) {
      const a = i * 2
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/** The gravel shortcut: an open spline between two points of the main road. */
export class Shortcut {
  readonly curve: THREE.CatmullRomCurve3
  readonly length: number
  private readonly samples: THREE.Vector3[]

  constructor() {
    this.curve = new THREE.CatmullRomCurve3(
      SHORTCUT_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      false,
      'catmullrom',
      0.5,
    )
    this.length = this.curve.getLength()
    this.samples = this.curve.getSpacedPoints(120)
  }

  at(u: number): TrackSample {
    const t = THREE.MathUtils.clamp(u, 0, 1)
    const point = this.curve.getPointAt(t)
    const tangent = this.curve.getTangentAt(t).setY(0).normalize()
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x)
    return { point, tangent, normal }
  }

  distance(p: THREE.Vector3): number {
    let bestD = Number.POSITIVE_INFINITY
    for (const s of this.samples) bestD = Math.min(bestD, (s.x - p.x) ** 2 + (s.z - p.z) ** 2)
    return Math.sqrt(bestD)
  }

  buildRibbon(width: number, y: number): THREE.BufferGeometry {
    return buildRibbon((u) => this.at(u), width, y, 120, 0, 1)
  }
}
