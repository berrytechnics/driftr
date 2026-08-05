import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import {
  AdditiveBlending,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OctahedronGeometry,
  SphereGeometry,
  Vector3,
} from 'three'

const _magnet = new Vector3()
import {
  BUFF_DROP_CHANCE,
  TOKEN_LIFETIME,
  buffColor,
  type BuffKind,
} from '@/loot/buffs'
import { stepPickupMagnet } from '@/loot/magnet'

export type { BuffKind } from '@/loot/buffs'

const MAX_TOKENS = 24
const PICKUP_PAD = 0.55

type Token = {
  root: Group | null
  aura: Mesh | null
  halo: Mesh | null
  gem: Mesh | null
  alive: boolean
  kind: BuffKind
  life: number
  spin: number
  bob: number
  vx: number
  vy: number
  vz: number
}

export type BuffDropsHandle = {
  /**
   * Roll drop chance and maybe spawn a token.
   * @returns true if a buff token was spawned
   */
  maybeSpawn: (x: number, y: number, z: number) => boolean
  /** Collect nearest token in range; returns its kind or null */
  collect: (point: Vector3, radius: number) => BuffKind | null
  clear: () => void
}

type BuffDropsProps = {
  handleRef: RefObject<BuffDropsHandle | null>
  /** Ship root — tokens drift toward this when nearby */
  magnetTargetRef?: RefObject<Object3D | null>
  paused?: boolean
}

function makeToken(): Token {
  return {
    root: null,
    aura: null,
    halo: null,
    gem: null,
    alive: false,
    kind: 'speed',
    life: 0,
    spin: 0,
    bob: 0,
    vx: 0,
    vy: 0,
    vz: 0,
  }
}

function applyKindVisual(token: Token, kind: BuffKind) {
  const color = buffColor(kind)
  const hot = kind === 'speed' ? '#eafff8' : '#fff4d6'
  if (token.aura) {
    ;(token.aura.material as MeshBasicMaterial).color.set(color)
  }
  if (token.halo) {
    ;(token.halo.material as MeshBasicMaterial).color.set(color)
  }
  if (token.gem) {
    ;(token.gem.material as MeshBasicMaterial).color.set(hot)
  }
}

export function BuffDrops({
  handleRef,
  magnetTargetRef,
  paused = false,
}: BuffDropsProps) {
  const pool = useRef<Token[]>(
    Array.from({ length: MAX_TOKENS }, () => makeToken()),
  )

  // Shared geometries — avoid allocating 72 unique sphere/octa meshes.
  const geometries = useMemo(
    () => ({
      aura: new SphereGeometry(1.25, 12, 10),
      halo: new SphereGeometry(0.62, 10, 8),
      gem: new OctahedronGeometry(0.55, 0),
    }),
    [],
  )

  useLayoutEffect(() => {
    const list = pool.current

    const clear = () => {
      for (const token of list) {
        token.alive = false
        if (token.root) token.root.visible = false
      }
    }

    handleRef.current = {
      maybeSpawn(x, y, z) {
        if (Math.random() >= BUFF_DROP_CHANCE) return false
        for (const token of list) {
          if (token.alive || !token.root) continue
          const kind: BuffKind = Math.random() < 0.5 ? 'speed' : 'firerate'
          token.alive = true
          token.kind = kind
          token.life = TOKEN_LIFETIME * (0.85 + Math.random() * 0.3)
          token.spin = 0.9 + Math.random() * 0.8
          token.bob = Math.random() * Math.PI * 2
          token.vx = (Math.random() - 0.5) * 1.2
          token.vy = (Math.random() - 0.5) * 0.8
          token.vz = (Math.random() - 0.5) * 1.2
          token.root.position.set(x, y, z)
          token.root.visible = true
          applyKindVisual(token, kind)
          return true
        }
        return false
      },
      collect(point, radius) {
        const reach = radius + PICKUP_PAD
        const reach2 = reach * reach
        let best: Token | null = null
        let bestDist = Infinity
        for (const token of list) {
          if (!token.alive || !token.root) continue
          const d2 = token.root.position.distanceToSquared(point)
          if (d2 < reach2 && d2 < bestDist) {
            bestDist = d2
            best = token
          }
        }
        if (!best || !best.root) return null
        const kind = best.kind
        best.alive = false
        best.root.visible = false
        return kind
      },
      clear,
    }

    return () => {
      handleRef.current = null
    }
  }, [handleRef])

  useLayoutEffect(() => {
    return () => {
      geometries.aura.dispose()
      geometries.halo.dispose()
      geometries.gem.dispose()
    }
  }, [geometries])

  useFrame(({ clock }, delta) => {
    if (paused) return
    const dt = Math.min(delta, 0.05)
    const t = clock.elapsedTime
    const magnet = magnetTargetRef?.current
    if (magnet) magnet.getWorldPosition(_magnet)

    for (const token of pool.current) {
      if (!token.alive || !token.root) continue

      token.life -= dt
      if (token.life <= 0) {
        token.alive = false
        token.root.visible = false
        continue
      }

      const magnetState = magnet
        ? stepPickupMagnet(token.root.position, token, _magnet, dt)
        : 'none'
      const pulling = magnetState !== 'none'

      if (!pulling) {
        token.root.position.x += token.vx * dt
        token.root.position.y += token.vy * dt
        token.root.position.z += token.vz * dt
        token.vx *= Math.exp(-0.35 * dt)
        token.vy *= Math.exp(-0.35 * dt)
        token.vz *= Math.exp(-0.35 * dt)
        token.root.position.y += Math.sin(token.bob) * 0.005
      }

      token.bob += dt * 2.2
      const pulse = 0.82 + 0.18 * Math.sin(t * 5.5 + token.bob)
      token.root.rotation.y += token.spin * dt

      const fade = Math.min(1, token.life / 3)
      if (token.aura) {
        ;(token.aura.material as MeshBasicMaterial).opacity =
          0.16 * pulse * fade
        token.aura.scale.setScalar(0.95 + pulse * 0.12)
      }
      if (token.halo) {
        ;(token.halo.material as MeshBasicMaterial).opacity =
          0.4 * pulse * fade
      }
      if (token.gem) {
        ;(token.gem.material as MeshBasicMaterial).opacity = 0.95 * fade
      }
    }
  })

  return (
    <group>
      {pool.current.map((token, i) => (
        <group
          key={i}
          ref={(root) => {
            token.root = root
          }}
          visible={false}
        >
          {/* Soft round aura — additive meshes fake the glow; no real lights */}
          <mesh
            ref={(mesh) => {
              token.aura = mesh
            }}
            geometry={geometries.aura}
          >
            <meshBasicMaterial
              color="#5cffd0"
              transparent
              opacity={0.16}
              depthWrite={false}
              blending={AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
          <mesh
            ref={(mesh) => {
              token.halo = mesh
            }}
            geometry={geometries.halo}
          >
            <meshBasicMaterial
              color="#5cffd0"
              transparent
              opacity={0.4}
              depthWrite={false}
              blending={AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
          <mesh
            ref={(mesh) => {
              token.gem = mesh
            }}
            scale={[0.55, 0.85, 0.55]}
            geometry={geometries.gem}
          >
            <meshBasicMaterial
              color="#eafff8"
              transparent
              opacity={0.95}
              depthWrite={false}
              blending={AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  )
}
