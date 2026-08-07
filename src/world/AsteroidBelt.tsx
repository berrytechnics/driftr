import { useFrame } from '@react-three/fiber'
import {
  useLayoutEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type RefObject,
} from 'react'
import {
  Color,
  DynamicDrawUsage,
  Euler,
  InstancedMesh,
  Object3D,
  Quaternion,
  Sphere,
  Vector3,
} from 'three'
import { beltLocalToWorld } from '@/loot/buffs'
import {
  rollAsteroidType,
  type MaterialKind,
} from '@/loot/economy'
import { NIGHT_SHARD_MAP_LABEL } from '@/lore/easterEggs'
import {
  applyBeltRockTextureParams,
  createBeltRockMaterial,
  useAsteroidShapeSet,
  type RockHalfExtents,
} from '@/world/asteroidModels'
import {
  DEFAULT_ASTEROID_TEXTURE,
  type AsteroidTextureParams,
} from '@/world/asteroidMaterial'
import { circularOrbitSpeed } from '@/world/gravity'
import type { HazardField } from '@/ship/PlayerShip'
import type { MapLorePing } from '@/map/systemMap'

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
  texture?: AsteroidTextureParams
  /**
   * Soft lavender auras on every alive night rock (and its debris).
   * For fields with many omens — Sol’s single-rock hunt stays subtle without this.
   */
  glowAllNightRocks?: boolean
  /**
   * Dev — publish the Sol omen rock as a clickable system-map ping.
   */
  showShardMapMarker?: boolean
  /** Shared map lore-ping list (sun-relative). Required for `showShardMapMarker`. */
  lorePingsRef?: MutableRefObject<MapLorePing[]>
  /**
   * Fraction of orbiting rocks tinted as night-omen (night shards on breakup).
   * Omit for Sol’s single fixed omen. Pass `0` for none.
   */
  nightFraction?: number
  /**
   * Number of cluster centers. Rocks not marked loose gather around these
   * (angular / radial / vertical spread via `clumpSpread`). `0` = uniform.
   */
  clumpCount?: number
  /** World-unit half-spread around each clump center (default 24). */
  clumpSpread?: number
  /** Fraction of rocks placed uniformly outside clumps (default 0.35). */
  looseRatio?: number
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
  /**
   * Oriented-ellipsoid half-axes (instance scale × unit-mesh AABB).
   * Broadphase uses hitRadius = max(cx, cy, cz).
   */
  cx: number
  cy: number
  cz: number
  /** Max collision half-axis — search / pair broadphase */
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
  /** Lore omen rock / its debris — night shards on breakup & terminal kills */
  isNight: boolean
  /**
   * Which InstancedMesh geometry this rock uses.
   * Normal pack: `[0, normalShapeCount)`, shard pack: after that.
   */
  shapeIndex: number
  /**
   * Dense slot inside that shape's InstancedMesh (`mesh.count` = live count).
   * `-1` when dead / not bound — critical so we never draw capacity×shapes.
   */
  instIndex: number
  /** Index into orbitingList / debrisList for O(1) swap-remove; -1 if dead */
  listPos: number
}

type MeshBelt = Array<InstancedMesh | null>

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
const MAX_SOFT_COLLISIONS_PER_FRAME = 96
/**
 * Soft contacts only resolve near the last hazard-query focus (player).
 * Hard shatter stays global (still budget-capped).
 */
const SOFT_PHYSICS_RADIUS = 180
const SOFT_PHYSICS_RADIUS_SQ = SOFT_PHYSICS_RADIUS * SOFT_PHYSICS_RADIUS
/** Skip soft entirely if no ship/laser query refreshed focus recently. */
const FOCUS_STALE_SEC = 0.5
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
 * Collision surface scale on fitted half-axes (mesh AABB × instance scale).
 * Slightly under 1 so skimming past silhouette edges still works.
 */
const HIT_SURFACE = 0.92
/** Slightly generous vs ship/laser so visual overlaps actually resolve. */
const COLLIDE_RADIUS_SCALE = HIT_SURFACE * 1.06
/** Covers largest rock search keys when querying nearby buckets. */
const ROCK_SEARCH_PAD = 36

/** Angular sectors for belt hazard queries (thin torus → 1D hash). */
const BUCKET_COUNT = 64
const BUCKET_SPAN = (Math.PI * 2) / BUCKET_COUNT

