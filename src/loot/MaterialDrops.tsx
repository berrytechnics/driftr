import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef, type RefObject } from 'react'
import { Group, Mesh, Vector3, type MeshStandardMaterial } from 'three'
import {
  MATERIAL_COLOR,
  MATERIAL_LIFETIME,
  rollMaterialAmount,
  rollMaterialKind,
  type MaterialKind,
} from '@/loot/economy'

const MAX_SHARDS = 48
const PICKUP_PAD = 0.65

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
}

export type MaterialPickup = {
  kind: MaterialKind
  amount: number
}

export type MaterialDropsHandle = {
  /** Always spawn a material shard (caller already decided no buff). */
  spawn: (x: number, y: number, z: number) => void
  collect: (point: Vector3, radius: number) => MaterialPickup | null
  clear: () => void
}

type MaterialDropsProps = {
  handleRef: RefObject<MaterialDropsHandle | null>
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
  }
}

function applyVisual(shard: Shard, kind: MaterialKind) {
  if (!shard.mesh) return
  const mat = shard.mesh.material as MeshStandardMaterial
  mat.color.set(MATERIAL_COLOR[kind])
  mat.emissive.set(MATERIAL_COLOR[kind])
  mat.emissiveIntensity = kind === 'alloy' ? 0.35 : kind === 'ice' ? 0.22 : 0.08
  mat.needsUpdate = true
}

export function MaterialDrops({ handleRef, paused = false }: MaterialDropsProps) {
  const pool = useRef<Shard[]>(
    Array.from({ length: MAX_SHARDS }, () => makeShard()),
  )

  useLayoutEffect(() => {
    const list = pool.current

    const clear = () => {
      for (const shard of list) {
        shard.alive = false
        if (shard.root) shard.root.visible = false
      }
    }

    handleRef.current = {
      spawn(x, y, z) {
        for (const shard of list) {
          if (shard.alive || !shard.root) continue
          const kind = rollMaterialKind()
          shard.alive = true
          shard.kind = kind
          shard.amount = rollMaterialAmount(kind)
          shard.life = MATERIAL_LIFETIME * (0.85 + Math.random() * 0.3)
          shard.spin = 0.6 + Math.random() * 1.2
          shard.bob = Math.random() * Math.PI * 2
          shard.vx = (Math.random() - 0.5) * 1.6
          shard.vy = (Math.random() - 0.5) * 1.0
          shard.vz = (Math.random() - 0.5) * 1.6
          shard.root.position.set(x, y, z)
          const s = 0.55 + shard.amount * 0.12
          shard.root.scale.setScalar(s)
          shard.root.visible = true
          applyVisual(shard, kind)
          return
        }
      },
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
        const pickup = { kind: best.kind, amount: best.amount }
        best.alive = false
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

    for (const shard of pool.current) {
      if (!shard.alive || !shard.root) continue

      shard.life -= dt
      if (shard.life <= 0) {
        shard.alive = false
        shard.root.visible = false
        continue
      }

      shard.root.position.x += shard.vx * dt
      shard.root.position.y += shard.vy * dt
      shard.root.position.z += shard.vz * dt
      shard.vx *= Math.exp(-0.4 * dt)
      shard.vy *= Math.exp(-0.4 * dt)
      shard.vz *= Math.exp(-0.4 * dt)

      shard.bob += dt * 1.8
      shard.root.rotation.x += shard.spin * 0.55 * dt
      shard.root.rotation.y += shard.spin * dt
      shard.root.position.y += Math.sin(shard.bob) * 0.004
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
