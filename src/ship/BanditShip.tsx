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
  MERCURY_ORBIT,
  MERCURY_SIZE,
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
  hasLineOfSight,
  steerWithAvoidance,
  type Occluder,
} from '@/ship/banditMath'
import {
  DOCK_OFFER_RANGE,
  type CollisionHazard,
} from '@/ship/PlayerShip'

type BanditMode = 'patrol' | 'chase' | 'search'

type BanditShipProps = {
  scale?: number
  sunPosition: [number, number, number]
  sunSize: number
  thalassaRef: RefObject<Object3D | null>
  thalassaRadius?: number
  /** Wait for this body, then spawn beside its world position */
  hermesRef: RefObject<Object3D | null>
  hermesRadius?: number
  /** Station — player is combat-safe while inside its dock offer range */
  stationRef?: RefObject<Object3D | null>
  occluders?: CollisionHazard[]
  targetRef: RefObject<Object3D | null>
  playerLaserHitRef: MutableRefObject<LaserTarget | null>
  banditLaserHitRef: MutableRefObject<LaserTarget | null>
  hostileHazardRef: MutableRefObject<CollisionHazard | null>
  mapRef?: RefObject<Group | null>
  /** Live engagement / HP for combat HUD */
  combatStateRef?: MutableRefObject<BanditCombatState>
  paused?: boolean
}

const BANDIT_HP = 70
const BANDIT_DAMAGE_FLASH = 0.12
const RESPAWN_DELAY = EXPLOSION_LIFETIME + 4.5
const THALASSA_KEEP_OUT = BELT_PLANET_SIZE + 5.5
/** Clearance beyond Hermes' surface */
const HERMES_CLEARANCE = 6
/** Sun-centered belt patrol radius (mid annulus) */
const PATROL_ORBIT = (BELT_INNER + BELT_OUTER) * 0.5
/** Blend width for radial correction toward the belt ring */
const PATROL_RADIAL_BLEND = 90
const SUN_KEEP_OUT_PAD = 14
/** Scaled system — was 160, player never got inside (min preyDist ~191) */
const DETECT_RANGE = 420
const LOSE_RANGE = 620
const CONTACT_RANGE = 36
const FIRE_RANGE = 30
const FIRE_COS = Math.cos((55 * Math.PI) / 180)
const SEARCH_TIME = 8
/** Keep chase briefly through a flicker of occlusion, then investigate last seen */
const LOS_GRACE = 0.45
const PATROL_CRUISE = 16
/** Close the gap from long range */
const CHASE_APPROACH_CRUISE = 20
/** Strafe speed once in gunfight — must stay trackable vs player thrust (~24) */
const CHASE_ORBIT_CRUISE = 10
const SEARCH_CRUISE = 22
/** Hold this distance while attacking — never ram the player */
const COMBAT_ORBIT = 18
const COMBAT_ORBIT_BLEND = 8
const BANDIT_SCALE_MUL = 1.45

const _sun = new Vector3()
const _thalassa = new Vector3()
const _hermes = new Vector3()
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
const _lastSeen = new Vector3()
const _station = new Vector3()
const _worldUp = new Vector3(0, 1, 0)
const _zeroVel = new Vector3()
const _q = new Quaternion()
const _qFrom = new Quaternion()
const _occluders: Occluder[] = []

/**
 * Steer onto a sun-centered belt ring: outward/inward by radius error, plus tangent.
 * When prey is known, pick the tangent that closes angular distance (hunt their sector).
 */