const _unitHalf: RockHalfExtents = { x: 1, y: 1, z: 1 }

/** Bake oriented collision axes from render scale + unit-mesh AABB. */
function syncCollisionAxes(rock: Rock, half: RockHalfExtents) {
  rock.cx = rock.sx * half.x
  rock.cy = rock.sy * half.y
  rock.cz = rock.sz * half.z
  rock.hitRadius = Math.max(rock.cx, rock.cy, rock.cz)
}

function setRockOrientation(rock: Rock) {
  _hitEuler.set(rock.angle * 0.7, rock.angle, rock.angle * 0.35)
  _hitQuat.setFromEuler(_hitEuler)
}

/**
 * Support radius of the rock’s spun collision ellipsoid along a unit world
 * direction (belt-local). Matches the visual non-uniform scale + mesh AABB.
 */
function ellipsoidSupportAlong(
  rock: Rock,
  nx: number,
  ny: number,
  nz: number,
  surface: number,
): number {
  _hitLocal.set(nx, ny, nz)
  setRockOrientation(rock)
  _hitLocal.applyQuaternion(_hitQuat.invert())
  const rx = rock.cx * surface
  const ry = rock.cy * surface
  const rz = rock.cz * surface
  const ax = rx * _hitLocal.x
  const ay = ry * _hitLocal.y
  const az = rz * _hitLocal.z
  return Math.sqrt(ax * ax + ay * ay + az * az)
}

/** Ellipsoid hit against a rock’s scaled / spun mesh (belt-local coords). */
function pointHitsRock(
  rock: Rock,
  lx: number,
  ly: number,
  lz: number,
  pad: number,
): boolean {
  _hitLocal.set(lx - rock.x, ly - rock.y, lz - rock.z)
  setRockOrientation(rock)
  _hitLocal.applyQuaternion(_hitQuat.invert())
  const rx = rock.cx * HIT_SURFACE + pad
  const ry = rock.cy * HIT_SURFACE + pad
  const rz = rock.cz * HIT_SURFACE + pad
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

function pickNormalShape(rand: () => number, normalShapeCount: number) {
  return Math.floor(rand() * Math.max(1, normalShapeCount))
}

function pickShardShape(
  rand: () => number,
  normalShapeCount: number,
  shardShapeCount: number,
) {
  return normalShapeCount + Math.floor(rand() * Math.max(1, shardShapeCount))
}

/**
 * Per-instance color within a type family.
 * Multiplies the pack albedo map — ice stays pale/cool, ore dusty, alloy muted.
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
    // Cool frost tint over the metallic pack albedo
    color.setHSL(
      0.55 + rand() * 0.06,
      0.08 + rand() * 0.12,
      0.62 + rand() * 0.22,
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

type PoolLayout = {
  clumpCount: number
  clumpSpread: number
  looseRatio: number
  /** `undefined` → exactly one omen (Sol). Otherwise mark that fraction. */
  nightFraction?: number
  normalShapeCount: number
  shardShapeCount: number
  halfExtents: RockHalfExtents[]
}

