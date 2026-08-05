import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import {
  Color,
  DynamicDrawUsage,
  Euler,
  IcosahedronGeometry,
  InstancedMesh,
  Object3D,
  Quaternion,
  Sphere,
  Vector3,
  type BufferGeometry,
  type MeshStandardMaterial,
} from 'three'
import { beltLocalToWorld } from '@/loot/buffs'
import {
  rollAsteroidType,
  type MaterialKind,
} from '@/loot/economy'
import { NIGHT_ROCK_HEX } from '@/lore/easterEggs'
import {
  applyAsteroidTextureParams,
  createAsteroidMaterial,
  DEFAULT_ASTEROID_TEXTURE,
  type AsteroidTextureParams,
} from '@/world/asteroidMaterial'
import { circularOrbitSpeed } from '@/world/gravity'
import type { HazardField } from '@/ship/PlayerShip'

export type AsteroidShapeParams = {
  /** Icosahedron subdivision (cols = detail + 1) */
  meshDetail: number
  /** Broad lobe strength */
  largeLumps: number
  /** Mid-frequency lump strength */
  mediumLumps: number
  /** Fine surface lump strength */
  fineLumps: number
}

export const DEFAULT_ASTEROID_SHAPE: AsteroidShapeParams = {
  meshDetail: 3,
  largeLumps: 0.3,
  mediumLumps: 0.08,
  fineLumps: 0.07,
}

type AsteroidBeltProps = {
  sunPosition: [number, number, number]
  mu: number
  /**
   * Scales circular-orbit speed (and matching μ).
   * Match planet orbitSpeedScale so the system shares one clock.
   */
  orbitSpeedScale?: number
  /** Inner edge of the belt (from sun center) */
  innerRadius?: number
  /** Outer edge of the belt */
  outerRadius?: number
  count?: number
  /** Vertical half-thickness */
  thickness?: number
  /** Multiplier on rock instance scale / hit radius */
  sizeScale?: number
  /** Orbital plane tilt (radians) */
  inclination?: number
  shape?: AsteroidShapeParams
  texture?: AsteroidTextureParams
  paused?: boolean
  /** Exposes lethal hit-tests + laser impacts for the player ship */
  hazardRef?: RefObject<HazardField | null>
  /** Fired in world space when a rock is laser-destroyed (vaporize or split). */
  onRockDestroyed?: (
    worldPosition: Vector3,
    kind: MaterialKind,
    flags?: { nightShard?: boolean },
  ) => void
  /** Bump to rebuild the belt (e.g. when docking at a station). */
  resetSeed?: number
}

type Rock = {
  alive: boolean
  /** Keplerian belt rock vs free-flying fragment */
  orbiting: boolean
  /** Orbital radius / angle (orbiting only) */
  orbitRadius: number
  theta: number
  /** Belt-local position (always kept in sync for orbiting rocks) */
  x: number
  y: number
  z: number
  /** Belt-local velocity (debris); orbital rocks ignore this while orbiting */
  vx: number
  vy: number
  vz: number
  sx: number
  sy: number
  sz: number
  /** Approx collision radius (unit icosahedron × max scale) */
  hitRadius: number
  spin: number
  angle: number
  /** Remaining life for debris (seconds) */
  life: number
  /**
   * Rock–rock collision immunity (seconds). Fresh split fragments use this so
   * the spray can separate before sibling contacts cancel their kick.
   */
  collideGrace: number
  /** Composition type — drives body color and loot weighting */
  kind: MaterialKind
  color: Color
  /** Lore omen rock — wrong tint; drops a night shard once destroyed */
  isNight: boolean
  /** Index into orbitingList / debrisList for O(1) swap-remove; -1 if dead */
  listPos: number
}

/** Swap-remove `rockIndex` from a compact live list using each rock's listPos. */
function removeFromLiveList(
  list: number[],
  rocks: Rock[],
  rockIndex: number,
) {
  const rock = rocks[rockIndex]
  const pos = rock.listPos
  if (pos < 0) return
  const last = list.length - 1
  if (pos !== last) {
    const swapped = list[last]
    list[pos] = swapped
    rocks[swapped].listPos = pos
  }
  list.pop()
  rock.listPos = -1
}

function addToLiveList(list: number[], rockIndex: number, rock: Rock) {
  rock.listPos = list.length
  list.push(rockIndex)
}

/** Pieces smaller than this are vaporized instead of splitting further. */
const MIN_HIT_RADIUS = 1.25
/** Base fragment count for a mid-size rock (scales up with parent size) */
const MIN_FRAGMENTS = 2
const MAX_FRAGMENTS = 7
const FRAG_SCALE_MIN = 0.34
const FRAG_SCALE_MAX = 0.5
/** Soft cap on fragment radius for a mid-size parent (grows with parent) */
const MAX_FRAG_HIT_RADIUS = 2.4
const DEBRIS_LIFE = 18
/** Knocked-off belt rocks linger much longer than laser chips */
const BELT_KNOCK_LIFE = 140
/** Outward spray speed added on top of parent + impact kick */
const FRAG_EJECT = 5.5
const DEBRIS_KICK = 7.2
/** Parent hitRadius at which debris kick / fragment scaling is ~1× */
const DEBRIS_KICK_REF_RADIUS = 4
/** Orbiting rocks drift buckets slowly — rebuild at this interval */
const ORBIT_HASH_INTERVAL = 0.4

/**
 * Rock–rock collisions (closing speed along contact normal).
 * Soft contacts bounce; hard impacts may shatter — weighted by relative size
 * so chip debris rarely cascades through the whole belt.
 */
/** Below this closing speed — positional push only (overlap from spawn / graze). */
const BOUNCE_MIN_CLOSING = 0.45
/** Base closing speed before a hard impact can be considered. */
const DESTROY_CLOSING = 1.55
const COLLISION_RESTITUTION = 0.4
/** Cap cascade work so a debris swarm can’t stall the frame. */
const MAX_HARD_COLLISIONS_PER_FRAME = 16
const MAX_SOFT_COLLISIONS_PER_FRAME = 480
/** 2D hash for pair broadphase (angle × radial). */
const COLL_ANG_BUCKETS = 64
const COLL_RAD_BUCKETS = 14
const COLL_CELL_COUNT = COLL_ANG_BUCKETS * COLL_RAD_BUCKETS

