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
  ConeGeometry,
  CylinderGeometry,
  Group,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
  type Object3D,
} from 'three'
import { playTorpedoSound } from '@/audio/gameAudio'
import type { BanditCombatState } from '@/combat/combatHud'
import { TORPEDO_ABSOLUTE_MAX_AMMO } from '@/loot/shop'
import type { HazardField } from '@/ship/PlayerShip'
import type { LaserTarget } from '@/ship/ShipWeapons'

/** Simultaneous in-flight warheads — matches max magazine capacity. */
const MAX_TORPEDOES = TORPEDO_ABSOLUTE_MAX_AMMO
/**
 * Authored in world units. Ship mesh scale is tiny (~0.08); warheads stay
 * readable in flight by ignoring that crush factor (see visualScale below).
 */
const BODY_LEN = 0.55
const BODY_R = 0.055
const NOSE_LEN = 0.22
const TRAIL_LEN = 1.35
const AURA_R = 0.28
const _dir = new Vector3()
const _wish = new Vector3()
const _vel = new Vector3()
const _sun = new Vector3()
const _target = new Vector3()
const _yAxis = new Vector3(0, 1, 0)

type Slot = {
  root: Group | null
  active: boolean
  life: number
  speed: number
  vx: number
  vy: number
  vz: number
  /** Index into seekTargets; -1 = fly straight. */
  targetIndex: number
  damage: number
}

export type TorpedoSeekTarget = {
  object: RefObject<Object3D | null>
  combat: RefObject<BanditCombatState>
}

export type TorpedoesHandle = {
  fire: (
    origin: Vector3,
    direction: Vector3,
    inheritVelocity: Vector3,
    speed: number,
    life: number,
    targetIndex: number,
    damage: number,
  ) => boolean
  clear: () => void
}

type TorpedoFieldProps = {
  torpedoes: MutableRefObject<TorpedoesHandle | null>
  sunPosition: [number, number, number]
  sunSize: number
  scale?: number
  hazardFields?: RefObject<HazardField | null>[]
  laserTargets?: RefObject<LaserTarget | null>[]
  seekTargets?: TorpedoSeekTarget[]
  /** Radians per second — how hard the warhead can turn. */
  turnRate?: number
  paused: boolean
}

function orientTorpedo(root: Group, beamDir: Vector3) {
  root.quaternion.setFromUnitVectors(_yAxis, beamDir)
}

