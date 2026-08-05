import { useFrame } from '@react-three/fiber'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type RefObject,
} from 'react'
import {
  AdditiveBlending,
  CylinderGeometry,
  Group,
  MeshBasicMaterial,
  Object3D,
  Vector3,
} from 'three'
import { playLaserSound } from '@/audio/gameAudio'
import type { HazardField } from '@/ship/PlayerShip'

const MAX_PROJECTILES = 48
/**
 * Bolt size is in ship-local units (× ship scale), matched to gun barrels
 * (barrelR ≈ 0.018·scale) so tracers stay muzzle-thin.
 */
const BEAM_LENGTH = 11
const GLOW_R = 0.038
const MID_R = 0.02
const CORE_R = 0.009
const _dir = new Vector3()
const _sun = new Vector3()
const _yAxis = new Vector3(0, 1, 0)

type Slot = {
  root: Group | null
  active: boolean
  life: number
  vx: number
  vy: number
  vz: number
  /** Optional HP to apply on laser-target impact */
  damage: number | undefined
}

export type WeaponsHandle = {
  fire: (
    origin: Vector3,
    direction: Vector3,
    inheritVelocity: Vector3,
    speed: number,
    life: number,
    damage?: number,
  ) => boolean
  clear: () => void
}

export { playLaserSound } from '@/audio/gameAudio'

/** Something a laser bolt / warhead can strike (ships, etc.). */
export type LaserTarget = {
  /**
   * @param damage Optional hit points; defaults are per-target (player / bandit).
   * @returns true if the projectile was consumed by this target.
   */
  impact: (point: Vector3, pad: number, damage?: number) => boolean
}

type ProjectileFieldProps = {
  weapons: MutableRefObject<WeaponsHandle | null>
  sunPosition: [number, number, number]
  sunSize: number
  /** Ship scale — beams shrink/grow with the craft */
  scale?: number
  /** Active bolt slots (default 48). Keep NPC pools smaller. */
  poolSize?: number
  /** Asteroid belts / debris fields that lasers can break apart */
  hazardFields?: RefObject<HazardField | null>[]
  /** Extra laser hit targets (enemy / player hulls) */
  laserTargets?: RefObject<LaserTarget | null>[]
  /** Bolt color override for NPC weapons */
  boltColor?: { glow: string; mid: string; core: string }
  paused: boolean
}

/** CylinderGeometry is +Y; align that axis with the bolt direction. */
function orientBeam(root: Group, beamDir: Vector3) {
  root.quaternion.setFromUnitVectors(_yAxis, beamDir)
}

export function ProjectileField({
  weapons,
  sunPosition,
  sunSize,
  scale = 1,
  poolSize = MAX_PROJECTILES,
  hazardFields,
  laserTargets,
  boltColor,
  paused,
}: ProjectileFieldProps) {
  const beamLength = BEAM_LENGTH * scale
  const glowR = GLOW_R * scale
  const midR = MID_R * scale
  const coreR = CORE_R * scale
  const slots = Math.max(1, Math.min(MAX_PROJECTILES, poolSize | 0))
  const pool = useRef<Slot[]>(
    Array.from({ length: slots }, () => ({
      root: null,
      active: false,
      life: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      damage: undefined,
    })),
  )
  const beamLengthRef = useRef(beamLength)
  beamLengthRef.current = beamLength

  const glow = boltColor?.glow ?? '#ff3a28'
  const mid = boltColor?.mid ?? '#ff7a55'
  const core = boltColor?.core ?? '#fff8f2'

  // One geo/mat set shared by the whole pool (avoids 100s of GPU allocations)
  const shared = useMemo(() => {
    const len = beamLength
    return {
      glowGeo: new CylinderGeometry(glowR * 0.55, glowR, len, 8, 1),
      midGeo: new CylinderGeometry(midR * 0.65, midR, len * 0.96, 8, 1),
      coreGeo: new CylinderGeometry(coreR * 0.7, coreR, len * 0.92, 6, 1),
      glowMat: new MeshBasicMaterial({
        color: glow,
        toneMapped: false,
        depthWrite: false,
        blending: AdditiveBlending,
        transparent: true,
        opacity: 0.35,
      }),
      midMat: new MeshBasicMaterial({
        color: mid,
        toneMapped: false,
        depthWrite: false,
        blending: AdditiveBlending,
        transparent: true,
        opacity: 0.7,
      }),
      coreMat: new MeshBasicMaterial({
        color: core,
        toneMapped: false,
        depthWrite: false,
        blending: AdditiveBlending,
        transparent: true,
        opacity: 1,
      }),
    }
  }, [beamLength, glowR, midR, coreR, glow, mid, core])

  useEffect(() => {
    return () => {
      shared.glowGeo.dispose()
      shared.midGeo.dispose()
      shared.coreGeo.dispose()
      shared.glowMat.dispose()
      shared.midMat.dispose()
      shared.coreMat.dispose()
    }
  }, [shared])

  useLayoutEffect(() => {
    const list = pool.current

    const clear = () => {
      for (const slot of list) {
        slot.active = false
        if (slot.root) slot.root.visible = false
      }
    }

    weapons.current = {
      fire(origin, direction, inheritVelocity, speed, life, damage) {
        for (const slot of list) {
          if (slot.active || !slot.root) continue
          _dir.copy(direction)
          if (_dir.lengthSq() < 1e-8) _dir.set(0, 0, -1)
          else _dir.normalize()

          slot.active = true
          slot.life = life
          slot.damage = damage
          slot.vx = _dir.x * speed + inheritVelocity.x
          slot.vy = _dir.y * speed + inheritVelocity.y
          slot.vz = _dir.z * speed + inheritVelocity.z
          slot.root.position
            .copy(origin)
            .addScaledVector(_dir, beamLengthRef.current * 0.45)
          orientBeam(slot.root, _dir)
          slot.root.visible = true
          playLaserSound(0.22)
          return true
        }
        return false
      },
      clear,
    }

    return () => {
      weapons.current = null
    }
  }, [weapons])

  useFrame((_, delta) => {
    if (paused) return
    const dt = Math.min(delta, 0.05)
    _sun.set(...sunPosition)
    const hitR2 = (sunSize * 1.05) ** 2
    // Pad tracks bolt thickness, not a fixed world blob
    const asteroidPad = Math.max(glowR * 2.5, 0.02)

    for (const slot of pool.current) {
      if (!slot.active || !slot.root) continue

      slot.life -= dt
      slot.root.position.x += slot.vx * dt
      slot.root.position.y += slot.vy * dt
      slot.root.position.z += slot.vz * dt

      _dir.set(slot.vx, slot.vy, slot.vz)
      if (_dir.lengthSq() > 1e-8) {
        _dir.normalize()
        orientBeam(slot.root, _dir)
      } else {
        _dir.set(0, 0, -1)
      }

      const dx = slot.root.position.x - _sun.x
      const dy = slot.root.position.y - _sun.y
      const dz = slot.root.position.z - _sun.z
      let consumed =
        slot.life <= 0 || dx * dx + dy * dy + dz * dz < hitR2

      if (!consumed && hazardFields) {
        for (const fieldRef of hazardFields) {
          if (
            fieldRef.current?.impact?.(
              slot.root.position,
              asteroidPad,
              _dir,
            )
          ) {
            consumed = true
            break
          }
        }
      }

      if (!consumed && laserTargets) {
        for (const targetRef of laserTargets) {
          if (
            targetRef.current?.impact(
              slot.root.position,
              asteroidPad,
              slot.damage,
            )
          ) {
            consumed = true
            break
          }
        }
      }

      if (consumed) {
        slot.active = false
        slot.root.visible = false
      }
    }
  }, -1)

  return (
    <group>
      {pool.current.map((slot, i) => (
        <group
          key={i}
          ref={(root) => {
            slot.root = root
          }}
          visible={false}
        >
          <mesh geometry={shared.glowGeo} material={shared.glowMat} />
          <mesh geometry={shared.midGeo} material={shared.midMat} />
          <mesh geometry={shared.coreGeo} material={shared.coreMat} />
        </group>
      ))}
    </group>
  )
}

