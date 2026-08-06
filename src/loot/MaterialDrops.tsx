import { useFrame } from '@react-three/fiber'
import {
  useLayoutEffect,
  useRef,
  type MutableRefObject,
  type RefObject,
} from 'react'
import {
  Group,
  Mesh,
  Object3D,
  Vector3,
  type MeshStandardMaterial,
} from 'three'
import {
  clearCargoBait,
  type CargoBait,
} from '@/loot/cargoBait'
import { NIGHT_SHARD_COLOR } from '@/lore/easterEggs'
import {
  JETTISON_LIFETIME,
  MATERIAL_COLOR,
  MATERIAL_KINDS,
  MATERIAL_LIFETIME,
  rollMaterialAmount,
  rollMaterialFromAsteroidType,
  rollMaterialKind,
  type CargoHold,
  type MaterialKind,
} from '@/loot/economy'
import { stepPickupMagnet } from '@/loot/magnet'

const MAX_SHARDS = 48
const PICKUP_PAD = 0.65
const _magnet = new Vector3()

type Shard = {
  root: Group | null
  mesh: Mesh | null
  alive: boolean
  kind: MaterialKind
  amount: number
  life: number
  spin: number
  bob: number
  vx: number
  vy: number
  vz: number
  /** Death / jettison dump — player + bandits both contest it */
  isDump: boolean
  /** Lore omen — not cargo */
  isNight: boolean
}

export type MaterialPickup = {
  kind: MaterialKind
  amount: number
  /** Lore pickup — does not add to the cargo hold */
  nightShard?: boolean
}

export type MaterialDropsHandle = {
  /**
   * Spawn a material shard. Pass the destroyed asteroid’s type so loot is
   * weighted toward that composition; omit for an unguided roll.
   */
  spawn: (x: number, y: number, z: number, asteroidType?: MaterialKind) => void
  /** Single lore night-dust shard from the omen belt rock. */
  spawnNight: (x: number, y: number, z: number) => void
  /** Spill an exact cargo hold as contested dump (player + bandits). */
  spawnDump: (x: number, y: number, z: number, cargo: CargoHold) => void
  /** Remove dump shards after bandits claim the pile. */
  clearScavenge: () => void
  collect: (point: Vector3, radius: number) => MaterialPickup | null
  clear: () => void
}

type MaterialDropsProps = {
  handleRef: RefObject<MaterialDropsHandle | null>
  /** Shared bait state — player pickups reduce remaining for bandits */
  cargoBaitRef?: MutableRefObject<CargoBait>
  /** Ship root — shards drift toward this when nearby */
  magnetTargetRef?: RefObject<Object3D | null>
  paused?: boolean
}

function makeShard(): Shard {
  return {
    root: null,
    mesh: null,
    alive: false,
    kind: 'ore',
    amount: 1,
    life: 0,
    spin: 0,
    bob: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    isDump: false,
    isNight: false,
  }
}

function applyVisual(shard: Shard, kind: MaterialKind, isNight: boolean) {
  if (!shard.mesh) return
  const mat = shard.mesh.material as MeshStandardMaterial
  if (isNight) {
    mat.color.set('#c8b8f0')
    mat.emissive.set(NIGHT_SHARD_COLOR)
    mat.emissiveIntensity = 1.35
    return
  }
  mat.color.set(MATERIAL_COLOR[kind])
  mat.emissive.set(MATERIAL_COLOR[kind])
  mat.emissiveIntensity = kind === 'alloy' ? 0.35 : kind === 'ice' ? 0.22 : 0.08
}

function activateShard(
  shard: Shard,
  kind: MaterialKind,
  amount: number,
  x: number,
  y: number,
  z: number,
  isDump: boolean,
  isNight = false,
) {
  shard.alive = true
  shard.kind = kind
  shard.amount = amount
  shard.isDump = isDump
  shard.isNight = isNight
  shard.life = isDump
    ? JETTISON_LIFETIME * (0.9 + Math.random() * 0.25)
    : MATERIAL_LIFETIME * (0.85 + Math.random() * 0.3)
  shard.spin = 0.6 + Math.random() * 1.2
  shard.bob = Math.random() * Math.PI * 2
  const burst = isDump ? 2.8 : isNight ? 1.1 : 1.6
  shard.vx = (Math.random() - 0.5) * burst
  shard.vy = (Math.random() - 0.5) * (isDump ? 1.6 : 1.0)
  shard.vz = (Math.random() - 0.5) * burst
  if (!shard.root) return
  shard.root.position.set(x, y, z)
  const s = isNight
    ? 1.05
    : isDump
      ? 0.75 + amount * 0.14
      : 0.55 + amount * 0.12
  shard.root.scale.setScalar(s)
  shard.root.visible = true
  applyVisual(shard, kind, isNight)
}