function makePool(
  count: number,
  capacity: number,
  innerRadius: number,
  outerRadius: number,
  thickness: number,
  sizeScale: number,
  layout: PoolLayout,
): Rock[] {
  const rand = mulberry32(0xa57e01d)
  const rocks: Rock[] = []
  const span = Math.max(outerRadius - innerRadius, 1)
  const scale = Math.max(0.05, sizeScale)
  const clumpN = Math.max(0, Math.floor(layout.clumpCount))
  const spread = Math.max(4, layout.clumpSpread)
  const loose = Math.min(1, Math.max(0, layout.looseRatio))
  const halfExtents = layout.halfExtents
  const meshHalf = (shapeIndex: number) =>
    halfExtents[shapeIndex] ?? _unitHalf
  const normalShapeCount = Math.max(1, layout.normalShapeCount)
  const shardShapeCount = Math.max(1, layout.shardShapeCount)

  type Clump = { orbitRadius: number; theta: number; y: number }
  const clumps: Clump[] = []
  for (let c = 0; c < clumpN; c++) {
    const u = Math.pow(rand(), 0.85)
    clumps.push({
      orbitRadius: innerRadius + span * u,
      theta: rand() * Math.PI * 2,
      y: (rand() - 0.5) * 2 * thickness * 0.45,
    })
  }

  for (let i = 0; i < capacity; i++) {
    if (i < count) {
      let orbitRadius: number
      let theta: number
      let y: number
      const joinClump = clumps.length > 0 && rand() > loose
      if (joinClump) {
        const clump = clumps[Math.floor(rand() * clumps.length)]
        const dr = (rand() - 0.5) * 2 * spread
        const dTheta = ((rand() - 0.5) * 2 * spread) / Math.max(clump.orbitRadius, 1)
        orbitRadius = Math.min(
          outerRadius,
          Math.max(innerRadius, clump.orbitRadius + dr),
        )
        theta = clump.theta + dTheta
        y = clump.y + (rand() - 0.5) * spread * 0.7
      } else {
        const u = Math.pow(rand(), 0.85)
        orbitRadius = innerRadius + span * u
        theta = rand() * Math.PI * 2
        y = (rand() - 0.5) * 2 * thickness * (0.35 + rand() * 0.65)
      }
      // Power < 1 biases toward larger rocks; wide range for more variety
      const size = (1.65 + Math.pow(rand(), 0.55) * 13.6) * scale
      // Independent axis stretches → potato / slab / elongated shapes
      const sx = size * (0.32 + Math.pow(rand(), 0.65) * 1.7)
      const sy = size * (0.28 + Math.pow(rand(), 0.65) * 1.65)
      const sz = size * (0.28 + Math.pow(rand(), 0.65) * 1.65)
      const kind = rollAsteroidType(rand)
      const shapeIndex = pickNormalShape(rand, normalShapeCount)

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
        cx: 0,
        cy: 0,
        cz: 0,
        hitRadius: 0,
        spin: (rand() - 0.5) * 0.2,
        angle: rand() * Math.PI * 2,
        life: 0,
        collideGrace: 0,
        kind,
        color: rockColor(kind, rand),
        isNight: false,
        shapeIndex,
        instIndex: -1,
        listPos: i,
      }
      syncCollisionAxes(rock, meshHalf(shapeIndex))
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
        cx: 0,
        cy: 0,
        cz: 0,
        hitRadius: 0,
        spin: 0,
        angle: 0,
        life: 0,
        collideGrace: 0,
        kind: 'ore',
        color: new Color('#000000'),
        isNight: false,
        shapeIndex: 0,
        instIndex: -1,
        listPos: -1,
      })
    }
  }

  // Night-omen tints — breakup + each vaporized fragment yield night shards
  if (count > 0) {
    const omenRand = mulberry32(0x6e7978) // "nyx"
    // Keep stock pack albedo — night identity is the space_rocks mesh, not a tint.
    const markNight = (omen: Rock) => {
      omen.isNight = true
      omen.color = new Color('#ffffff')
      omen.shapeIndex = pickShardShape(
        omenRand,
        normalShapeCount,
        shardShapeCount,
      )
      syncCollisionAxes(omen, meshHalf(omen.shapeIndex))
    }
    if (layout.nightFraction === undefined) {
      const omenIdx = Math.floor(omenRand() * count)
      markNight(rocks[omenIdx])
    } else if (layout.nightFraction > 0) {
      const nNight = Math.max(
        1,
        Math.min(count, Math.round(count * layout.nightFraction)),
      )
      const order = Array.from({ length: count }, (_, i) => i)
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(omenRand() * (i + 1))
        const tmp = order[i]
        order[i] = order[j]
        order[j] = tmp
      }
      for (let i = 0; i < nNight; i++) {
        markNight(rocks[order[i]])
      }
    }
  }

  return rocks
}

function writeMatrix(meshes: MeshBelt, rock: Rock) {
  if (rock.instIndex < 0) return
  const inst = meshes[rock.shapeIndex]
  if (!inst) return
  if (!rock.alive) {
    _dummy.position.set(0, 0, 0)
    _dummy.scale.set(0, 0, 0)
  } else {
    _dummy.position.set(rock.x, rock.y, rock.z)
    _dummy.rotation.set(rock.angle * 0.7, rock.angle, rock.angle * 0.35)
    _dummy.scale.set(rock.sx, rock.sy, rock.sz)
  }
  _dummy.updateMatrix()
  inst.setMatrixAt(rock.instIndex, _dummy.matrix)
}

