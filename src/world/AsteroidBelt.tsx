import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import {
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Object3D,
  Sphere,
  Vector3,
} from 'three'
import { beltLocalToWorld } from '@/loot/buffs'
import { circularOrbitSpeed } from '@/world/gravity'
import type { HazardField } from '@/ship/PlayerShip'

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
const MAX_FRAGMENTS = 4
const FRAG_SCALE_MIN = 0.38
const FRAG_SCALE_MAX = 0.55
const DEBRIS_LIFE = 18
const DEBRIS_KICK = 9

const _dummy = new Object3D()
const _boundCenter = new Vector3()
const _local = new Vector3()
const _impactDir = new Vector3()
const _dropWorld = new Vector3()

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
      const size = 0.35 + Math.pow(rand(), 2.2) * 2.4
      const stretch = 0.55 + rand() * 0.9
      const sx = size * stretch
      const sy = size * (0.55 + rand() * 0.9)
      const sz = size * (0.55 + rand() * 0.9)
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

export function AsteroidBelt({
  sunPosition,
  mu,
  orbitSpeedScale = 0.1,
  innerRadius = 450,
  outerRadius = 680,
  count = 1400,
  thickness = 16,
  inclination = 0.06,
  paused = false,
  hazardRef,
  onRockDestroyed,
}: AsteroidBeltProps) {
  const capacity = useMemo(() => Math.max(count * 3, count + 64), [count])
  const mesh = useRef<InstancedMesh>(null!)
  const rocks = useMemo(
    () => makePool(count, capacity, innerRadius, outerRadius, thickness),
    [count, capacity, innerRadius, outerRadius, thickness],
  )
  const rocksRef = useRef(rocks)
  rocksRef.current = rocks
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

  const findFreeSlot = () => {
    const list = rocksRef.current
    for (let i = 0; i < list.length; i++) {
      if (!list[i].alive) return i
    }
    return -1
  }

  const killRock = (index: number) => {
    const rock = rocksRef.current[index]
    rock.alive = false
    rock.orbiting = false
    rock.hitRadius = 0
    const inst = mesh.current
    if (!inst) return
    writeInstance(inst, index, rock)
    inst.instanceMatrix.needsUpdate = true
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true
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

    // Small rocks vaporize — always a destroy event for loot
    if (size < MIN_HIT_RADIUS) {
      killRock(index)
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

    const parentColor = parent.color.clone()
    killRock(index)

    const fragments =
      MIN_FRAGMENTS + Math.floor(rand() * (MAX_FRAGMENTS - MIN_FRAGMENTS + 1))

    for (let f = 0; f < fragments; f++) {
      const scale =
        FRAG_SCALE_MIN + rand() * (FRAG_SCALE_MAX - FRAG_SCALE_MIN)
      const sx = parent.sx * scale * (0.75 + rand() * 0.5)
      const sy = parent.sy * scale * (0.75 + rand() * 0.5)
      const sz = parent.sz * scale * (0.75 + rand() * 0.5)
      const hitRadius = Math.max(sx, sy, sz)

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
      child.color = rockColor(rand, parentColor)

      const inst = mesh.current
      if (inst) {
        writeInstance(inst, slot, child)
        inst.instanceMatrix.needsUpdate = true
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true
      }
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

        const list = rocksRef.current
        for (let i = 0; i < list.length; i++) {
          const rock = list[i]
          if (!rock.alive) continue
          const dx = rock.x - _local.x
          const dy = rock.y - _local.y
          const dz = rock.z - _local.z
          const hitR = rock.hitRadius + pad
          if (dx * dx + dy * dy + dz * dz < hitR * hitR) return true
        }
        return false
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

        const list = rocksRef.current
        let best = -1
        let bestDist = Infinity
        for (let i = 0; i < list.length; i++) {
          const rock = list[i]
          if (!rock.alive) continue
          const dx = rock.x - _local.x
          const dy = rock.y - _local.y
          const dz = rock.z - _local.z
          const distSq = dx * dx + dy * dy + dz * dz
          const hitR = rock.hitRadius + pad
          if (distSq < hitR * hitR && distSq < bestDist) {
            bestDist = distSq
            best = i
          }
        }

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
    let dirty = false

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

        const radial = Math.hypot(rock.x, rock.z)
        if (
          rock.life <= 0 ||
          radial > maxDebrisR ||
          radial < minDebrisR ||
          Math.abs(rock.y) > thickness * 6
        ) {
          rock.alive = false
          rock.hitRadius = 0
          writeMatrix(inst, i, rock)
          dirty = true
          continue
        }
      }

      rock.angle += rock.spin * dt
      writeMatrix(inst, i, rock)
      dirty = true
    }

    if (dirty) inst.instanceMatrix.needsUpdate = true
  })

  return (
    <group position={sunPosition} rotation={[inclination, 0, 0]}>
      <instancedMesh
        ref={mesh}
        args={[undefined, undefined, capacity]}
        castShadow={false}
        receiveShadow={false}
        frustumCulled={false}
      >
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial
          roughness={0.96}
          metalness={0.04}
          envMapIntensity={0.12}
          flatShading
        />
      </instancedMesh>
    </group>
  )
}