type GunHardpointsProps = {
  scale: number
  leftMuzzle: RefObject<Object3D | null>
  rightMuzzle: RefObject<Object3D | null>
}

/** Twin wing-root cannons parented to the ship. */
export function GunHardpoints({
  scale,
  leftMuzzle,
  rightMuzzle,
}: GunHardpointsProps) {
  const s = scale
  const y = -0.08 * s
  const z = -0.12 * s
  const x = 0.32 * s
  // Slimmer, shorter barrels than before
  const barrelLen = 0.28 * s
  const barrelR = 0.018 * s

  return (
    <group>
      <Gun
        side={-1}
        x={x}
        y={y}
        z={z}
        barrelLen={barrelLen}
        barrelR={barrelR}
        muzzleRef={leftMuzzle}
      />
      <Gun
        side={1}
        x={x}
        y={y}
        z={z}
        barrelLen={barrelLen}
        barrelR={barrelR}
        muzzleRef={rightMuzzle}
      />
    </group>
  )
}

function Gun({
  side,
  x,
  y,
  z,
  barrelLen,
  barrelR,
  muzzleRef,
}: {
  side: -1 | 1
  x: number
  y: number
  z: number
  barrelLen: number
  barrelR: number
  muzzleRef: RefObject<Object3D | null>
}) {
  return (
    <group position={[side * x, y, z]}>
      {/* Mount collar */}
      <mesh position={[0, 0, 0.1 * barrelLen]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry
          args={[barrelR * 1.55, barrelR * 1.85, barrelLen * 0.28, 32, 1]}
        />
        <meshStandardMaterial color="#2a3340" metalness={0.45} roughness={0.5} />
      </mesh>
      {/* Main barrel */}
      <mesh position={[0, 0, -barrelLen * 0.38]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry
          args={[barrelR * 0.78, barrelR * 0.95, barrelLen, 32, 3]}
        />
        <meshStandardMaterial color="#1a222c" metalness={0.6} roughness={0.35} />
      </mesh>
      {/* Muzzle ring */}
      <mesh position={[0, 0, -barrelLen * 0.88]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry
          args={[barrelR * 1.05, barrelR * 1.15, barrelLen * 0.12, 32, 1]}
        />
        <meshStandardMaterial color="#243040" metalness={0.55} roughness={0.4} />
      </mesh>
      {/* Tip glow */}
      <mesh position={[0, 0, -barrelLen * 0.98]}>
        <sphereGeometry args={[barrelR * 0.95, 24, 16]} />
        <meshBasicMaterial color="#ff4a3a" toneMapped={false} />
      </mesh>
      <object3D ref={muzzleRef} position={[0, 0, -barrelLen * 1.12]} />
    </group>
  )
}