function steerBeltPatrol(
  position: Vector3,
  sun: Vector3,
  out: Vector3,
  prey: Vector3 | null,
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

  if (prey) {
    _wish.copy(prey).sub(sun)
    // Which way around the ring shrinks the angle to the prey?
    if (_wish.dot(_tangent) < 0) _tangent.multiplyScalar(-1)
  }

  const radialErr = PATROL_ORBIT - r
  const radialW = Math.max(-1, Math.min(1, radialErr / PATROL_RADIAL_BLEND))
  const tangentW = Math.sqrt(Math.max(0.05, 1 - radialW * radialW))
  out.copy(_radial).multiplyScalar(radialW).addScaledVector(_tangent, tangentW)
  if (out.lengthSq() < 1e-8) out.copy(_tangent)
  else out.normalize()
  return { r, radialW }
}

/** Circle the prey at COMBAT_ORBIT — close in / back off, plus tangent strafe. */
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

  // +radial = away from prey. Want away when too close, toward when too far.
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
 * True when Hermes has a real on-orbit world position (not still at origin).
 */
function readHermesWorld(
  hermes: Object3D,
  sun: Vector3,
  out: Vector3,
): boolean {
  hermes.updateWorldMatrix(true, false)
  hermes.getWorldPosition(out)
  const dist = out.distanceTo(sun)
  return (
    Number.isFinite(dist) &&
    dist > MERCURY_ORBIT * 0.75 &&
    dist < MERCURY_ORBIT * 1.3
  )
}

