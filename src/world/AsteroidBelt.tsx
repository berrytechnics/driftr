import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import {
  Color,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedMesh,
  Object3D,
  Sphere,
  Vector3,
  type BufferGeometry,
  type MeshStandardMaterial,
} from 'three'
import { beltLocalToWorld } from '@/loot/buffs'
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
  largeLumps: 0.37,
  mediumLumps: 0.12,
  fineLumps: 0.06,
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
  /** Orbital plane tilt (radians) */
  inclination?: number
  shape?: AsteroidShapeParams
  texture?: AsteroidTextureParams
  paused?: boolean
  /** Exposes lethal hit-tests + laser impacts for the player ship */
  hazardRef?: RefObject<HazardField | null>
  /** Fired in world space when a rock is fully destroyed (not split) */
  onRockDestroyed?: (worldPosition: Vector3) => void
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
  color: Color
}

/** Pieces smaller than this are vaporized instead of splitting further. */
const MIN_HIT_RADIUS = 0.42
const MIN_FRAGMENTS = 2
const MAX_FRAGMENTS = 3
const FRAG_SCALE_MIN = 0.34
const FRAG_SCALE_MAX = 0.5
/** Keep breakaway chunks from spiking fill-rate near the camera */
const MAX_FRAG_HIT_RADIUS = 2.4
const DEBRIS_LIFE = 18
const DEBRIS_KICK = 9
/** Orbiting rocks drift buckets slowly — rebuild at this interval */
const ORBIT_HASH_INTERVAL = 0.4

const _dummy = new Object3D()
const _boundCenter = new Vector3()
const _local = new Vector3()
const _impactDir = new Vector3()
const _dropWorld = new Vector3()
const _fragColor = new Color()

/** Angular sectors for belt hazard queries (thin torus → 1D hash). */
const BUCKET_COUNT = 64
const BUCKET_SPAN = (Math.PI * 2) / BUCKET_COUNT

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

function rockColor(rand: () => number, base?: Color) {
  if (base) {
    return base
      .clone()
      .offsetHSL((rand() - 0.5) * 0.04, (rand() - 0.5) * 0.05, (rand() - 0.5) * 0.08)
  }
  return new Color().setHSL(
    0.07 + rand() * 0.06,
    0.08 + rand() * 0.14,
    0.22 + rand() * 0.28,
  )
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
): Rock[] {
  const rand = mulberry32(0xa57e01d)
  const rocks: Rock[] = []
  const span = Math.max(outerRadius - innerRadius, 1)

  for (let i = 0; i < capacity; i++) {
    if (i < count) {
      const u = Math.pow(rand(), 0.85)
      const orbitRadius = innerRadius + span * u
      // Power < 1 biases toward larger rocks; wide range for more variety
      const size = 0.55 + Math.pow(rand(), 0.55) * 4.8
      // Independent axis stretches → potato / slab / elongated shapes
      const sx = size * (0.32 + Math.pow(rand(), 0.65) * 1.7)
      const sy = size * (0.28 + Math.pow(rand(), 0.65) * 1.65)
      const sz = size * (0.28 + Math.pow(rand(), 0.65) * 1.65)
      const theta = rand() * Math.PI * 2
      const y = (rand() - 0.5) * 2 * thickness * (0.35 + rand() * 0.65)

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
        color: rockColor(rand),
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
        color: new Color('#000000'),
      })
    }
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

