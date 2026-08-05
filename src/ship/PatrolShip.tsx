import { Billboard } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import {
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from 'react'
import {
  AdditiveBlending,
  DoubleSide,
  Group,
  Object3D,
  Quaternion,
  Vector3,
  type MeshBasicMaterial,
} from 'three'
import type { BanditCombatState } from '@/combat/combatHud'
import {
  BELT_INNER,
  BELT_OUTER,
  BELT_PLANET_SIZE,
} from '@/game/systemConfig'
import { HitSpark } from '@/ship/HitSpark'
import { EXPLOSION_LIFETIME, ShipExplosion } from '@/ship/ShipExplosion'
import { ShipHealthBar } from '@/ship/ShipHealthBar'
import { ShipThrusters } from '@/ship/ShipThrusters'
import {
  GunHardpoints,
  ProjectileField,
  type LaserTarget,
  type WeaponsHandle,
} from '@/ship/ShipWeapons'
import { Spaceship } from '@/ship/Spaceship'
import {
  avoidSphere,
  dirToward,
  steerWithAvoidance,
} from '@/ship/banditMath'

type PatrolMode = 'patrol' | 'intervene' | 'cooldown'

type PatrolShipProps = {
  scale?: number
  sunPosition: [number, number, number]
  sunSize: number
  thalassaRef: RefObject<Object3D | null>
  thalassaRadius?: number
  /** Spawn at station, then cruise the belt */
  stationRef: RefObject<Object3D | null>
  mapRef?: RefObject<Group | null>
  /** Bandit hulls this peacekeeper can suppress */
  banditRefs: RefObject<Object3D | null>[]
  banditLaserHitRefs: MutableRefObject<LaserTarget | null>[]
  banditCombatRefs: RefObject<BanditCombatState>[]
  /** So bandits can return fire */
  patrolLaserHitRef: MutableRefObject<LaserTarget | null>
  paused?: boolean
  /** Long-range sensors amplify the contact beacon. */
  sensorsOwned?: boolean
}

const PATROL_HP = 110
const PATROL_DAMAGE_FLASH = 0.12
const RESPAWN_DELAY = EXPLOSION_LIFETIME + 5
/** Soft hits — skirmish, don't delete bandits in one pass */
const SUPPRESS_DAMAGE = 9
const STATION_CLEARANCE = 4.2
const THALASSA_KEEP_OUT = BELT_PLANET_SIZE + 33
const SUN_KEEP_OUT_PAD = 84
const PATROL_SCALE_MUL = 1.35
/** Sun-centered belt cruise (same ring bandits use) */
const BELT_ORBIT = (BELT_INNER + BELT_OUTER) * 0.5
const BELT_RADIAL_BLEND = Math.max(280, (BELT_OUTER - BELT_INNER) * 0.85)
const BELT_CRUISE = 48
const INTERVENE_CRUISE = 34
const ORBIT_CRUISE = 18
/** Only step in when a bandit is already on the player, or right on top of us */
const INTERVENE_RANGE = 280
const CONTACT_RANGE = 42
const LOSE_RANGE = 380
const FIRE_RANGE = 32
const FIRE_COS = Math.cos((50 * Math.PI) / 180)
const COMBAT_ORBIT = 22
const COMBAT_ORBIT_BLEND = 9
/** Short burst of authority, then stand down */
const INTERVENE_MAX = 6.5
const COOLDOWN_TIME = 18
const FIRE_COOLDOWN = 0.62
const BELT_RETURN_KICK = 48

const _sun = new Vector3()
const _thalassa = new Vector3()
const _station = new Vector3()
const _target = new Vector3()
const _forward = new Vector3()
const _right = new Vector3()
const _up = new Vector3()
const _wish = new Vector3()
const _dir = new Vector3()
const _avoid = new Vector3()
const _steer = new Vector3()
const _radial = new Vector3()
const _tangent = new Vector3()
const _aim = new Vector3()
const _worldUp = new Vector3(0, 1, 0)
const _zeroVel = new Vector3()
const _q = new Quaternion()
const _qFrom = new Quaternion()

function steerBeltCruise(
  position: Vector3,
  sun: Vector3,
  out: Vector3,
): { r: number; radialW: number } {
  _radial.copy(position).sub(sun)
  const r = _radial.length()
  if (r < 1e-4) {
    out.set(1, 0, 0)
    return { r: 0, radialW: 1 }
  }
  _radial.multiplyScalar(1 / r)
  _tangent.crossVectors(_worldUp, _radial)
  if (_tangent.lengthSq() < 1e-8) _tangent.set(0, 0, 1)
  _tangent.normalize()

  const radialErr = BELT_ORBIT - r
  const radialW = Math.max(-1, Math.min(1, radialErr / BELT_RADIAL_BLEND))
  const tangentW = Math.sqrt(Math.max(0.05, 1 - radialW * radialW))
  out.copy(_radial).multiplyScalar(radialW).addScaledVector(_tangent, tangentW)
  if (out.lengthSq() < 1e-8) out.copy(_tangent)
  else out.normalize()
  return { r, radialW }
}

function steerCombatOrbit(
  position: Vector3,
  prey: Vector3,
  out: Vector3,
): number {
  _radial.copy(position).sub(prey)
  const sep = _radial.length()
  if (sep < 1e-4) {
    out.set(1, 0, 0)
    return 0
  }
  _radial.multiplyScalar(1 / sep)
  _tangent.crossVectors(_worldUp, _radial)
  if (_tangent.lengthSq() < 1e-8) _tangent.set(0, 0, 1)
  _tangent.normalize()

  const radialAwayW = Math.max(
    -1,
    Math.min(1, (COMBAT_ORBIT - sep) / COMBAT_ORBIT_BLEND),
  )
  const tangentW = Math.sqrt(Math.max(0.35, 1 - radialAwayW * radialAwayW))
  out
    .copy(_radial)
    .multiplyScalar(radialAwayW)
    .addScaledVector(_tangent, tangentW)
  if (out.lengthSq() < 1e-8) out.copy(_tangent)
  else out.normalize()
  return sep
}

type Burst = { id: number; position: Vector3 }
type Spark = { id: number; position: Vector3 }

/**
 * Friendly belt peacekeeper — spawns at Thalassa Station, cruises the belt,
 * and briefly suppresses bandits that are attacking the player (or crowding the
 * patrol). Not a deathmatch bot: soft damage, short interventions, long cooldown.
 */
export function PatrolShip({
  scale = 0.08,
  sunPosition,
  sunSize,
  thalassaRef,
  thalassaRadius = BELT_PLANET_SIZE,
  stationRef,
  mapRef,
  banditRefs,
  banditLaserHitRefs,
  banditCombatRefs,
  patrolLaserHitRef,
  paused = false,
  sensorsOwned = false,
}: PatrolShipProps) {
  const root = useRef<Group>(null!)
  const velocity = useRef(new Vector3())
  const mode = useRef<PatrolMode>('patrol')
  const modeTimer = useRef(0)
  const focusIndex = useRef(-1)
  const hp = useRef(PATROL_HP)
  const pendingDamage = useRef(0)
  const respawnTimer = useRef(-1)
  const fireCooldown = useRef(0)
  const nextGun = useRef(0)
  const thrustGlow = useRef(0)
  const weapons = useRef<WeaponsHandle | null>(null)
  const leftMuzzle = useRef<Object3D>(null!)
  const rightMuzzle = useRef<Object3D>(null!)
  const spawned = useRef(false)
  const burstId = useRef(0)
  const sparkId = useRef(0)
  const beaconPulse = useRef(0)
  const beaconRingMat = useRef<MeshBasicMaterial | null>(null)
  const hpRatio = useRef(1)
  const showHealth = useRef(false)
  const [hidden, setHidden] = useState(false)
  const [ready, setReady] = useState(false)
  const [bursts, setBursts] = useState<Burst[]>([])
  const [sparks, setSparks] = useState<Spark[]>([])
  const [hurtTint, setHurtTint] = useState(false)

  const visualScale = scale * PATROL_SCALE_MUL
  const shipPad = Math.max(visualScale * 0.9, 0.05)
  const beaconMul = sensorsOwned ? 1.85 : 1
  const beaconLightBoost = sensorsOwned ? 2.2 : 1

  const trySpawnAtStation = (group: Group): boolean => {
    const station = stationRef.current
    const planet = thalassaRef.current
    if (!station || !planet) return false

    station.updateWorldMatrix(true, false)
    planet.updateWorldMatrix(true, false)
    station.getWorldPosition(_station)
    planet.getWorldPosition(_thalassa)

    const stationDist = _station.distanceTo(_thalassa)
    if (
      !Number.isFinite(stationDist) ||
      stationDist < thalassaRadius * 0.5 ||
      stationDist > thalassaRadius + 80
    ) {
      return false
    }

    _dir.copy(_station).sub(_thalassa)
    if (_dir.lengthSq() < 1e-6) _dir.set(1, 0, 0)
    else _dir.normalize()

    group.position.copy(_station).addScaledVector(_dir, STATION_CLEARANCE)
    velocity.current.set(0, 0, 0)

    // Face out toward the belt
    _sun.set(...sunPosition)
    _wish.copy(group.position).sub(_sun)
    if (_wish.lengthSq() < 1e-6) _wish.set(1, 0, 0)
    else _wish.normalize()
    _tangent.crossVectors(_worldUp, _wish)
    if (_tangent.lengthSq() < 1e-8) _tangent.set(0, 0, 1)
    _tangent.normalize()
    group.lookAt(
      group.position.x - _tangent.x,
      group.position.y - _tangent.y,
      group.position.z - _tangent.z,
    )
    return true
  }

  useLayoutEffect(() => {
    patrolLaserHitRef.current = {
      impact(point, pad, damage) {
        if (respawnTimer.current >= 0 || hidden || !spawned.current) return false
        const group = root.current
        if (!group) return false
        if (group.position.distanceTo(point) > pad + shipPad) return false
        pendingDamage.current += damage ?? 10
        setHurtTint(true)
        window.setTimeout(() => setHurtTint(false), PATROL_DAMAGE_FLASH * 1000)
        const id = ++sparkId.current
        const position = point.clone()
        setSparks((list) => [...list, { id, position }])
        return true
      },
    }
    return () => {
      patrolLaserHitRef.current = null
    }
  }, [patrolLaserHitRef, shipPad, hidden])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const group = root.current
    if (!group) return

    if (!spawned.current) {
      if (!trySpawnAtStation(group)) return
      spawned.current = true
      hp.current = PATROL_HP
      mode.current = 'patrol'
      setHidden(false)
      setReady(true)
    }

    beaconPulse.current += dt
    if (beaconRingMat.current) {
      beaconRingMat.current.opacity = sensorsOwned
        ? 0.5 + 0.45 * Math.sin(beaconPulse.current * 4.8)
        : 0.4 + 0.35 * Math.sin(beaconPulse.current * 4.2)
    }

    if (mapRef) mapRef.current = group

    if (paused) {
      thrustGlow.current = 0
      hpRatio.current = hp.current / PATROL_HP
      showHealth.current = mode.current === 'intervene' && respawnTimer.current < 0
      return
    }

    if (respawnTimer.current >= 0) {
      respawnTimer.current -= dt
      thrustGlow.current = 0
      showHealth.current = false
      if (respawnTimer.current <= 0) {
        if (!trySpawnAtStation(group)) return
        respawnTimer.current = -1
        hp.current = PATROL_HP
        mode.current = 'cooldown'
        modeTimer.current = COOLDOWN_TIME * 0.5
        focusIndex.current = -1
        pendingDamage.current = 0
        setHidden(false)
      }
      return
    }

    if (pendingDamage.current > 0) {
      hp.current = Math.max(0, hp.current - pendingDamage.current)
      pendingDamage.current = 0
      if (hp.current <= 0) {
        velocity.current.set(0, 0, 0)
        weapons.current?.clear()
        setHidden(true)
        respawnTimer.current = RESPAWN_DELAY
        showHealth.current = false
        const id = ++burstId.current
        setBursts((list) => [
          ...list,
          { id, position: group.position.clone() },
        ])
        return
      }
    }

    hpRatio.current = hp.current / PATROL_HP
    _sun.set(...sunPosition)
    const planet = thalassaRef.current
    if (planet) planet.getWorldPosition(_thalassa)

    // Pick a bandit worth intervening on
    let bestIdx = -1
    let bestDist = Infinity
    let bestPriority = 0
    for (let i = 0; i < banditRefs.length; i++) {
      const bandit = banditRefs[i]?.current
      const combat = banditCombatRefs[i]?.current
      if (!bandit || !bandit.visible || !combat?.alive) continue
      const dist = group.position.distanceTo(
        bandit.getWorldPosition(_target),
      )
      // Prefer bandits already on the player; self-defense is secondary
      const priority = combat.engaged ? 2 : dist < CONTACT_RANGE ? 1 : 0
      if (priority === 0) continue
      if (dist > INTERVENE_RANGE && priority < 2) continue
      if (combat.engaged && dist > INTERVENE_RANGE) continue
      if (priority > bestPriority || (priority === bestPriority && dist < bestDist)) {
        bestPriority = priority
        bestDist = dist
        bestIdx = i
      }
    }

    if (mode.current === 'cooldown') {
      modeTimer.current -= dt
      if (modeTimer.current <= 0) mode.current = 'patrol'
      focusIndex.current = -1
    } else if (mode.current === 'intervene') {
      modeTimer.current -= dt
      const focus = focusIndex.current
      const bandit = focus >= 0 ? banditRefs[focus]?.current : null
      const combat = focus >= 0 ? banditCombatRefs[focus]?.current : null
      const stillValid =
        bandit &&
        bandit.visible &&
        combat?.alive &&
        group.position.distanceTo(bandit.getWorldPosition(_target)) < LOSE_RANGE
      if (!stillValid || modeTimer.current <= 0) {
        mode.current = 'cooldown'
        modeTimer.current = COOLDOWN_TIME
        focusIndex.current = -1
      }
    } else if (bestIdx >= 0) {
      // Start a short suppression pass
      mode.current = 'intervene'
      modeTimer.current = INTERVENE_MAX
      focusIndex.current = bestIdx
    }

    const intervening = mode.current === 'intervene'
    const focus = focusIndex.current
    const focusBandit =
      intervening && focus >= 0 ? banditRefs[focus]?.current : null
    let preyDist = Infinity
    if (focusBandit) {
      focusBandit.getWorldPosition(_target)
      preyDist = group.position.distanceTo(_target)
    }

    showHealth.current = intervening
    let patrolRadialW = 0
    let combatSep = preyDist

    if (intervening && focusBandit) {
      combatSep = steerCombatOrbit(group.position, _target, _dir)
    } else {
      const cruise = steerBeltCruise(group.position, _sun, _dir)
      patrolRadialW = cruise.radialW
    }

    if (planet && !intervening) {
      avoidSphere(group.position, _thalassa, THALASSA_KEEP_OUT, _avoid)
      if (_avoid.lengthSq() > 1e-6) {
        steerWithAvoidance(_dir, _avoid, 0.85, _steer)
        _dir.copy(_steer)
      }
    }

    const station = stationRef.current
    if (station && !intervening) {
      station.getWorldPosition(_station)
      avoidSphere(group.position, _station, STATION_CLEARANCE * 0.85, _avoid)
      if (_avoid.lengthSq() > 1e-6) {
        steerWithAvoidance(_dir, _avoid, 1.0, _steer)
        _dir.copy(_steer)
      }
    }

    const cruise = intervening
      ? combatSep > COMBAT_ORBIT * 2.2
        ? INTERVENE_CRUISE
        : ORBIT_CRUISE
      : BELT_CRUISE * (1 + Math.abs(patrolRadialW) * 2.4)
    _wish.copy(_dir).multiplyScalar(cruise)
    velocity.current.lerp(_wish, 1 - Math.exp(-5.2 * dt))
    group.position.addScaledVector(velocity.current, dt)

    if (intervening && focusBandit) {
      const liveSep = group.position.distanceTo(_target)
      if (liveSep < COMBAT_ORBIT * 0.55) {
        _radial.copy(group.position).sub(_target)
        if (_radial.lengthSq() < 1e-6) _radial.set(1, 0, 0)
        else _radial.normalize()
        group.position
          .copy(_target)
          .addScaledVector(_radial, COMBAT_ORBIT * 0.75)
        const toward = velocity.current.dot(_radial)
        if (toward < 0) velocity.current.addScaledVector(_radial, -toward + 2)
        combatSep = COMBAT_ORBIT * 0.75
      }
    }

    const sunKeep = sunSize + SUN_KEEP_OUT_PAD
    _radial.copy(group.position).sub(_sun)
    let rNow = _radial.length()
    if (rNow < 1e-4) {
      _radial.set(1, 0, 0)
      rNow = 0
    } else {
      _radial.multiplyScalar(1 / rNow)
    }
    if (rNow < sunKeep) {
      group.position.copy(_sun).addScaledVector(_radial, sunKeep + 2)
      velocity.current.copy(_radial).multiplyScalar(cruise)
      rNow = sunKeep + 2
    } else if (!intervening && rNow > BELT_OUTER + 80) {
      velocity.current.addScaledVector(_radial, -BELT_RETURN_KICK)
    }

    if (planet) {
      const d = group.position.distanceTo(_thalassa)
      if (d < THALASSA_KEEP_OUT * 0.92) {
        _avoid.copy(group.position).sub(_thalassa).normalize()
        group.position
          .copy(_thalassa)
          .addScaledVector(_avoid, THALASSA_KEEP_OUT * 0.95)
        velocity.current.addScaledVector(_avoid, 8)
      }
    }

    if (intervening && focusBandit) {
      dirToward(group.position, _target, _aim)
      if (_aim.lengthSq() > 1e-8) {
        _steer.copy(group.position).sub(_aim)
        group.lookAt(_steer)
      }
    } else if (_dir.lengthSq() > 1e-6) {
      _qFrom.copy(group.quaternion)
      _steer.copy(group.position).sub(_dir)
      group.lookAt(_steer)
      _q.copy(group.quaternion)
      const turn = patrolRadialW > 0.4 ? 8 : 4.5
      group.quaternion.copy(_qFrom).slerp(_q, 1 - Math.exp(-turn * dt))
      group.quaternion.normalize()
    }

    _forward.set(0, 0, -1).applyQuaternion(group.quaternion)
    _right.set(1, 0, 0).applyQuaternion(group.quaternion)
    _up.set(0, 1, 0).applyQuaternion(group.quaternion)

    thrustGlow.current +=
      ((intervening ? 0.9 : 0.55) - thrustGlow.current) *
      (1 - Math.exp(-8 * dt))

    fireCooldown.current = Math.max(0, fireCooldown.current - dt)
    if (intervening && focusBandit) {
      dirToward(group.position, _target, _aim)
    }
    const aimDot =
      intervening && _aim.lengthSq() > 1e-8 ? _forward.dot(_aim) : null
    if (
      intervening &&
      preyDist < FIRE_RANGE &&
      fireCooldown.current <= 0 &&
      _aim.lengthSq() > 1e-8 &&
      aimDot !== null &&
      aimDot > FIRE_COS
    ) {
      const side = nextGun.current % 2 === 0 ? -1 : 1
      nextGun.current++
      _wish
        .copy(group.position)
        .addScaledVector(_right, side * visualScale * 0.35)
        .addScaledVector(_up, -visualScale * 0.12)
        .addScaledVector(_aim, visualScale * 0.55)
      weapons.current?.fire(
        _wish,
        _aim,
        _zeroVel,
        70,
        1.6,
        SUPPRESS_DAMAGE,
      )
      fireCooldown.current = FIRE_COOLDOWN
    }
  }, -1)

  const laserTargets = useRef([...banditLaserHitRefs])
  for (let i = 0; i < banditLaserHitRefs.length; i++) {
    laserTargets.current[i] = banditLaserHitRefs[i]
  }

  return (
    <>
      <group
        ref={(node) => {
          root.current = node!
          if (mapRef) mapRef.current = node
        }}
        visible={ready && !hidden}
      >
        <Spaceship
          scale={visualScale}
          metalness={0.45}
          roughness={0.38}
          envMapIntensity={0.6}
          tint={hurtTint ? '#a8d8ff' : '#3a8ec8'}
        />
        <GunHardpoints
          scale={visualScale}
          leftMuzzle={leftMuzzle}
          rightMuzzle={rightMuzzle}
        />
        <ShipThrusters scale={visualScale} intensityRef={thrustGlow} />

        <Billboard follow position={[0, visualScale * 3.2, 0]}>
          <mesh>
            <sphereGeometry args={[visualScale * 1.35 * beaconMul, 16, 16]} />
            <meshBasicMaterial
              color="#4ec4ff"
              toneMapped={false}
              transparent
              opacity={sensorsOwned ? 1 : 0.95}
            />
          </mesh>
          <mesh>
            <ringGeometry
              args={[
                visualScale * 1.7 * beaconMul,
                visualScale * 2.6 * beaconMul,
                28,
              ]}
            />
            <meshBasicMaterial
              ref={(mat) => {
                beaconRingMat.current = mat
              }}
              color="#8ad8ff"
              toneMapped={false}
              transparent
              opacity={0.65}
              side={DoubleSide}
              depthWrite={false}
              blending={AdditiveBlending}
            />
          </mesh>
        </Billboard>
        <ShipHealthBar
          y={visualScale * 5.1}
          width={visualScale * 5.2}
          height={visualScale * 0.55}
          ratioRef={hpRatio}
          visibleRef={showHealth}
          fillColor="#6ec8ff"
          lowColor="#3a8ec8"
        />
        <pointLight
          color="#4ec4ff"
          intensity={1.8 * beaconLightBoost}
          distance={24 * (sensorsOwned ? 2.1 : 1)}
          decay={2}
          position={[0, visualScale * 2.4, 0]}
        />
      </group>
      <ProjectileField
        weapons={weapons}
        sunPosition={sunPosition}
        sunSize={sunSize}
        scale={visualScale}
        poolSize={16}
        laserTargets={laserTargets.current}
        boltColor={{
          glow: '#2a9dff',
          mid: '#6ec8ff',
          core: '#e8f6ff',
        }}
        paused={paused || hidden || !ready}
      />
      {bursts.map((burst) => (
        <ShipExplosion
          key={burst.id}
          position={burst.position}
          scale={visualScale}
          onDone={() =>
            setBursts((list) => list.filter((b) => b.id !== burst.id))
          }
        />
      ))}
      {sparks.map((spark) => (
        <HitSpark
          key={spark.id}
          position={spark.position}
          scale={visualScale}
          color="#8ad8ff"
          onDone={() =>
            setSparks((list) => list.filter((s) => s.id !== spark.id))
          }
        />
      ))}
    </>
  )
}