export function MaterialDrops({
  handleRef,
  cargoBaitRef,
  magnetTargetRef,
  paused = false,
}: MaterialDropsProps) {
  const pool = useRef<Shard[]>(
    Array.from({ length: MAX_SHARDS }, () => makeShard()),
  )
  const baitRef = useRef(cargoBaitRef)
  baitRef.current = cargoBaitRef

  useLayoutEffect(() => {
    const list = pool.current

    const clear = () => {
      for (const shard of list) {
        shard.alive = false
        shard.isDump = false
        shard.isNight = false
        if (shard.root) shard.root.visible = false
      }
    }

    const clearScavenge = () => {
      for (const shard of list) {
        if (!shard.alive || !shard.isDump) continue
        shard.alive = false
        shard.isDump = false
        shard.isNight = false
        if (shard.root) shard.root.visible = false
      }
    }

    const takeFree = () => {
      for (const shard of list) {
        if (!shard.alive && shard.root) return shard
      }
      return null
    }

    handleRef.current = {
      spawn(x, y, z, asteroidType) {
        const shard = takeFree()
        if (!shard) return
        const kind = asteroidType
          ? rollMaterialFromAsteroidType(asteroidType)
          : rollMaterialKind()
        activateShard(shard, kind, rollMaterialAmount(kind), x, y, z, false)
      },
      spawnNight(x, y, z) {
        const shard = takeFree()
        if (!shard) return
        activateShard(shard, 'ore', 0, x, y, z, false, true)
      },
      spawnDump(x, y, z, cargo) {
        clearScavenge()
        for (const kind of MATERIAL_KINDS) {
          let left = cargo[kind]
          while (left > 0) {
            const shard = takeFree()
            if (!shard) return
            const chunk = Math.min(left, kind === 'alloy' ? 1 : 2)
            activateShard(shard, kind, chunk, x, y, z, true)
            left -= chunk
          }
        }
      },
      clearScavenge,
      collect(point, radius) {
        const reach = radius + PICKUP_PAD
        const reach2 = reach * reach
        let best: Shard | null = null
        let bestDist = Infinity
        for (const shard of list) {
          if (!shard.alive || !shard.root) continue
          const d2 = shard.root.position.distanceToSquared(point)
          if (d2 < reach2 && d2 < bestDist) {
            bestDist = d2
            best = shard
          }
        }
        if (!best || !best.root) return null
        const pickup: MaterialPickup = best.isNight
          ? { kind: 'ore', amount: 0, nightShard: true }
          : { kind: best.kind, amount: best.amount }
        if (best.isDump) {
          const bait = baitRef.current?.current
          if (bait?.active) {
            bait.remaining = Math.max(0, bait.remaining - best.amount)
            bait.cargo[best.kind] = Math.max(
              0,
              bait.cargo[best.kind] - best.amount,
            )
            if (bait.remaining <= 0) clearCargoBait(bait)
          }
        }
        best.alive = false
        best.isDump = false
        best.isNight = false
        best.root.visible = false
        return pickup
      },
      clear,
    }

    return () => {
      handleRef.current = null
    }
  }, [handleRef])

  useFrame((_, delta) => {
    if (paused) return
    const dt = Math.min(delta, 0.05)
    const magnet = magnetTargetRef?.current
    if (magnet) magnet.getWorldPosition(_magnet)

    for (const shard of pool.current) {
      if (!shard.alive || !shard.root) continue

      shard.life -= dt
      if (shard.life <= 0) {
        shard.alive = false
        shard.isDump = false
        shard.isNight = false
        shard.root.visible = false
        continue
      }

      const magnetState = magnet
        ? stepPickupMagnet(shard.root.position, shard, _magnet, dt)
        : 'none'
      const pulling = magnetState !== 'none'

      if (!pulling) {
        shard.root.position.x += shard.vx * dt
        shard.root.position.y += shard.vy * dt
        shard.root.position.z += shard.vz * dt
        shard.vx *= Math.exp(-0.4 * dt)
        shard.vy *= Math.exp(-0.4 * dt)
        shard.vz *= Math.exp(-0.4 * dt)
        shard.root.position.y += Math.sin(shard.bob) * 0.004
      }

      shard.bob += dt * 1.8
      shard.root.rotation.x += shard.spin * 0.55 * dt
      shard.root.rotation.y += shard.spin * dt
    }
  })

  return (
    <group>
      {pool.current.map((shard, i) => (
        <group
          key={i}
          ref={(root) => {
            shard.root = root
          }}
          visible={false}
          frustumCulled={false}
        >
          <mesh
            ref={(mesh) => {
              shard.mesh = mesh
            }}
            frustumCulled={false}
          >
            <dodecahedronGeometry args={[0.42, 0]} />
            <meshStandardMaterial
              color="#c4a574"
              emissive="#c4a574"
              emissiveIntensity={0.08}
              roughness={0.85}
              metalness={0.25}
              envMapIntensity={0}
            />
          </mesh>
        </group>
      ))}
    </group>
  )
}