export function BanditShip({
  scale = 0.08,
  sunPosition,
  sunSize,
  thalassaRef,
  thalassaRadius = BELT_PLANET_SIZE,
  hermesRef,
  hermesRadius = MERCURY_SIZE,
  stationRef,
  occluders = [],
  targetRef,
  playerLaserHitRef,
  banditLaserHitRef,
  hostileHazardRef,
  mapRef,
  combatStateRef,
  paused = false,
}: BanditShipProps) {
  const root = useRef<Group>(null!)
  const velocity = useRef(new Vector3())
  const mode = useRef<BanditMode>('patrol')
  const searchTimer = useRef(0)
  const losGrace = useRef(0)
  const hp = useRef(BANDIT_HP)
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

  const visualScale = scale * BANDIT_SCALE_MUL
  const shipPad = Math.max(visualScale * 0.9, 0.05)
  const hitRadius = Math.max(visualScale * 1.8, 0.14)

  const writeCombatState = (engaged: boolean, alive: boolean) => {
    if (!combatStateRef) return
    const state = combatStateRef.current
    state.engaged = engaged
    state.alive = alive
    state.hp = hp.current
    state.maxHp = BANDIT_HP
  }

  /** Place beside the given Hermes world position. */
  const placeNearHermes = (group: Group, hermesWorld: Vector3) => {
    _sun.set(...sunPosition)
    _dir.copy(hermesWorld).sub(_sun)
    if (_dir.lengthSq() < 1e-6) _dir.set(1, 0, 0)
    else _dir.normalize()
    _right.crossVectors(_worldUp, _dir)
    if (_right.lengthSq() < 1e-6) _right.set(0, 0, 1)
    _right.normalize()

    const pad = hermesRadius + HERMES_CLEARANCE
    group.position
      .copy(hermesWorld)
      .addScaledVector(_right, pad)
      .addScaledVector(_worldUp, hermesRadius * 0.4)
    velocity.current.set(0, 0, 0)

    const player = targetRef.current
    if (player) player.getWorldPosition(_target)
    else _target.copy(group.position).add(_right)
    dirToward(group.position, _target, _forward)
    if (_forward.lengthSq() < 1e-6) _forward.copy(_right)
    // Mesh lookAt aims +Z; nose is −Z — look behind the desired heading
    group.lookAt(
      group.position.x - _forward.x,
      group.position.y - _forward.y,
      group.position.z - _forward.z,
    )
  }

  /** @returns true once Hermes is ready and we've placed the ship */
  const trySpawnAtHermes = (group: Group): boolean => {
    const hermes = hermesRef.current
    if (!hermes) return false
    _sun.set(...sunPosition)
    if (!readHermesWorld(hermes, _sun, _hermes)) return false
    placeNearHermes(group, _hermes)
    return true
  }

  useLayoutEffect(() => {
    banditLaserHitRef.current = {
      impact(point, pad) {
        if (respawnTimer.current >= 0 || hidden || !spawned.current) return false
        const group = root.current
        if (!group) return false
        if (group.position.distanceTo(point) > pad + shipPad) return false
        pendingDamage.current += 22
        setHurtTint(true)
        window.setTimeout(() => setHurtTint(false), BANDIT_DAMAGE_FLASH * 1000)
        const id = ++sparkId.current
        const position = point.clone()
        setSparks((list) => [...list, { id, position }])
        return true
      },
    }
    return () => {
      banditLaserHitRef.current = null
    }
  }, [banditLaserHitRef, shipPad, hidden])

  useLayoutEffect(() => {
    hostileHazardRef.current = {
      object: root,
      radius: hitRadius,
    }
    return () => {
      hostileHazardRef.current = null
    }
  }, [hostileHazardRef, hitRadius])

  // After planets move so Hermes' matrix is current
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const group = root.current
    if (!group) return

    // 1) Wait for Hermes, then spawn once beside it
    if (!spawned.current) {
      if (!trySpawnAtHermes(group)) {
        writeCombatState(false, false)
        showHealth.current = false
        return
      }
      spawned.current = true
      hp.current = BANDIT_HP
      mode.current = 'patrol'
      setHidden(false)
      setReady(true)
    }

    beaconPulse.current += dt
    if (beaconRingMat.current) {
      beaconRingMat.current.opacity =
        0.45 + 0.4 * Math.sin(beaconPulse.current * 5)
    }

    if (mapRef) mapRef.current = group

    // Freeze while the pause menu is open
    if (paused) {
      thrustGlow.current = 0
      const alive = respawnTimer.current < 0 && spawned.current && !hidden
      writeCombatState(alive && mode.current === 'chase', alive)
      hpRatio.current = hp.current / BANDIT_HP
      showHealth.current = alive && mode.current === 'chase'
      if (respawnTimer.current < 0) {
        hostileHazardRef.current = {
          object: root,
          radius: hitRadius,
        }
      }
      return
    }

    // Dead → wait → respawn at current Hermes position
    if (respawnTimer.current >= 0) {
      respawnTimer.current -= dt
      hostileHazardRef.current = null
      thrustGlow.current = 0
      writeCombatState(false, false)
      showHealth.current = false
      if (respawnTimer.current <= 0) {
        if (!trySpawnAtHermes(group)) return
        respawnTimer.current = -1
        hp.current = BANDIT_HP
        mode.current = 'patrol'
        pendingDamage.current = 0
        setHidden(false)
        hostileHazardRef.current = {
          object: root,
          radius: hitRadius,
        }
      }
      return
    }

    hostileHazardRef.current = {
      object: root,
      radius: hitRadius,
    }

    if (pendingDamage.current > 0) {
      hp.current = Math.max(0, hp.current - pendingDamage.current)
      pendingDamage.current = 0
      if (hp.current <= 0) {
        _lastSeen.copy(group.position)
        velocity.current.set(0, 0, 0)
        weapons.current?.clear()
        setHidden(true)
        respawnTimer.current = RESPAWN_DELAY
        hostileHazardRef.current = null
        writeCombatState(false, false)
        showHealth.current = false
        const id = ++burstId.current
        setBursts((list) => [
          ...list,
          { id, position: group.position.clone() },
        ])
        return
      }
    }

    hpRatio.current = hp.current / BANDIT_HP

    _sun.set(...sunPosition)
    const planet = thalassaRef.current
    if (planet) planet.getWorldPosition(_thalassa)

    // Planets/moons only — sun occluder made LOS impossible while stuck on Sol
    _occluders.length = 0
    if (planet) {
      _occluders.push({
        x: _thalassa.x,
        y: _thalassa.y,
        z: _thalassa.z,
        radius: thalassaRadius * 0.98,
      })
    }
    for (const hazard of occluders) {
      const obj = hazard.object.current
      if (!obj || obj === planet) continue
      obj.getWorldPosition(_steer)
      _occluders.push({
        x: _steer.x,
        y: _steer.y,
        z: _steer.z,
        radius: hazard.radius * 0.98,
      })
    }

    const prey = targetRef.current
    let spotted = false
    let preyDist = Infinity
    let dockSafe = false
    if (prey) {
      prey.getWorldPosition(_target)
      preyDist = group.position.distanceTo(_target)
      const station = stationRef?.current
      if (station) {
        station.getWorldPosition(_station)
        dockSafe = _target.distanceTo(_station) < DOCK_OFFER_RANGE
      }
      // Station approach is a no-fire / no-spot sanctuary
      if (!dockSafe) {
        if (preyDist < CONTACT_RANGE) {
          spotted = true
        } else if (preyDist < DETECT_RANGE) {
          spotted = hasLineOfSight(group.position, _target, _occluders)
        }
      }
    }

    // Spot → chase. Without LOS, freeze on last seen (never track live prey).
    // Brief grace so one occluded frame doesn't dump chase → search.
    if (dockSafe && (mode.current === 'chase' || mode.current === 'search')) {
      mode.current = 'patrol'
      searchTimer.current = 0
      losGrace.current = 0
    } else if (spotted) {
      mode.current = 'chase'
      _lastSeen.copy(_target)
      searchTimer.current = SEARCH_TIME
      losGrace.current = LOS_GRACE
    } else if (mode.current === 'chase') {
      if (preyDist > LOSE_RANGE) {
        mode.current = 'search'
        searchTimer.current = SEARCH_TIME
        losGrace.current = 0
      } else {
        losGrace.current -= dt
        if (losGrace.current <= 0) {
          mode.current = 'search'
        }
      }
    } else if (mode.current === 'search') {
      searchTimer.current -= dt
      if (searchTimer.current <= 0 || preyDist > LOSE_RANGE) {
        mode.current = 'patrol'
      }
    }

    const chasing = mode.current === 'chase'
    const patrolling = mode.current === 'patrol'
    showHealth.current = chasing
    writeCombatState(chasing, true)

    let patrolRadialW = 0
    let combatSep = preyDist
    // Live track only while actually spotted; otherwise chase grace uses last seen
    const trackLive = chasing && spotted

    // Chase: orbit at standoff (do NOT fly into the player — that one-shot rams)
    if (chasing && prey) {
      combatSep = steerCombatOrbit(
        group.position,
        trackLive ? _target : _lastSeen,
        _dir,
      )
    } else if (mode.current === 'search') {
      dirToward(group.position, _lastSeen, _dir)
      if (group.position.distanceTo(_lastSeen) < 4) {
        mode.current = 'patrol'
      }
    } else {
      // Belt cruise only — no live sector hunt (that cheats LOS across the ring).
      const patrol = steerBeltPatrol(group.position, _sun, _dir, null)
      patrolRadialW = patrol.radialW
    }

    // Thalassa keep-out only while not chasing
    if (planet && !chasing) {
      avoidSphere(group.position, _thalassa, THALASSA_KEEP_OUT, _avoid)
      if (_avoid.lengthSq() > 1e-6) {
        steerWithAvoidance(_dir, _avoid, 0.85, _steer)
        _dir.copy(_steer)
      }
    }

    // Move along steer dir first; aim/face after final position
    const cruise = chasing
      ? combatSep > COMBAT_ORBIT * 2.2
        ? CHASE_APPROACH_CRUISE
        : CHASE_ORBIT_CRUISE
      : patrolling
        ? PATROL_CRUISE
        : SEARCH_CRUISE
    _wish.copy(_dir).multiplyScalar(cruise)
    velocity.current.lerp(_wish, 1 - Math.exp(-5.5 * dt))
    group.position.addScaledVector(velocity.current, dt)

    // Hard floor: never overlap the live player (hostile collision = instant death)
    if (chasing && prey) {
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

    // Hard sun shell + outward kick if we ever touch it
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
    } else if (patrolling && rNow > BELT_OUTER + 80) {
      velocity.current.addScaledVector(_radial, -12)
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

    // Face after move. Mesh lookAt aims +Z at the point, but ship nose is −Z
    // (same as player), so look at a point behind the desired heading.
    if (chasing && prey) {
      dirToward(group.position, trackLive ? _target : _lastSeen, _aim)
      if (_aim.lengthSq() > 1e-8) {
        _steer.copy(group.position).sub(_aim)
        group.lookAt(_steer)
      }
    } else if (_dir.lengthSq() > 1e-6) {
      _qFrom.copy(group.quaternion)
      _steer.copy(group.position).sub(_dir)
      group.lookAt(_steer)
      _q.copy(group.quaternion)
      const turn = patrolling && patrolRadialW > 0.4 ? 8 : 4.5
      group.quaternion.copy(_qFrom).slerp(_q, 1 - Math.exp(-turn * dt))
      group.quaternion.normalize()
    }

    _forward.set(0, 0, -1).applyQuaternion(group.quaternion)
    _right.set(1, 0, 0).applyQuaternion(group.quaternion)
    _up.set(0, 1, 0).applyQuaternion(group.quaternion)

    thrustGlow.current +=
      ((chasing ? 0.95 : patrolling ? 0.55 : 0.35) - thrustGlow.current) *
      (1 - Math.exp(-8 * dt))

    fireCooldown.current = Math.max(0, fireCooldown.current - dt)
    if (trackLive) {
      dirToward(group.position, _target, _aim)
    }
    const aimDot =
      trackLive && _aim.lengthSq() > 1e-8 ? _forward.dot(_aim) : null
    if (
      trackLive &&
      !dockSafe &&
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
      // No strafe inherit — bolts go at the player, not along the orbit
      weapons.current?.fire(_wish, _aim, _zeroVel, 70, 1.6)
      fireCooldown.current = 0.32
    }
  }, -1)

  const playerTargets = useRef([playerLaserHitRef])
  playerTargets.current[0] = playerLaserHitRef

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
          metalness={0.42}
          roughness={0.4}
          envMapIntensity={0.55}
          tint={hurtTint ? '#ffaa88' : '#c43c3c'}
        />
        <GunHardpoints
          scale={visualScale}
          leftMuzzle={leftMuzzle}
          rightMuzzle={rightMuzzle}
        />
        <ShipThrusters scale={visualScale} intensityRef={thrustGlow} />

        <Billboard follow position={[0, visualScale * 3.2, 0]}>
          <mesh>
            <sphereGeometry args={[visualScale * 1.35, 16, 16]} />
            <meshBasicMaterial
              color="#ff2a3a"
              toneMapped={false}
              transparent
              opacity={0.95}
            />
          </mesh>
          <mesh>
            <ringGeometry
              args={[visualScale * 1.7, visualScale * 2.6, 28]}
            />
            <meshBasicMaterial
              ref={(mat) => {
                beaconRingMat.current = mat
              }}
              color="#ff6677"
              toneMapped={false}
              transparent
              opacity={0.7}
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
          fillColor="#ff6677"
          lowColor="#ff2a3a"
        />
        <pointLight
          color="#ff3344"
          intensity={2.2}
          distance={28}
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
        laserTargets={playerTargets.current}
        boltColor={{
          glow: '#ff2244',
          mid: '#ff6688',
          core: '#ffe0e8',
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
          color="#ff8866"
          onDone={() =>
            setSparks((list) => list.filter((s) => s.id !== spark.id))
          }
        />
      ))}
    </>
  )
}