const _dummy = new Object3D()
const _boundCenter = new Vector3()
const _local = new Vector3()
const _localTo = new Vector3()
const _impactDir = new Vector3()
const _dropWorld = new Vector3()
const _fragColor = new Color()
const _hitLocal = new Vector3()
const _hitEuler = new Euler()
const _hitQuat = new Quaternion()
const _losSeg = new Vector3()
const _losClosest = new Vector3()
const _collN = new Vector3()
const _collNegN = new Vector3()
const _velA = { vx: 0, vy: 0, vz: 0 }
const _velB = { vx: 0, vy: 0, vz: 0 }

/**
 * Collision / LOS surface vs unit mesh scale.
 * Lumps push verts ~0.78–1.22; stay under typical peaks so skimming is possible.
 */
const HIT_SURFACE = 0.86
/** Slightly generous vs laser hit so visual overlaps actually resolve. */
const COLLIDE_RADIUS_SCALE = HIT_SURFACE * 1.05
/** Covers largest rock search keys when querying nearby buckets. */
const ROCK_SEARCH_PAD = 36

/** Angular sectors for belt hazard queries (thin torus → 1D hash). */
const BUCKET_COUNT = 64
const BUCKET_SPAN = (Math.PI * 2) / BUCKET_COUNT

/** Ellipsoid hit against a rock’s scaled / spun mesh (belt-local coords). */
function pointHitsRock(
  rock: Rock,
  lx: number,
  ly: number,
  lz: number,
  pad: number,
): boolean {
  _hitLocal.set(lx - rock.x, ly - rock.y, lz - rock.z)
  _hitEuler.set(rock.angle * 0.7, rock.angle, rock.angle * 0.35)
  _hitQuat.setFromEuler(_hitEuler)
  _hitLocal.applyQuaternion(_hitQuat.invert())
  const rx = rock.sx * HIT_SURFACE + pad
  const ry = rock.sy * HIT_SURFACE + pad
  const rz = rock.sz * HIT_SURFACE + pad
  if (rx < 1e-6 || ry < 1e-6 || rz < 1e-6) return false
  const nx = _hitLocal.x / rx
  const ny = _hitLocal.y / ry
  const nz = _hitLocal.z / rz
  return nx * nx + ny * ny + nz * nz < 1
}

/** Bounding-sphere segment hit (belt-local) — used for LOS sweeps. */
function segmentHitsRockSphere(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  rock: Rock,
): boolean {
  const r = rock.hitRadius * HIT_SURFACE
  if (r < 1e-6) return false
  const r2 = r * r
  // Skip if either endpoint is inside (spotter / prey sitting in a pocket)
  const dax = ax - rock.x
  const day = ay - rock.y
  const daz = az - rock.z
  if (dax * dax + day * day + daz * daz < r2) return false
  const dbx = bx - rock.x
  const dby = by - rock.y
  const dbz = bz - rock.z
  if (dbx * dbx + dby * dby + dbz * dbz < r2) return false

  _losSeg.set(bx - ax, by - ay, bz - az)
  const abLenSq = _losSeg.lengthSq()
  if (abLenSq < 1e-12) return false
  _losClosest.set(rock.x - ax, rock.y - ay, rock.z - az)
  let t = _losClosest.dot(_losSeg) / abLenSq
  if (t < 0) t = 0
  else if (t > 1) t = 1
  const cx = ax + _losSeg.x * t - rock.x
  const cy = ay + _losSeg.y * t - rock.y
  const cz = az + _losSeg.z * t - rock.z
  return cx * cx + cy * cy + cz * cz < r2
}

/** Deterministic PRNG so the belt layout stays stable across remounts. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Cheap 3D hash in [0, 1) for rocky vertex displacement. */
function hashNoise(x: number, y: number, z: number) {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
  return n - Math.floor(n)
}

/**
 * Macro silhouette + radial smooth normals. IcosahedronGeometry is
 * non-indexed, so computeVertexNormals() would bake FLAT face normals.
 * Fine grit lives in the fragment shader.
 */
function createAsteroidGeometry(shape: AsteroidShapeParams): BufferGeometry {
  const detail = Math.max(1, Math.min(8, Math.round(shape.meshDetail)))
  const geo = new IcosahedronGeometry(1, detail)
  const pos = geo.attributes.position
  const nrm = geo.attributes.normal
  const v = new Vector3()
  const a1 = shape.largeLumps
  const a2 = shape.mediumLumps
  const a3 = shape.fineLumps
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const n1 = hashNoise(v.x * 1.7, v.y * 1.7, v.z * 1.7)
    const n2 = hashNoise(v.x * 4.1 + 3.1, v.y * 4.1, v.z * 4.1 + 1.7)
    const n3 = hashNoise(v.x * 9.3, v.y * 9.3 + 2.4, v.z * 9.3)
    const bump = (n1 - 0.5) * a1 + (n2 - 0.5) * a2 + (n3 - 0.5) * a3
    v.multiplyScalar(1 + bump)
    pos.setXYZ(i, v.x, v.y, v.z)
    // Radial normals stay smooth across seams on non-indexed meshes
    v.normalize()
    nrm.setXYZ(i, v.x, v.y, v.z)
  }
  pos.needsUpdate = true
  nrm.needsUpdate = true
  geo.computeBoundingSphere()
  return geo
}

/**
 * Per-instance color within a type family.
 * Ore spans charcoal → taupe → pale clay so the belt doesn’t look painted.
 */