function writeInstance(meshes: MeshBelt, rock: Rock) {
  writeMatrix(meshes, rock)
  if (rock.instIndex < 0) return
  const inst = meshes[rock.shapeIndex]
  if (inst) inst.setColorAt(rock.instIndex, rock.color)
}

function markMeshesDirty(meshes: MeshBelt, colors = false) {
  for (let i = 0; i < meshes.length; i++) {
    const inst = meshes[i]
    if (!inst) continue
    inst.instanceMatrix.needsUpdate = true
    if (colors && inst.instanceColor) inst.instanceColor.needsUpdate = true
  }
}

/** Per-shape dense rock-index lists — InstancedMesh.count follows these lengths. */
function makeShapeLive(shapeCount: number) {
  return Array.from({ length: shapeCount }, () => [] as number[])
}

function bindRockInstance(
  meshes: MeshBelt,
  shapeLive: number[][],
  rocks: Rock[],
  rockIndex: number,
) {
  const rock = rocks[rockIndex]
  if (!rock.alive || rock.instIndex >= 0) return
  const list = shapeLive[rock.shapeIndex]
  if (!list) return
  rock.instIndex = list.length
  list.push(rockIndex)
  const inst = meshes[rock.shapeIndex]
  if (inst) inst.count = list.length
  writeInstance(meshes, rock)
}