export function TorpedoField({
  torpedoes,
  sunPosition,
  sunSize,
  scale = 1,
  hazardFields,
  laserTargets,
  seekTargets,
  turnRate = 2.8,
  paused,
}: TorpedoFieldProps) {
  // Keep warheads world-readable even when the craft mesh is miniature.
  const visualScale = Math.max(scale * 12, 0.55)
  const bodyLen = BODY_LEN * visualScale
  const bodyR = BODY_R * visualScale
  const noseLen = NOSE_LEN * visualScale
  const trailLen = TRAIL_LEN * visualScale
  const auraR = AURA_R * visualScale
  const pool = useRef<Slot[]>(
    Array.from({ length: MAX_TORPEDOES }, () => ({
      root: null,
      active: false,
      life: 0,
      speed: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      targetIndex: -1,
      damage: 70,
    })),
  )

  const shared = useMemo(() => {
    return {
      bodyGeo: new CylinderGeometry(bodyR * 0.85, bodyR, bodyLen, 10, 1),
      noseGeo: new ConeGeometry(bodyR * 0.95, noseLen, 10, 1),
      glowGeo: new SphereGeometry(bodyR * 1.8, 12, 10),
      auraGeo: new SphereGeometry(auraR, 14, 12),
      trailGeo: new ConeGeometry(bodyR * 1.15, trailLen, 10, 1),
      trailCoreGeo: new ConeGeometry(bodyR * 0.45, trailLen * 0.85, 8, 1),
      bodyMat: new MeshBasicMaterial({
        color: '#6a88a8',
        toneMapped: false,
      }),
      noseMat: new MeshBasicMaterial({
        color: '#f0f8ff',
        toneMapped: false,
      }),
      glowMat: new MeshBasicMaterial({
        color: '#9ad8ff',
        toneMapped: false,
        depthWrite: false,
        blending: AdditiveBlending,
        transparent: true,
        opacity: 0.85,
      }),
      auraMat: new MeshBasicMaterial({
        color: '#4aa8ff',
        toneMapped: false,
        depthWrite: false,
        blending: AdditiveBlending,
        transparent: true,
        opacity: 0.32,
      }),
      trailMat: new MeshBasicMaterial({
        color: '#5ec0ff',
        toneMapped: false,
        depthWrite: false,
        blending: AdditiveBlending,
        transparent: true,
        opacity: 0.65,
      }),
      trailCoreMat: new MeshBasicMaterial({
        color: '#ffffff',
        toneMapped: false,
        depthWrite: false,
        blending: AdditiveBlending,
        transparent: true,
        opacity: 0.95,
      }),
    }
  }, [bodyLen, bodyR, noseLen, trailLen, auraR])

  useEffect(() => {
    return () => {
      shared.bodyGeo.dispose()
      shared.noseGeo.dispose()
      shared.glowGeo.dispose()
      shared.auraGeo.dispose()
      shared.trailGeo.dispose()
      shared.trailCoreGeo.dispose()
      shared.bodyMat.dispose()
      shared.noseMat.dispose()
      shared.glowMat.dispose()
      shared.auraMat.dispose()
      shared.trailMat.dispose()
      shared.trailCoreMat.dispose()
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

    torpedoes.current = {
      fire(origin, direction, inheritVelocity, speed, life, targetIndex, damage) {
        for (const slot of list) {
          if (slot.active || !slot.root) continue
          _dir.copy(direction)
          if (_dir.lengthSq() < 1e-8) _dir.set(0, 0, -1)
          else _dir.normalize()

          slot.active = true
          slot.life = life
          slot.speed = speed
          slot.targetIndex = targetIndex
          slot.damage = damage
          // Mild inherit so launch feels ship-linked without throwing aim off
          slot.vx = _dir.x * speed + inheritVelocity.x * 0.35
          slot.vy = _dir.y * speed + inheritVelocity.y * 0.35
          slot.vz = _dir.z * speed + inheritVelocity.z * 0.35
          // Renormalize toward launch speed
          _vel.set(slot.vx, slot.vy, slot.vz)
          const len = _vel.length()
          if (len > 1e-6) {
            _vel.multiplyScalar(speed / len)
            slot.vx = _vel.x
            slot.vy = _vel.y
            slot.vz = _vel.z
          }
          slot.root.position.copy(origin).addScaledVector(_dir, bodyLen * 0.6)
          orientTorpedo(slot.root, _dir)
          slot.root.visible = true
          playTorpedoSound(0.34)
          return true
        }
        return false
      },
      clear,
    }

    return () => {
      torpedoes.current = null
    }
  }, [torpedoes, bodyLen])

  useFrame((_, delta) => {
    if (paused) return
    const dt = Math.min(delta, 0.05)
    _sun.set(...sunPosition)
    const hitR2 = (sunSize * 1.05) ** 2
    const hitPad = Math.max(bodyR * 3.2, 0.08)
    const maxTurn = turnRate * dt

    for (const slot of pool.current) {
      if (!slot.active || !slot.root) continue

      // Seek locked target while it remains alive
      const seek = seekTargets?.[slot.targetIndex]
      const combat = seek?.combat.current
      const obj = seek?.object.current
      if (combat?.alive && obj) {
        obj.getWorldPosition(_target)
        _wish.copy(_target).sub(slot.root.position)
        if (_wish.lengthSq() > 1e-8) {
          _wish.normalize()
          _vel.set(slot.vx, slot.vy, slot.vz)
          const speed = Math.max(slot.speed, _vel.length())
          if (_vel.lengthSq() < 1e-8) {
            _vel.copy(_wish).multiplyScalar(speed)
          } else {
            _vel.normalize()
            const dot = Math.max(-1, Math.min(1, _vel.dot(_wish)))
            const angle = Math.acos(dot)
            if (angle < 1e-4 || angle <= maxTurn) {
              _vel.copy(_wish)
            } else {
              // Rodrigues-style slerp on the unit sphere
              const axis = _dir.copy(_vel).cross(_wish)
              if (axis.lengthSq() < 1e-10) {
                _vel.copy(_wish)
              } else {
                axis.normalize()
                _vel.applyAxisAngle(axis, maxTurn)
              }
            }
            _vel.multiplyScalar(speed)
          }
          slot.vx = _vel.x
          slot.vy = _vel.y
          slot.vz = _vel.z
          slot.speed = speed
        }
      }

      slot.life -= dt
      slot.root.position.x += slot.vx * dt
      slot.root.position.y += slot.vy * dt
      slot.root.position.z += slot.vz * dt

      _dir.set(slot.vx, slot.vy, slot.vz)
      if (_dir.lengthSq() > 1e-8) {
        _dir.normalize()
        orientTorpedo(slot.root, _dir)
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
            fieldRef.current?.impact?.(slot.root.position, hitPad, _dir)
          ) {
            consumed = true
            break
          }
        }
      }

      if (!consumed && laserTargets) {
        // Prefer the locked target when present so we don't clip friendlies first
        const order: number[] = []
        if (
          slot.targetIndex >= 0 &&
          slot.targetIndex < laserTargets.length
        ) {
          order.push(slot.targetIndex)
        }
        for (let i = 0; i < laserTargets.length; i++) {
          if (i !== slot.targetIndex) order.push(i)
        }
        for (const i of order) {
          if (
            laserTargets[i]?.current?.impact(
              slot.root.position,
              hitPad,
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
          frustumCulled={false}
        >
          {/* Body along +Y; nose toward +Y tip */}
          <mesh
            frustumCulled={false}
            position={[0, 0, 0]}
            geometry={shared.bodyGeo}
            material={shared.bodyMat}
          />
          <mesh
            frustumCulled={false}
            position={[0, bodyLen * 0.5 + noseLen * 0.35, 0]}
            geometry={shared.noseGeo}
            material={shared.noseMat}
          />
          <mesh
            frustumCulled={false}
            position={[0, bodyLen * 0.5 + noseLen * 0.55, 0]}
            geometry={shared.glowGeo}
            material={shared.glowMat}
          />
          <mesh
            frustumCulled={false}
            position={[0, bodyLen * 0.15, 0]}
            geometry={shared.auraGeo}
            material={shared.auraMat}
          />
          <mesh
            frustumCulled={false}
            position={[0, -bodyLen * 0.5 - trailLen * 0.42, 0]}
            rotation={[Math.PI, 0, 0]}
            geometry={shared.trailGeo}
            material={shared.trailMat}
          />
          <mesh
            frustumCulled={false}
            position={[0, -bodyLen * 0.5 - trailLen * 0.36, 0]}
            rotation={[Math.PI, 0, 0]}
            geometry={shared.trailCoreGeo}
            material={shared.trailCoreMat}
          />
        </group>
      ))}
    </group>
  )
}