function rockColor(kind: MaterialKind, rand: () => number, base?: Color) {
  if (base) {
    return base
      .clone()
      .offsetHSL(
        (rand() - 0.5) * 0.015,
        (rand() - 0.5) * 0.03,
        (rand() - 0.5) * 0.08,
      )
  }
  const color = new Color()
  if (kind === 'ore') {
    // Dusty browns / warm grays — wide lightness, low sat
    color.setHSL(
      0.055 + rand() * 0.045,
      0.06 + rand() * 0.14,
      0.18 + rand() * 0.38,
    )
  } else if (kind === 'ice') {
    // Pale ash / off-white — stay light, nearly neutral
    color.setHSL(
      0.55 + rand() * 0.06,
      0.015 + rand() * 0.04,
      0.58 + rand() * 0.22,
    )
  } else {
    // Alloy — mid gray with a faint warm cast, between ore and ice
    color.setHSL(
      0.08 + rand() * 0.05,
      0.05 + rand() * 0.09,
      0.26 + rand() * 0.26,
    )
  }
  return color
}

function syncOrbitPosition(rock: Rock) {
  rock.x = Math.cos(rock.theta) * rock.orbitRadius
  rock.z = Math.sin(rock.theta) * rock.orbitRadius
}

function orbitalVelocity(
  rock: Rock,
  effectiveMu: number,
  out: { vx: number; vy: number; vz: number },
) {
  const speed = circularOrbitSpeed(effectiveMu, rock.orbitRadius)
  // Same sense as planets: up × radius = (sin θ, 0, -cos θ) → θ decreases
  out.vx = Math.sin(rock.theta) * speed
  out.vy = 0
  out.vz = -Math.cos(rock.theta) * speed
}

function makePool(
  count: number,
  capacity: number,
  innerRadius: number,
  outerRadius: number,
  thickness: number,
  sizeScale: number,
): Rock[] {
  const rand = mulberry32(0xa57e01d)
  const rocks: Rock[] = []
  const span = Math.max(outerRadius - innerRadius, 1)
  const scale = Math.max(0.05, sizeScale)

  for (let i = 0; i < capacity; i++) {
    if (i < count) {
      const u = Math.pow(rand(), 0.85)
      const orbitRadius = innerRadius + span * u
      // Power < 1 biases toward larger rocks; wide range for more variety
      const size = (1.65 + Math.pow(rand(), 0.55) * 13.6) * scale
      // Independent axis stretches → potato / slab / elongated shapes
      const sx = size * (0.32 + Math.pow(rand(), 0.65) * 1.7)
      const sy = size * (0.28 + Math.pow(rand(), 0.65) * 1.65)
      const sz = size * (0.28 + Math.pow(rand(), 0.65) * 1.65)
      const theta = rand() * Math.PI * 2
      const y = (rand() - 0.5) * 2 * thickness * (0.35 + rand() * 0.65)
      const kind = rollAsteroidType(rand)

      const rock: Rock = {
        alive: true,
        orbiting: true,
        orbitRadius,
        theta,
        x: 0,
        y,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        sx,
        sy,
        sz,
        hitRadius: Math.max(sx, sy, sz),
        spin: (rand() - 0.5) * 0.8,
        angle: rand() * Math.PI * 2,
        life: 0,
        collideGrace: 0,
        kind,
        color: rockColor(kind, rand),
        isNight: false,
        listPos: i,
      }
      syncOrbitPosition(rock)
      rocks.push(rock)
    } else {
      rocks.push({
        alive: false,
        orbiting: false,
        orbitRadius: 0,
        theta: 0,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        sx: 0,
        sy: 0,
        sz: 0,
        hitRadius: 0,
        spin: 0,
        angle: 0,
        life: 0,
        collideGrace: 0,
        kind: 'ore',
        color: new Color('#000000'),
        isNight: false,
        listPos: -1,
      })
    }
  }

  // Fixed omen rock — always present, slightly wrong color, one night shard
  if (count > 0) {
    const omenRand = mulberry32(0x6e7978) // "nyx"
    const omenIdx = Math.floor(omenRand() * count)
    const omen = rocks[omenIdx]
    omen.isNight = true
    omen.color = new Color(NIGHT_ROCK_HEX)
  }

  return rocks
}

function writeMatrix(inst: InstancedMesh, index: number, rock: Rock) {
  if (!rock.alive) {
    _dummy.position.set(0, 0, 0)
    _dummy.scale.set(0, 0, 0)
  } else {
    _dummy.position.set(rock.x, rock.y, rock.z)
    _dummy.rotation.set(rock.angle * 0.7, rock.angle, rock.angle * 0.35)
    _dummy.scale.set(rock.sx, rock.sy, rock.sz)
  }
  _dummy.updateMatrix()
  inst.setMatrixAt(index, _dummy.matrix)
}

function writeInstance(inst: InstancedMesh, index: number, rock: Rock) {
  writeMatrix(inst, index, rock)
  inst.setColorAt(index, rock.color)
}

function worldToLocal(
  point: Vector3,
  sun: [number, number, number],
  tilt: number,
  out: Vector3,
) {
  const dx = point.x - sun[0]
  const dy = point.y - sun[1]
  const dz = point.z - sun[2]
  const cosI = Math.cos(tilt)
  const sinI = Math.sin(tilt)
  out.set(dx, dy * cosI + dz * sinI, -dy * sinI + dz * cosI)
}

function worldDirToLocal(dir: Vector3, tilt: number, out: Vector3) {
  const cosI = Math.cos(tilt)
  const sinI = Math.sin(tilt)
  out.set(dir.x, dir.y * cosI + dir.z * sinI, -dir.y * sinI + dir.z * cosI)
}

function angleBucket(x: number, z: number) {
  const angle = Math.atan2(z, x) // −π..π
  let idx = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * BUCKET_COUNT)
  if (idx < 0) idx = 0
  if (idx >= BUCKET_COUNT) idx = BUCKET_COUNT - 1
  return idx
}