function unbindRockInstance(
  meshes: MeshBelt,
  shapeLive: number[][],
  rocks: Rock[],
  rockIndex: number,
) {
  const rock = rocks[rockIndex]
  const slot = rock.instIndex
  if (slot < 0) return
  const list = shapeLive[rock.shapeIndex]
  if (!list) {
    rock.instIndex = -1
    return
  }
  const lastPos = list.length - 1
  const lastRockIndex = list[lastPos]
  list.pop()
  if (lastRockIndex !== rockIndex && lastPos !== slot) {
    list[slot] = lastRockIndex
    const moved = rocks[lastRockIndex]
    moved.instIndex = slot
    writeInstance(meshes, moved)
  }
  rock.instIndex = -1
  const inst = meshes[rock.shapeIndex]
  if (inst) {
    inst.count = list.length
    // Clear the vacated trailing slot so stale transforms never flash back
    if (list.length < inst.instanceMatrix.count) {
      _dummy.position.set(0, 0, 0)
      _dummy.scale.set(0, 0, 0)
      _dummy.updateMatrix()
      inst.setMatrixAt(list.length, _dummy.matrix)
    }
  }
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
  texture = DEFAULT_ASTEROID_TEXTURE,
  glowAllNightRocks: _glowAllNightRocks = false,
  showShardMapMarker = false,
  lorePingsRef,
  nightFraction,
  clumpCount = 0,
  clumpSpread = 24,
  looseRatio = 0.35,
  paused = false,
  hazardRef,
  onRockDestroyed,
  resetSeed = 0,
}: AsteroidBeltProps) {
  // Debris slots only — orbiting rocks stay in the base count
  const capacity = useMemo(() => count + Math.max(768, count), [count])
  const shapeSet = useAsteroidShapeSet()
  const meshesRef = useRef<MeshBelt>([])
  const shapeLiveRef = useRef<number[][]>(
    makeShapeLive(shapeSet.geometries.length),
  )
  const shapeCountsRef = useRef({
    normal: shapeSet.normalShapeCount,
    shard: shapeSet.shardShapeCount,
  })
  shapeCountsRef.current = {
    normal: shapeSet.normalShapeCount,
    shard: shapeSet.shardShapeCount,
  }
  const halfExtentsRef = useRef(shapeSet.halfExtents)
  halfExtentsRef.current = shapeSet.halfExtents
  const normalMaterial = useMemo(
    () => createBeltRockMaterial(shapeSet.normalMaps, DEFAULT_ASTEROID_TEXTURE),
    [shapeSet.normalMaps],
  )
  const shardMaterial = useMemo(
    () =>
      createBeltRockMaterial(shapeSet.shardMaps, DEFAULT_ASTEROID_TEXTURE, {
        shardShade: true,
      }),
    [shapeSet.shardMaps],
  )
  const nightIndexRef = useRef(-1)
  const showShardMapMarkerRef = useRef(showShardMapMarker)
  showShardMapMarkerRef.current = showShardMapMarker

  useLayoutEffect(
    () => () => {
      for (const geo of shapeSet.geometries) geo.dispose()
    },
    [shapeSet.geometries],
  )
  useLayoutEffect(
    () => () => {
      normalMaterial.dispose()
      shardMaterial.dispose()
    },
    [normalMaterial, shardMaterial],
  )
  useLayoutEffect(() => {
    applyBeltRockTextureParams(normalMaterial, texture)
    applyBeltRockTextureParams(shardMaterial, texture, {
      shardShade: true,
      maps: shapeSet.shardMaps,
    })
    // Stock pack look — no emissive wash over the albedo
    shardMaterial.emissive.set('#000000')
    shardMaterial.emissiveIntensity = 0
  }, [
    normalMaterial,
    shardMaterial,
    shapeSet.shardMaps,
    texture,
  ])
  const rocks = useMemo(
    () =>
      makePool(count, capacity, innerRadius, outerRadius, thickness, sizeScale, {
        clumpCount,
        clumpSpread,
        looseRatio,
        nightFraction,
        normalShapeCount: shapeSet.normalShapeCount,
        shardShapeCount: shapeSet.shardShapeCount,
        halfExtents: shapeSet.halfExtents,
      }),
    [
      count,
      capacity,
      innerRadius,
      outerRadius,
      thickness,
      sizeScale,
      clumpCount,
      clumpSpread,
      looseRatio,
      nightFraction,
      shapeSet.normalShapeCount,
      shapeSet.shardShapeCount,
      shapeSet.halfExtents,
      resetSeed,
    ],
  )
  useLayoutEffect(() => {
    nightIndexRef.current = rocks.findIndex((rock) => rock.isNight)
  }, [rocks])
  useLayoutEffect(
    () => () => {
      const pings = lorePingsRef?.current
      if (!pings) return
      const idx = pings.findIndex((p) => p.label === NIGHT_SHARD_MAP_LABEL)
      if (idx >= 0) pings.splice(idx, 1)
    },
    [lorePingsRef],
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
  /**
   * Last belt-local focus from ship/laser hazard queries.
   * Soft rock–rock contacts only run near this point.
   */
  const focusLocalRef = useRef({ x: 0, y: 0, z: 0, age: FOCUS_STALE_SEC + 1 })
  const spatialRef = useRef({
    dirty: true,
    buckets: Array.from({ length: BUCKET_COUNT }, () => [] as number[]),
  })
  const orbitHashTimer = useRef(0)

  const markSoftFocus = (lx: number, ly: number, lz: number) => {
    const focus = focusLocalRef.current
    focus.x = lx
    focus.y = ly
    focus.z = lz
    focus.age = 0
  }
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
    const focus = focusLocalRef.current
    const softFocusLive = focus.age <= FOCUS_STALE_SEC
    let softLeft = softFocusLive ? MAX_SOFT_COLLISIONS_PER_FRAME : 0
    const fx = focus.x
    const fy = focus.y
    const fz = focus.z
    const meshes = meshesRef.current
    let touched = false

    const nearSoftFocus = (rock: Rock) => {
      const dx = rock.x - fx
      const dy = rock.y - fy
      const dz = rock.z - fz
      return dx * dx + dy * dy + dz * dz <= SOFT_PHYSICS_RADIUS_SQ
    }

    for (let c = 0; c < cells.length; c++) {
      const home = cells[c]
      if (home.length === 0) continue

      const homeAng = Math.floor(c / COLL_RAD_BUCKETS)
      const homeRad = c % COLL_RAD_BUCKETS

      for (let a = 0; a < home.length; a++) {
        const i = home[a]
        const A = list[i]
        if (!A.alive) continue
        const rAmax = A.hitRadius * COLLIDE_RADIUS_SCALE

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

              const dx = B.x - A.x
              const dy = B.y - A.y
              const dz = B.z - A.z
              const distSq = dx * dx + dy * dy + dz * dz
              // Conservative sphere early-out (max half-axis)
              const rBmax = B.hitRadius * COLLIDE_RADIUS_SCALE
              const maxDist = rAmax + rBmax
              if (distSq >= maxDist * maxDist || distSq < 1e-10) continue

              const dist = Math.sqrt(distSq)
              const inv = 1 / dist
              const nx = dx * inv
              const ny = dy * inv
              const nz = dz * inv

              // Fitted ellipsoids along the contact line — slabs/needles no longer
              // collide as giant spheres built from max(sx,sy,sz).
              const rA = ellipsoidSupportAlong(A, nx, ny, nz, COLLIDE_RADIUS_SCALE)
              const rB = ellipsoidSupportAlong(
                B,
                -nx,
                -ny,
                -nz,
                COLLIDE_RADIUS_SCALE,
              )
              const minDist = rA + rB
              if (dist >= minDist) continue

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

              // Soft resolve only near the player focus (far belt can lightly overlap)
              if (softLeft <= 0) continue
              if (!nearSoftFocus(A) && !nearSoftFocus(B)) continue
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
                if (meshes.length > 0) {
                  writeMatrix(meshes, A)
                  writeMatrix(meshes, B)
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

              if (meshes.length > 0) {
                writeMatrix(meshes, A)
                writeMatrix(meshes, B)
              }
            }
          }
        }
      }
    }

    if (touched) markMeshesDirty(meshes)
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

  const killRock = (index: number) => {
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
    // Always drop the dense instance — stale draws cost more than a slot recycle.
    unbindRockInstance(
      meshesRef.current,
      shapeLiveRef.current,
      list,
      index,
    )
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
    // Omen is still on the belt — fragment mid-splits are free-flying debris
    const wasOrbiting = parent.orbiting
    _fragColor.copy(parent.color)

    // Small rocks vaporize — terminal kill; night pieces each yield a shard
    if (size < minHit) {
      killRock(index)
      markMeshesDirty(meshesRef.current, true)
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
    const meshes = meshesRef.current

    for (let f = 0; f < fragments; f++) {
      const fragScale =
        (FRAG_SCALE_MIN + rand() * (FRAG_SCALE_MAX - FRAG_SCALE_MIN)) *
        fragScaleBoost
      let sx = psx * fragScale * (0.75 + rand() * 0.5)
      let sy = psy * fragScale * (0.75 + rand() * 0.5)
      let sz = psz * fragScale * (0.75 + rand() * 0.5)
      // Pre-shape size gate (render scale); refined after mesh AABB bake
      let approxR = Math.max(sx, sy, sz)
      if (approxR > maxFrag) {
        const shrink = maxFrag / approxR
        sx *= shrink
        sy *= shrink
        sz *= shrink
        approxR = maxFrag
      }

      // Too small to bother simulating — already "destroyed"
      if (approxR < minHit * 0.85) continue

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
      child.sx = sx
      child.sy = sy
      child.sz = sz
      child.spin = (rand() - 0.5) * 3.2 * kickScale
      child.angle = rand() * Math.PI * 2
      child.life = DEBRIS_LIFE * (0.7 + rand() * 0.6)
      child.collideGrace = 0
      child.kind = parentKind
      // Omen lineage — each piece yields a night shard when finally vaporized
      child.isNight = parentNight
      // Fresh silhouette per fragment — avoids a spray of identical clones
      {
        const { normal, shard } = shapeCountsRef.current
        child.shapeIndex = parentNight
          ? pickShardShape(rand, normal, shard)
          : pickNormalShape(rand, normal)
      }
      const half =
        halfExtentsRef.current[child.shapeIndex] ?? _unitHalf
      syncCollisionAxes(child, half)
      if (child.hitRadius < minHit * 0.85) {
        child.alive = false
        continue
      }
      child.x = px + ux * child.hitRadius * 1.4
      child.y = py + uy * child.hitRadius * 1.4
      child.z = pz + uz * child.hitRadius * 1.4
      child.vx =
        ovx + ux * (kick + eject) + impactLocal.x * impactBoost
      child.vy =
        ovy + uy * (kick + eject) + impactLocal.y * impactBoost
      child.vz =
        ovz + uz * (kick + eject) + impactLocal.z * impactBoost
      child.instIndex = -1
      child.color.copy(_fragColor)
      if (!parentNight) {
        child.color.offsetHSL(
          (rand() - 0.5) * 0.01,
          (rand() - 0.5) * 0.02,
          (rand() - 0.5) * 0.06,
        )
      }
      addToLiveList(debrisList.current, slot, child)

      bindRockInstance(meshes, shapeLiveRef.current, list, slot)
    }

    markMeshesDirty(meshes, true)

    // Normal rocks roll cargo/buffs on every split.
    // Night omen: one shard when the belt parent breaks; further mid-splits wait
    // until fragments vaporize (each terminal night kill grants its own shard).
    if (parentNight) {
      if (wasOrbiting) notifyDestroyed(px, py, pz, parentKind, true)
      return
    }
    notifyDestroyed(px, py, pz, parentKind, false)
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
        markSoftFocus(_local.x, _local.y, _local.z)

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
        markSoftFocus(_local.x, _local.y, _local.z)
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
        markSoftFocus(_local.x, _local.y, _local.z)
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

        const step = Math.min(24, Math.max(8, dist / 36))
        const n = Math.min(64, Math.max(2, Math.ceil(dist / step)))
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
    const meshes = meshesRef.current
    const shapeCount = shapeSet.geometries.length
    const shapeLive = makeShapeLive(shapeCount)
    shapeLiveRef.current = shapeLive
    const bound = new Sphere(
      _boundCenter.set(0, 0, 0),
      outerRadius * 1.6 + thickness + 40,
    )

    for (let s = 0; s < shapeCount; s++) {
      const inst = meshes[s]
      if (!inst) continue
      inst.instanceMatrix.setUsage(DynamicDrawUsage)
      inst.count = 0
      inst.geometry.boundingSphere = bound.clone()
    }

    for (let i = 0; i < rocks.length; i++) {
      rocks[i].instIndex = -1
      if (rocks[i].alive) {
        bindRockInstance(meshes, shapeLive, rocks, i)
      }
    }
    markMeshesDirty(meshes, true)
  }, [rocks, outerRadius, thickness, shapeSet.geometries.length])

  useFrame((_state, delta) => {
    const list = rocks

    // Dev map marker — sun-relative lore ping for Sol's omen rock
    {
      const pings = lorePingsRef?.current
      if (pings) {
        let ni = nightIndexRef.current
        let rock = ni >= 0 ? list[ni] : null
        if (!rock?.alive || !rock.isNight) {
          ni = list.findIndex((r) => r.alive && r.isNight)
          nightIndexRef.current = ni
          rock = ni >= 0 ? list[ni] : null
        }
        const show = showShardMapMarkerRef.current && !!rock?.alive
        const idx = pings.findIndex((p) => p.label === NIGHT_SHARD_MAP_LABEL)
        if (!show) {
          if (idx >= 0) pings.splice(idx, 1)
        } else if (rock) {
          const { sunPosition: sun, inclination: tilt } = orbitRef.current
          beltLocalToWorld(rock.x, rock.y, rock.z, sun, tilt, _dropWorld)
          const sx = _dropWorld.x - sun[0]
          const sy = _dropWorld.y - sun[1]
          const sz = _dropWorld.z - sun[2]
          if (idx >= 0) {
            pings[idx].x = sx
            pings[idx].y = sy
            pings[idx].z = sz
          } else {
            pings.push({ x: sx, y: sy, z: sz, label: NIGHT_SHARD_MAP_LABEL })
          }
        }
      }
    }

    if (paused) return
    const dt = Math.min(delta, 0.05)
    focusLocalRef.current.age += dt
    const meshes = meshesRef.current
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
      writeMatrix(meshes, rock)
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
      writeMatrix(meshes, rock)
      matricesDirty = true
    }

    resolveRockCollisions()

    // Orbiting rocks cross buckets slowly — never rebuild for debris motion
    orbitHashTimer.current -= dt
    if (orbitHashTimer.current <= 0) {
      markSpatialDirty()
      orbitHashTimer.current = ORBIT_HASH_INTERVAL
    }

    if (matricesDirty) markMeshesDirty(meshes)
  })

  return (
    <group position={sunPosition} rotation={[inclination, 0, 0]}>
      {shapeSet.geometries.map((geometry, shapeIndex) => (
        <instancedMesh
          key={shapeIndex}
          ref={(el) => {
            meshesRef.current[shapeIndex] = el
          }}
          args={[
            geometry,
            shapeIndex < shapeSet.normalShapeCount
              ? normalMaterial
              : shardMaterial,
            capacity,
          ]}
          castShadow={false}
          receiveShadow={false}
          frustumCulled={false}
        />
      ))}
    </group>
  )
}