export function AsteroidBelt({
  sunPosition,
  mu,
  orbitSpeedScale = 0.1,
  innerRadius = 1727,
  outerRadius = 2273,
  count = 6000,
  thickness = 16,
  inclination = 0.06,
  shape = DEFAULT_ASTEROID_SHAPE,
  texture = DEFAULT_ASTEROID_TEXTURE,
  paused = false,
  hazardRef,
  onRockDestroyed,
}: AsteroidBeltProps) {
  const capacity = useMemo(() => Math.max(count * 3, count + 64), [count])
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
    () => makePool(count, capacity, innerRadius, outerRadius, thickness),
    [count, capacity, innerRadius, outerRadius, thickness],
  )
  const rocksRef = useRef(rocks)
  rocksRef.current = rocks
  /** O(1) dead-slot stack — avoids scanning the whole pool on each fragment */
  const freeSlots = useRef<number[]>([])
  useLayoutEffect(() => {
    const free: number[] = []
    for (let i = 0; i < rocks.length; i++) {
      if (!rocks[i].alive) free.push(i)
    }
    freeSlots.current = free
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
  const spatialRef = useRef({
    dirty: true,
    buckets: Array.from({ length: BUCKET_COUNT }, () => [] as number[]),
  })
  const orbitHashTimer = useRef(0)

  const markSpatialDirty = () => {
    spatialRef.current.dirty = true
  }

  const ensureBuckets = () => {
    const spatial = spatialRef.current
    if (!spatial.dirty) return
    spatial.dirty = false
    const { buckets } = spatial
    for (let b = 0; b < BUCKET_COUNT; b++) buckets[b].length = 0
    const list = rocksRef.current
    for (let i = 0; i < list.length; i++) {
      const rock = list[i]
      if (!rock.alive) continue
      buckets[angleBucket(rock.x, rock.z)].push(i)
    }
  }

  /** Visit rocks near a local XZ point; returns false to stop early. */
  const forNearbyRocks = (
    lx: number,
    lz: number,
    searchPad: number,
    visit: (index: number, rock: Rock) => boolean | void,
  ) => {
    ensureBuckets()
    const { buckets } = spatialRef.current
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
        if (visit(index, rocksRef.current[index]) === false) return
      }
    }
  }

  const findFreeSlot = () => {
    const slot = freeSlots.current.pop()
    return slot === undefined ? -1 : slot
  }

  const killRock = (index: number, updateMesh = true) => {
    const rock = rocksRef.current[index]
    if (!rock.alive) return
    rock.alive = false
    rock.orbiting = false
    rock.hitRadius = 0
    freeSlots.current.push(index)
    markSpatialDirty()
    if (!updateMesh) return
    const inst = mesh.current
    if (!inst) return
    writeInstance(inst, index, rock)
  }

  const notifyDestroyed = (lx: number, ly: number, lz: number) => {
    const { sunPosition: sun, inclination: tilt } = orbitRef.current
    beltLocalToWorld(lx, ly, lz, sun, tilt, _dropWorld)
    onDestroyedRef.current?.(_dropWorld)
  }

  const splitRock = (index: number, impactLocal: Vector3) => {
    const list = rocksRef.current
    const parent = list[index]
    if (!parent.alive) return

    const rand = randRef.current
    const size = parent.hitRadius
    const px = parent.x
    const py = parent.y
    const pz = parent.z
    const psx = parent.sx
    const psy = parent.sy
    const psz = parent.sz
    _fragColor.copy(parent.color)

    // Small rocks vaporize — always a destroy event for loot
    if (size < MIN_HIT_RADIUS) {
      killRock(index)
      const inst = mesh.current
      if (inst) {
        inst.instanceMatrix.needsUpdate = true
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true
      }
      notifyDestroyed(px, py, pz)
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

    const fragments =
      MIN_FRAGMENTS + Math.floor(rand() * (MAX_FRAGMENTS - MIN_FRAGMENTS + 1))
    const inst = mesh.current

    for (let f = 0; f < fragments; f++) {
      const scale =
        FRAG_SCALE_MIN + rand() * (FRAG_SCALE_MAX - FRAG_SCALE_MIN)
      let sx = psx * scale * (0.75 + rand() * 0.5)
      let sy = psy * scale * (0.75 + rand() * 0.5)
      let sz = psz * scale * (0.75 + rand() * 0.5)
      let hitRadius = Math.max(sx, sy, sz)
      if (hitRadius > MAX_FRAG_HIT_RADIUS) {
        const shrink = MAX_FRAG_HIT_RADIUS / hitRadius
        sx *= shrink
        sy *= shrink
        sz *= shrink
        hitRadius = MAX_FRAG_HIT_RADIUS
      }

      // Too small to bother simulating — already "destroyed"
      if (hitRadius < MIN_HIT_RADIUS * 0.85) continue

      const slot = findFreeSlot()
      if (slot < 0) break

      const kick = DEBRIS_KICK * (0.55 + rand())
      // Random spray + bias along laser impact
      const rx = (rand() - 0.5) * 2
      const ry = (rand() - 0.5) * 2
      const rz = (rand() - 0.5) * 2
      const rLen = Math.hypot(rx, ry, rz) || 1

      const child = list[slot]
      child.alive = true
      child.orbiting = false
      child.orbitRadius = 0
      child.theta = 0
      child.x = px + (rx / rLen) * hitRadius * 0.55
      child.y = py + (ry / rLen) * hitRadius * 0.55
      child.z = pz + (rz / rLen) * hitRadius * 0.55
      child.vx = ovx + (rx / rLen) * kick + impactLocal.x * (3 + rand() * 5)
      child.vy = ovy + (ry / rLen) * kick + impactLocal.y * (3 + rand() * 5)
      child.vz = ovz + (rz / rLen) * kick + impactLocal.z * (3 + rand() * 5)
      child.sx = sx
      child.sy = sy
      child.sz = sz
      child.hitRadius = hitRadius
      child.spin = (rand() - 0.5) * 2.4
      child.angle = rand() * Math.PI * 2
      child.life = DEBRIS_LIFE * (0.7 + rand() * 0.6)
      child.color.copy(_fragColor)
      child.color.offsetHSL(
        (rand() - 0.5) * 0.04,
        (rand() - 0.5) * 0.05,
        (rand() - 0.5) * 0.08,
      )

      if (inst) writeInstance(inst, slot, child)
    }

    if (inst) {
      inst.instanceMatrix.needsUpdate = true
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true
    }

    // Roll loot for every laser-destroyed rock (fragments can drop again later)
    notifyDestroyed(px, py, pz)
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
        if (radial > outer + margin) return false
        if (Math.abs(_local.y) > tall * 6 + pad) return false
        // Hollow center: only worth testing if debris may be inward
        if (radial < inner - margin) {
          let anyDebris = false
          const list = rocksRef.current
          for (let i = 0; i < list.length; i++) {
            if (list[i].alive && !list[i].orbiting) {
              anyDebris = true
              break
            }
          }
          if (!anyDebris) return false
        }

        let hit = false
        // +12 covers the largest rock radii when computing angular span
        forNearbyRocks(_local.x, _local.z, pad + 12, (_index, rock) => {
          const dx = rock.x - _local.x
          const dy = rock.y - _local.y
          const dz = rock.z - _local.z
          const hitR = rock.hitRadius + pad
          if (dx * dx + dy * dy + dz * dz < hitR * hitR) {
            hit = true
            return false
          }
        })
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
        if (radial > outer + margin || radial < Math.max(0, inner - margin)) {
          // Still allow hits on drifted debris outside the ring
          let anyDebris = false
          const list = rocksRef.current
          for (let i = 0; i < list.length; i++) {
            if (list[i].alive && !list[i].orbiting) {
              anyDebris = true
              break
            }
          }
          if (!anyDebris) return false
        }

        let best = -1
        let bestDist = Infinity
        forNearbyRocks(_local.x, _local.z, pad + 12, (index, rock) => {
          const dx = rock.x - _local.x
          const dy = rock.y - _local.y
          const dz = rock.z - _local.z
          const distSq = dx * dx + dy * dy + dz * dz
          const hitR = rock.hitRadius + pad
          if (distSq < hitR * hitR && distSq < bestDist) {
            bestDist = distSq
            best = index
          }
        })

        if (best < 0) return false
        splitRockRef.current(best, _impactDir)
        return true
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
    let debrisMoved = false

    for (let i = 0; i < list.length; i++) {
      const rock = list[i]
      if (!rock.alive) continue

      if (rock.orbiting) {
        const omega =
          circularOrbitSpeed(effectiveMu, rock.orbitRadius) / rock.orbitRadius
        // Decreasing θ — same orbital direction as the planets
        rock.theta -= omega * dt
        syncOrbitPosition(rock)
      } else {
        rock.x += rock.vx * dt
        rock.y += rock.vy * dt
        rock.z += rock.vz * dt
        rock.life -= dt
        debrisMoved = true

        const radial = Math.hypot(rock.x, rock.z)
        if (
          rock.life <= 0 ||
          radial > maxDebrisR ||
          radial < minDebrisR ||
          Math.abs(rock.y) > thickness * 6
        ) {
          rock.alive = false
          rock.orbiting = false
          rock.hitRadius = 0
          freeSlots.current.push(i)
          markSpatialDirty()
          writeMatrix(inst, i, rock)
          matricesDirty = true
          continue
        }
      }

      rock.angle += rock.spin * dt
      writeMatrix(inst, i, rock)
      matricesDirty = true
    }

    // Orbiting rocks cross buckets slowly; debris needs fresh buckets now
    orbitHashTimer.current -= dt
    if (debrisMoved || orbitHashTimer.current <= 0) {
      markSpatialDirty()
      if (orbitHashTimer.current <= 0) orbitHashTimer.current = ORBIT_HASH_INTERVAL
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