/** Broadphase cell for rock–rock pairs (angle × radius). */
function collideCell(
  x: number,
  z: number,
  innerRadius: number,
  outerRadius: number,
) {
  const angle = Math.atan2(z, x)
  let ang = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * COLL_ANG_BUCKETS)
  if (ang < 0) ang = 0
  if (ang >= COLL_ANG_BUCKETS) ang = COLL_ANG_BUCKETS - 1
  const r = Math.hypot(x, z)
  const span = Math.max(outerRadius - innerRadius, 1)
  let rad = Math.floor(((r - innerRadius) / span) * COLL_RAD_BUCKETS)
  if (rad < 0) rad = 0
  if (rad >= COLL_RAD_BUCKETS) rad = COLL_RAD_BUCKETS - 1
  return ang * COLL_RAD_BUCKETS + rad
}

function rockMass(rock: Rock) {
  const r = Math.max(rock.hitRadius, 0.35)
  return r * r * r
}

/**
 * Size-weighted shatter decision for a hard hit.
 * Smaller bodies break more readily; larger ones need a size-matched slam
 * (or a lucky roll when the striker isn't tiny).
 */
function resolveHardCollision(
  rA: number,
  rB: number,
  closing: number,
  rand: () => number,
): { breakA: boolean; breakB: boolean } {
  if (closing < DESTROY_CLOSING) {
    return { breakA: false, breakB: false }
  }

  const rSmall = Math.min(rA, rB)
  const rLarge = Math.max(rA, rB)
  const ratio = rSmall / Math.max(rLarge, 0.35)
  const aIsSmaller = rA <= rB
  const excess = Math.max(0, closing / DESTROY_CLOSING - 1)

  // Smaller rock — fractures once the hit is genuinely hard
  const breakSmall =
    closing >= DESTROY_CLOSING * (0.5 + ratio * 0.35)

  // Larger rock — tiny strikers almost never crater it; similar sizes can
  const sizeWeight = ratio * ratio
  const breakLargeChance = Math.min(
    0.55,
    sizeWeight * (0.07 + excess * 0.34),
  )
  const breakLarge =
    closing >= DESTROY_CLOSING * (1.15 + (1 - ratio) * 1.85) &&
    rand() < breakLargeChance

  // Near-equal mass slam — both can go, but not every contact
  const similarSlam =
    ratio > 0.62 &&
    closing >= DESTROY_CLOSING * 1.55 &&
    rand() < 0.16 + ratio * 0.26

  let breakSmaller = breakSmall
  let breakLarger = breakLarge || similarSlam

  // Mismatch: don't routinely delete a belt rock off a dust chip
  if (ratio < 0.32 && breakLarger && !breakSmaller) {
    breakLarger = rand() < breakLargeChance * 0.15
  }

  return {
    breakA: aIsSmaller ? breakSmaller : breakLarger,
    breakB: aIsSmaller ? breakLarger : breakSmaller,
  }
}

export function AsteroidBelt({
  sunPosition,
  mu,
  orbitSpeedScale = 0.1,
  innerRadius = 1727,
  outerRadius = 2273,
  count = 6000,
  thickness = 16,
  sizeScale = 1,
  inclination = 0.06,
  shape = DEFAULT_ASTEROID_SHAPE,
  texture = DEFAULT_ASTEROID_TEXTURE,
  paused = false,
  hazardRef,
  onRockDestroyed,
  resetSeed = 0,
}: AsteroidBeltProps) {
  // Debris slots only — orbiting rocks stay in the base count
  const capacity = useMemo(() => count + Math.max(768, count), [count])
  const mesh = useRef<InstancedMesh>(null!)
  const geometry = useMemo(
    () =>
      createAsteroidGeometry({
        meshDetail: shape.meshDetail,
        largeLumps: shape.largeLumps,
        mediumLumps: shape.mediumLumps,
        fineLumps: shape.fineLumps,
      }),
    [shape.meshDetail, shape.largeLumps, shape.mediumLumps, shape.fineLumps],
  )
  const material = useMemo(
    () => createAsteroidMaterial(DEFAULT_ASTEROID_TEXTURE),
    [],
  )
  useLayoutEffect(
    () => () => {
      geometry.dispose()
    },
    [geometry],
  )
  useLayoutEffect(() => () => material.dispose(), [material])
  useLayoutEffect(() => {
    if (mesh.current) mesh.current.geometry = geometry
  }, [geometry])
  useLayoutEffect(() => {
    applyAsteroidTextureParams(material as MeshStandardMaterial, {
      rockFreq: texture.rockFreq,
      rockBump: texture.rockBump,
      rockContrast: texture.rockContrast,
      roughness: texture.roughness,
      metalness: texture.metalness,
    })
  }, [
    material,
    texture.rockFreq,
    texture.rockBump,
    texture.rockContrast,
    texture.roughness,
    texture.metalness,
  ])
  const rocks = useMemo(
    () =>
      makePool(count, capacity, innerRadius, outerRadius, thickness, sizeScale),
    [count, capacity, innerRadius, outerRadius, thickness, sizeScale, resetSeed],
  )
  const rocksRef = useRef(rocks)
  rocksRef.current = rocks
  const sizeScaleRef = useRef(sizeScale)
  sizeScaleRef.current = sizeScale
  /** O(1) dead-slot stack — avoids scanning the whole pool on each fragment */
  const freeSlots = useRef<number[]>([])
  /** Compact live indices — useFrame / collision never scan the full pool */
  const orbitingList = useRef<number[]>([])
  const debrisList = useRef<number[]>([])
  const spatialRef = useRef({
    dirty: true,
    buckets: Array.from({ length: BUCKET_COUNT }, () => [] as number[]),
  })
  const orbitHashTimer = useRef(0)
  useLayoutEffect(() => {
    const free: number[] = []
    const orbiting: number[] = []
    for (let i = 0; i < rocks.length; i++) {
      const rock = rocks[i]
      if (!rock.alive) {
        free.push(i)
        rock.listPos = -1
        continue
      }
      rock.listPos = orbiting.length
      orbiting.push(i)
    }
    freeSlots.current = free
    orbitingList.current = orbiting
    debrisList.current = []
    spatialRef.current.dirty = true
  }, [rocks])
  // v ∝ √μ — scale μ by k² so circular speed becomes k·v (matches planets)
  const effectiveMu = mu * orbitSpeedScale * orbitSpeedScale
  const muRef = useRef(effectiveMu)
  muRef.current = effectiveMu
  const randRef = useRef(mulberry32(0x51a7e01d))
  const onDestroyedRef = useRef(onRockDestroyed)
  onDestroyedRef.current = onRockDestroyed
  const orbitRef = useRef({
    sunPosition,
    inclination,
    innerRadius,
    outerRadius,
    thickness,
  })
  orbitRef.current = {
    sunPosition,
    inclination,
    innerRadius,
    outerRadius,
    thickness,
  }
  const scratchVel = useRef({ vx: 0, vy: 0, vz: 0 })
  const splitRockRef = useRef<(index: number, impactLocal: Vector3) => void>(
    () => {},
  )
  const collCells = useRef(
    Array.from({ length: COLL_CELL_COUNT }, () => [] as number[]),
  )

  const markSpatialDirty = () => {
    spatialRef.current.dirty = true
  }

  /** Capture belt-local velocity (orbital or free). */
  const sampleVelocity = (
    rock: Rock,
    out: { vx: number; vy: number; vz: number },
  ) => {
    if (rock.orbiting) {
      orbitalVelocity(rock, muRef.current, out)
    } else {
      out.vx = rock.vx
      out.vy = rock.vy
      out.vz = rock.vz
    }
  }

  /** Leave Keplerian rails as long-lived debris (soft bounce knock). */
  const knockFromOrbit = (index: number) => {
    const list = rocksRef.current
    const rock = list[index]
    if (!rock.alive || !rock.orbiting) return
    orbitalVelocity(rock, muRef.current, scratchVel.current)
    rock.vx = scratchVel.current.vx
    rock.vy = scratchVel.current.vy
    rock.vz = scratchVel.current.vz
    removeFromLiveList(orbitingList.current, list, index)
    rock.orbiting = false
    rock.orbitRadius = 0
    rock.theta = 0
    rock.life = BELT_KNOCK_LIFE * (0.85 + randRef.current() * 0.3)
    rock.collideGrace = 0
    addToLiveList(debrisList.current, index, rock)
    markSpatialDirty()
  }

  /**
   * Resolve rock–rock pairs.
   * Soft closing speed → bounce; hard → destroy both.
   * Checks each cell’s 3×3 neighborhood so boundary overlaps aren’t missed.
   */
  const resolveRockCollisions = () => {
    const list = rocksRef.current
    const { innerRadius: inner, outerRadius: outer } = orbitRef.current
    const cells = collCells.current
    for (let c = 0; c < cells.length; c++) cells[c].length = 0

    const pushLive = (indices: number[]) => {
      for (let n = 0; n < indices.length; n++) {
        const index = indices[n]
        const rock = list[index]
        if (!rock.alive || rock.hitRadius < 1e-4) continue
        cells[collideCell(rock.x, rock.z, inner, outer)].push(index)
      }
    }
    pushLive(orbitingList.current)
    pushLive(debrisList.current)

    let hardLeft = MAX_HARD_COLLISIONS_PER_FRAME
    let softLeft = MAX_SOFT_COLLISIONS_PER_FRAME
    const inst = mesh.current
    let touched = false

    for (let c = 0; c < cells.length; c++) {
      const home = cells[c]
      if (home.length === 0) continue

      const homeAng = Math.floor(c / COLL_RAD_BUCKETS)
      const homeRad = c % COLL_RAD_BUCKETS

      for (let a = 0; a < home.length; a++) {
        const i = home[a]
        const A = list[i]
        if (!A.alive) continue
        const rA = A.hitRadius * COLLIDE_RADIUS_SCALE

        for (let da = -1; da <= 1; da++) {
          let ang = homeAng + da
          if (ang < 0) ang += COLL_ANG_BUCKETS
          else if (ang >= COLL_ANG_BUCKETS) ang -= COLL_ANG_BUCKETS

          for (let dr = -1; dr <= 1; dr++) {
            const rad = homeRad + dr
            if (rad < 0 || rad >= COLL_RAD_BUCKETS) continue
            const cell = cells[ang * COLL_RAD_BUCKETS + rad]
            for (let b = 0; b < cell.length; b++) {
              const j = cell[b]
              // Each unordered pair once
              if (j <= i) continue
              const B = list[j]
              if (!B.alive) continue

              const rB = B.hitRadius * COLLIDE_RADIUS_SCALE
              const dx = B.x - A.x
              const dy = B.y - A.y
              const dz = B.z - A.z
              const distSq = dx * dx + dy * dy + dz * dz
              const minDist = rA + rB
              if (distSq >= minDist * minDist || distSq < 1e-10) continue

              const dist = Math.sqrt(distSq)
              const inv = 1 / dist
              const nx = dx * inv
              const ny = dy * inv
              const nz = dz * inv

              sampleVelocity(A, _velA)
              sampleVelocity(B, _velB)
              const rvx = _velB.vx - _velA.vx
              const rvy = _velB.vy - _velA.vy
              const rvz = _velB.vz - _velA.vz
              // Positive when approaching along the contact normal (A → B)
              const closing = -(rvx * nx + rvy * ny + rvz * nz)

              const { breakA, breakB } = resolveHardCollision(
                A.hitRadius,
                B.hitRadius,
                closing,
                randRef.current,
              )
              if ((breakA || breakB) && hardLeft > 0) {
                hardLeft -= 1
                touched = true
                _collN.set(nx, ny, nz)
                _collNegN.set(-nx, -ny, -nz)
                if (breakA) splitRockRef.current(i, _collN)
                if (breakB && list[j].alive) splitRockRef.current(j, _collNegN)
                continue
              }

              // Fragment clouds: no soft bounce — ejection carries them apart
              if (!A.orbiting && !B.orbiting) continue

              // Separating contacts still need overlap push, but skip bounce impulse
              if (softLeft <= 0) continue
              softLeft -= 1
              touched = true

              const overlap = minDist - dist
              const mA = rockMass(A)
              const mB = rockMass(B)
              const invMassSum = 1 / (mA + mB)
              const pushA = overlap * mB * invMassSum
              const pushB = overlap * mA * invMassSum
              A.x -= nx * pushA
              A.y -= ny * pushA
              A.z -= nz * pushA
              B.x += nx * pushB
              B.y += ny * pushB
              B.z += nz * pushB

              if (A.orbiting) {
                A.orbitRadius = Math.hypot(A.x, A.z)
                A.theta = Math.atan2(A.z, A.x)
              }
              if (B.orbiting) {
                B.orbitRadius = Math.hypot(B.x, B.z)
                B.theta = Math.atan2(B.z, B.x)
              }

              // Below bounce threshold (or separating): separate only
              if (closing < BOUNCE_MIN_CLOSING) {
                if (inst) {
                  writeMatrix(inst, i, A)
                  writeMatrix(inst, j, B)
                }
                continue
              }

              // Bounce — knock orbiters free so impulses stick
              if (A.orbiting) knockFromOrbit(i)
              if (B.orbiting) knockFromOrbit(j)
              if (!A.alive || !B.alive) continue

              const jImp =
                ((1 + COLLISION_RESTITUTION) * closing * mA * mB) /
                (mA + mB)
              const invMA = 1 / mA
              const invMB = 1 / mB
              A.vx -= jImp * invMA * nx
              A.vy -= jImp * invMA * ny
              A.vz -= jImp * invMA * nz
              B.vx += jImp * invMB * nx
              B.vy += jImp * invMB * ny
              B.vz += jImp * invMB * nz
              A.spin += (ny - nz) * 0.04
              B.spin -= (ny - nz) * 0.04

              if (inst) {
                writeMatrix(inst, i, A)
                writeMatrix(inst, j, B)
              }
            }
          }
        }
      }
    }

    if (touched && inst) inst.instanceMatrix.needsUpdate = true
    markSpatialDirty()
  }

  /** Rebuild angle buckets for orbiting rocks only (debris is checked separately). */
  const ensureBuckets = () => {
    const spatial = spatialRef.current
    if (!spatial.dirty) return
    spatial.dirty = false
    const { buckets } = spatial
    for (let b = 0; b < BUCKET_COUNT; b++) buckets[b].length = 0
    const list = rocksRef.current
    const orbiting = orbitingList.current
    for (let i = 0; i < orbiting.length; i++) {
      const index = orbiting[i]
      const rock = list[index]
      buckets[angleBucket(rock.x, rock.z)].push(index)
    }
  }

  /**
   * Visit nearby orbiting rocks via the spatial hash, then all debris
   * (debris count stays small; hashing it every frame was the shoot lag).
   * Return false from visit to stop early.
   */
  const forNearbyRocks = (
    lx: number,
    lz: number,
    searchPad: number,
    visit: (index: number, rock: Rock) => boolean | void,
  ) => {
    ensureBuckets()
    const { buckets } = spatialRef.current
    const rocks = rocksRef.current
    const radial = Math.hypot(lx, lz)
    const halfWidth = searchPad / Math.max(radial, 8)
    const span = Math.min(
      BUCKET_COUNT >> 1,
      1 + Math.ceil(halfWidth / BUCKET_SPAN),
    )
    const center = angleBucket(lx, lz)
    for (let d = -span; d <= span; d++) {
      let b = center + d
      if (b < 0) b += BUCKET_COUNT
      else if (b >= BUCKET_COUNT) b -= BUCKET_COUNT
      const cell = buckets[b]
      for (let i = 0; i < cell.length; i++) {
        const index = cell[i]
        if (visit(index, rocks[index]) === false) return
      }
    }

    // Debris stays off the angle hash so motion never forces a rebuild;
    // cheap XZ reject keeps this fine even with a few hundred fragments.
    const debris = debrisList.current
    for (let i = 0; i < debris.length; i++) {
      const index = debris[i]
      const rock = rocks[index]
      if (!rock.alive) continue
      const dx = rock.x - lx
      const dz = rock.z - lz
      const lim = rock.hitRadius + searchPad
      if (dx * dx + dz * dz > lim * lim) continue
      if (visit(index, rock) === false) return
    }
  }

  const findFreeSlot = () => {
    const slot = freeSlots.current.pop()
    return slot === undefined ? -1 : slot
  }

  const killRock = (index: number, updateMesh = true) => {
    const list = rocksRef.current
    const rock = list[index]
    if (!rock.alive) return
    if (rock.orbiting) {
      removeFromLiveList(orbitingList.current, list, index)
      markSpatialDirty()
    } else {
      removeFromLiveList(debrisList.current, list, index)
    }
    rock.alive = false
    rock.orbiting = false
    rock.hitRadius = 0
    freeSlots.current.push(index)
    if (!updateMesh) return
    const inst = mesh.current
    if (!inst) return
    writeInstance(inst, index, rock)
  }

  const notifyDestroyed = (
    lx: number,
    ly: number,
    lz: number,
    kind: MaterialKind,
    nightShard = false,
  ) => {
    const { sunPosition: sun, inclination: tilt } = orbitRef.current
    beltLocalToWorld(lx, ly, lz, sun, tilt, _dropWorld)
    onDestroyedRef.current?.(
      _dropWorld,
      kind,
      nightShard ? { nightShard: true } : undefined,
    )
  }

  const splitRock = (index: number, impactLocal: Vector3) => {
    const list = rocksRef.current
    const parent = list[index]
    if (!parent.alive) return

    const rand = randRef.current
    const size = parent.hitRadius
    const sizeScale = Math.max(0.05, sizeScaleRef.current)
    const minHit = MIN_HIT_RADIUS * sizeScale
    const refRadius = DEBRIS_KICK_REF_RADIUS * sizeScale
    const sizeRatio = size / refRadius
    // Larger parents shed more / bigger chunks (still capped for fill-rate)
    const maxFrag = Math.min(
      size * 0.55,
      MAX_FRAG_HIT_RADIUS *
        sizeScale *
        Math.min(3.2, 0.85 + sizeRatio * 0.85),
    )
    const px = parent.x
    const py = parent.y
    const pz = parent.z
    const psx = parent.sx
    const psy = parent.sy
    const psz = parent.sz
    const parentKind = parent.kind
    const parentNight = parent.isNight
    _fragColor.copy(parent.color)

    // Small rocks vaporize — always a destroy event for loot
    if (size < minHit) {
      killRock(index)
      const inst = mesh.current
      if (inst) {
        inst.instanceMatrix.needsUpdate = true
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true
      }
      notifyDestroyed(px, py, pz, parentKind, parentNight)
      return
    }

    // Capture parent motion before freeing the slot
    let ovx = parent.vx
    let ovy = parent.vy
    let ovz = parent.vz
    if (parent.orbiting) {
      orbitalVelocity(parent, muRef.current, scratchVel.current)
      ovx = scratchVel.current.vx
      ovy = scratchVel.current.vy
      ovz = scratchVel.current.vz
    }

    killRock(index)

    // Heavier parent → slower spray (keeps orbital velocity; damps kick only)
    const kickScale = Math.min(
      1.35,
      Math.max(0.18, refRadius / size),
    )

    const fragCountMax = Math.min(
      MAX_FRAGMENTS,
      MIN_FRAGMENTS + Math.floor(sizeRatio * 2.2),
    )
    const fragments =
      MIN_FRAGMENTS +
      Math.floor(rand() * (fragCountMax - MIN_FRAGMENTS + 1))
    const fragScaleBoost = Math.min(1.75, 0.9 + sizeRatio * 0.4)
    const inst = mesh.current

    for (let f = 0; f < fragments; f++) {
      const fragScale =
        (FRAG_SCALE_MIN + rand() * (FRAG_SCALE_MAX - FRAG_SCALE_MIN)) *
        fragScaleBoost
      let sx = psx * fragScale * (0.75 + rand() * 0.5)
      let sy = psy * fragScale * (0.75 + rand() * 0.5)
      let sz = psz * fragScale * (0.75 + rand() * 0.5)
      let hitRadius = Math.max(sx, sy, sz)
      if (hitRadius > maxFrag) {
        const shrink = maxFrag / hitRadius
        sx *= shrink
        sy *= shrink
        sz *= shrink
        hitRadius = maxFrag
      }

      // Too small to bother simulating — already "destroyed"
      if (hitRadius < minHit * 0.85) continue

      const slot = findFreeSlot()
      if (slot < 0) break

      const kick = DEBRIS_KICK * (0.7 + rand() * 0.85) * kickScale
      const impactBoost = (1.4 + rand() * 2.2) * kickScale
      const eject = FRAG_EJECT * (0.75 + rand() * 0.65) * kickScale
      // Random spray + bias along laser impact
      const rx = (rand() - 0.5) * 2
      const ry = (rand() - 0.5) * 2
      const rz = (rand() - 0.5) * 2
      const rLen = Math.hypot(rx, ry, rz) || 1
      const ux = rx / rLen
      const uy = ry / rLen
      const uz = rz / rLen

      const child = list[slot]
      child.alive = true
      child.orbiting = false
      child.orbitRadius = 0
      child.theta = 0
      child.x = px + ux * hitRadius * 1.4
      child.y = py + uy * hitRadius * 1.4
      child.z = pz + uz * hitRadius * 1.4
      child.vx =
        ovx + ux * (kick + eject) + impactLocal.x * impactBoost
      child.vy =
        ovy + uy * (kick + eject) + impactLocal.y * impactBoost
      child.vz =
        ovz + uz * (kick + eject) + impactLocal.z * impactBoost
      child.sx = sx
      child.sy = sy
      child.sz = sz
      child.hitRadius = hitRadius
      child.spin = (rand() - 0.5) * 3.2 * kickScale
      child.angle = rand() * Math.PI * 2
      child.life = DEBRIS_LIFE * (0.7 + rand() * 0.6)
      child.collideGrace = 0
      child.kind = parentKind
      child.isNight = false
      child.color.copy(_fragColor)
      child.color.offsetHSL(
        (rand() - 0.5) * 0.01,
        (rand() - 0.5) * 0.02,
        (rand() - 0.5) * 0.06,
      )
      addToLiveList(debrisList.current, slot, child)

      if (inst) writeInstance(inst, slot, child)
    }

    if (inst) {
      inst.instanceMatrix.needsUpdate = true
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true
    }

    // Roll loot for every laser-destroyed rock (fragments can drop again later)
    notifyDestroyed(px, py, pz, parentKind, parentNight)
  }
  splitRockRef.current = splitRock

  useLayoutEffect(() => {
    if (!hazardRef) return

    hazardRef.current = {
      test(point, pad) {
        const {
          sunPosition: sun,
          inclination: tilt,
          innerRadius: inner,
          outerRadius: outer,
          thickness: tall,
        } = orbitRef.current

        worldToLocal(point, sun, tilt, _local)

        const radial = Math.hypot(_local.x, _local.z)
        // Debris can drift — keep the cull loose
        const margin = Math.max(outer * 0.35, 40) + pad
        const hasDebris = debrisList.current.length > 0
        if (radial > outer + margin) return false
        if (Math.abs(_local.y) > tall * 6 + pad) return false
        // Hollow center: only worth testing if debris may be inward
        if (radial < inner - margin && !hasDebris) return false

        let hit = false
        forNearbyRocks(
          _local.x,
          _local.z,
          pad + ROCK_SEARCH_PAD,
          (_index, rock) => {
            if (!rock.alive) return
            if (pointHitsRock(rock, _local.x, _local.y, _local.z, pad)) {
              hit = true
              return false
            }
          },
        )
        return hit
      },

      impact(point, pad, direction) {
        const {
          sunPosition: sun,
          inclination: tilt,
          innerRadius: inner,
          outerRadius: outer,
        } = orbitRef.current

        worldToLocal(point, sun, tilt, _local)
        worldDirToLocal(direction, tilt, _impactDir)
        if (_impactDir.lengthSq() > 1e-8) _impactDir.normalize()
        else _impactDir.set(1, 0, 0)

        const radial = Math.hypot(_local.x, _local.z)
        const margin = Math.max(outer * 0.35, 40) + pad
        if (
          (radial > outer + margin || radial < Math.max(0, inner - margin)) &&
          debrisList.current.length === 0
        ) {
          return false
        }

        let best = -1
        let bestDist = Infinity
        forNearbyRocks(
          _local.x,
          _local.z,
          pad + ROCK_SEARCH_PAD,
          (index, rock) => {
            if (!rock.alive) return
            if (!pointHitsRock(rock, _local.x, _local.y, _local.z, pad)) return
            const dx = rock.x - _local.x
            const dy = rock.y - _local.y
            const dz = rock.z - _local.z
            const distSq = dx * dx + dy * dy + dz * dz
            if (distSq < bestDist) {
              bestDist = distSq
              best = index
            }
          },
        )

        if (best < 0) return false
        splitRockRef.current(best, _impactDir)
        return true
      },

      occludes(from, to) {
        const {
          sunPosition: sun,
          inclination: tilt,
          innerRadius: inner,
          outerRadius: outer,
          thickness: tall,
        } = orbitRef.current

        worldToLocal(from, sun, tilt, _local)
        worldToLocal(to, sun, tilt, _localTo)

        const ax = _local.x
        const ay = _local.y
        const az = _local.z
        const bx = _localTo.x
        const by = _localTo.y
        const bz = _localTo.z
        const dx = bx - ax
        const dy = by - ay
        const dz = bz - az
        const dist = Math.hypot(dx, dy, dz)
        if (dist < 1e-5) return false

        // Quick belt proximity cull — segment far from the torus can't clip rocks
        const ra = Math.hypot(ax, az)
        const rb = Math.hypot(bx, bz)
        const minR = Math.min(ra, rb)
        const maxR = Math.max(ra, rb)
        const hasDebris = debrisList.current.length > 0
        const margin = Math.max(outer * 0.35, 40) + ROCK_SEARCH_PAD
        if (minR > outer + margin && !hasDebris) return false
        if (maxR < inner - margin && !hasDebris) return false
        if (Math.abs(ay) > tall * 8 + ROCK_SEARCH_PAD && Math.abs(by) > tall * 8 + ROCK_SEARCH_PAD) {
          return false
        }

        const step = Math.min(16, Math.max(5, dist / 48))
        const n = Math.min(96, Math.max(2, Math.ceil(dist / step)))
        let blocked = false
        for (let i = 0; i <= n && !blocked; i++) {
          const t = i / n
          const px = ax + dx * t
          const pz = az + dz * t
          forNearbyRocks(px, pz, step + ROCK_SEARCH_PAD, (_index, rock) => {
            if (segmentHitsRockSphere(ax, ay, az, bx, by, bz, rock)) {
              blocked = true
              return false
            }
          })
        }
        return blocked
      },
    }

    return () => {
      hazardRef.current = null
    }
  }, [hazardRef])

  useLayoutEffect(() => {
    const inst = mesh.current
    inst.instanceMatrix.setUsage(DynamicDrawUsage)

    for (let i = 0; i < rocks.length; i++) {
      writeInstance(inst, i, rocks[i])
    }

    if (inst.instanceColor) inst.instanceColor.needsUpdate = true
    inst.instanceMatrix.needsUpdate = true

    _boundCenter.set(0, 0, 0)
    inst.geometry.boundingSphere = new Sphere(
      _boundCenter,
      outerRadius * 1.6 + thickness + 40,
    )
  }, [rocks, outerRadius, thickness])

  useFrame((_, delta) => {
    if (paused) return
    const dt = Math.min(delta, 0.05)
    const inst = mesh.current
    const list = rocks
    const {
      outerRadius: outer,
      innerRadius: inner,
    } = orbitRef.current
    const maxDebrisR = outer * 1.85
    const minDebrisR = Math.max(inner * 0.35, 20)
    let matricesDirty = false

    const orbiting = orbitingList.current
    for (let n = 0; n < orbiting.length; n++) {
      const i = orbiting[n]
      const rock = list[i]
      const omega =
        circularOrbitSpeed(effectiveMu, rock.orbitRadius) / rock.orbitRadius
      // Decreasing θ — same orbital direction as the planets
      rock.theta -= omega * dt
      syncOrbitPosition(rock)
      rock.angle += rock.spin * dt
      writeMatrix(inst, i, rock)
      matricesDirty = true
    }

    const debris = debrisList.current
    for (let n = debris.length - 1; n >= 0; n--) {
      const i = debris[n]
      const rock = list[i]
      rock.x += rock.vx * dt
      rock.y += rock.vy * dt
      rock.z += rock.vz * dt
      rock.life -= dt
      if (rock.collideGrace > 0) {
        rock.collideGrace = Math.max(0, rock.collideGrace - dt)
      }

      const radial = Math.hypot(rock.x, rock.z)
      if (
        rock.life <= 0 ||
        radial > maxDebrisR ||
        radial < minDebrisR ||
        Math.abs(rock.y) > thickness * 6
      ) {
        // killRock swap-removes from debrisList; safe because we iterate backward
        killRock(i)
        matricesDirty = true
        continue
      }

      rock.angle += rock.spin * dt
      writeMatrix(inst, i, rock)
      matricesDirty = true
    }

    resolveRockCollisions()

    // Orbiting rocks cross buckets slowly — never rebuild for debris motion
    orbitHashTimer.current -= dt
    if (orbitHashTimer.current <= 0) {
      markSpatialDirty()
      orbitHashTimer.current = ORBIT_HASH_INTERVAL
    }

    if (matricesDirty) inst.instanceMatrix.needsUpdate = true
  })

  return (
    <group position={sunPosition} rotation={[inclination, 0, 0]}>
      <instancedMesh
        ref={mesh}
        args={[geometry, material, capacity]}
        material={material}
        castShadow={false}
        receiveShadow={false}
        frustumCulled={false}
      />
    </group>
  )
}
