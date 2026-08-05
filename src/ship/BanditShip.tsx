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
import type { CargoBait, PlayerCargoStatus } from '@/loot/cargoBait'
import { clearCargoBait } from '@/loot/cargoBait'
import { HitSpark } from '@/ship/HitSpark'
import { ShipExplosion } from '@/ship/ShipExplosion'
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

type BanditMode = 'patrol' | 'chase' | 'search' | 'scavenge'

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
  /**
   * Hermes spawn offset: +1 = orbital right, −1 = orbital left.
   * Use opposite signs so multiple bandits don't stack.
   */
  spawnSide?: number
  /**
   * Behavior slot (0, 1, …) — picks orbit direction, fire cadence, belt lane.
   * Keep unique per live bandit so they don't clone each other.
   */
  variant?: number
  /** Other bandits — soft separation so they split instead of stacking */
  allyRefs?: RefObject<Object3D | null>[]
  /** Friendly patrols — brief return fire / evade, never primary prey */
  rivalRefs?: RefObject<Object3D | null>[]
  rivalLaserHitRefs?: MutableRefObject<LaserTarget | null>[]
  /** Player haul — chase only when units > 0 (or after being shot). */
  playerCargoRef?: RefObject<PlayerCargoStatus>
  /** Jettisoned cargo pile — peel off chase to scavenge. */
  cargoBaitRef?: MutableRefObject<CargoBait>
  /** Clear bait visuals after a scavenger claims the dump. */
  onBaitClaimed?: () => void
}

type BanditPersona = {
  orbitSign: number
  patrolSign: number
  combatOrbit: number
  patrolOrbit: number
  fireInterval: number
  firePhase: number
  approachCruise: number
  orbitCruise: number
  patrolCruise: number
}

const BANDIT_HP = 70
const BANDIT_DAMAGE_FLASH = 0.12
/** Dead airtime before the bandit returns to the fight. */
const RESPAWN_DELAY = 60
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
const SEARCH_CRUISE = 22
const SCAVENGE_CRUISE = 26
const SCAVENGE_ARRIVE = 5.5
const COMBAT_ORBIT_BLEND = 8
const BANDIT_SCALE_MUL = 1.45
/** Soft NPC-vs-NPC hits (peacekeeper skirmish, not a deathmatch) */
const RIVAL_BOLT_DAMAGE = 10
const RETURN_FIRE_TIME = 3.2
const RIVAL_EVADE_RANGE = 85
const HURT_MEMORY = 2.4
/** Soft push so bandits don't occupy the same pocket */
const ALLY_SEPARATION = 32
const ALLY_SEPARATION_WEIGHT = 1.15

const PERSONAS: BanditPersona[] = [
  {
    orbitSign: 1,
    patrolSign: 1,
    combatOrbit: 16,
    patrolOrbit: PATROL_ORBIT - 55,
    fireInterval: 0.38,
    firePhase: 0.05,
    approachCruise: 21,
    orbitCruise: 11,
    patrolCruise: 15,
  },
  {
    orbitSign: -1,
    patrolSign: -1,
    combatOrbit: 26,
    patrolOrbit: PATROL_ORBIT + 70,
    fireInterval: 0.52,
    firePhase: 0.28,
    approachCruise: 17,
    orbitCruise: 9,
    patrolCruise: 13.5,
  },
]

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
const _ally = new Vector3()
const _station = new Vector3()
const _worldUp = new Vector3(0, 1, 0)
const _zeroVel = new Vector3()
const _q = new Quaternion()
const _qFrom = new Quaternion()
const _occluders: Occluder[] = []

function personaFor(variant: number): BanditPersona {
  const i = ((variant % PERSONAS.length) + PERSONAS.length) % PERSONAS.length
  return PERSONAS[i]
}

/**
 * Steer onto a sun-centered belt ring: outward/inward by radius error, plus tangent.
 * When prey is known, pick the tangent that closes angular distance (hunt their sector).
 */
function steerBeltPatrol(
  position: Vector3,
  sun: Vector3,
  out: Vector3,
  prey: Vector3 | null,
  patrolOrbit: number,
  patrolSign: number,
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
  if (patrolSign < 0) _tangent.multiplyScalar(-1)

  if (prey) {
    _wish.copy(prey).sub(sun)
    // Which way around the ring shrinks the angle to the prey?
    if (_wish.dot(_tangent) < 0) _tangent.multiplyScalar(-1)
  }

  const radialErr = patrolOrbit - r
  const radialW = Math.max(-1, Math.min(1, radialErr / PATROL_RADIAL_BLEND))
  const tangentW = Math.sqrt(Math.max(0.05, 1 - radialW * radialW))
  out.copy(_radial).multiplyScalar(radialW).addScaledVector(_tangent, tangentW)
  if (out.lengthSq() < 1e-8) out.copy(_tangent)
  else out.normalize()
  return { r, radialW }
}

/** Circle the prey — close in / back off, plus tangent strafe (sign splits allies). */
function steerCombatOrbit(
  position: Vector3,
  prey: Vector3,
  out: Vector3,
  combatOrbit: number,
  orbitSign: number,
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
  if (orbitSign < 0) _tangent.multiplyScalar(-1)

  // +radial = away from prey. Want away when too close, toward when too far.
  const radialAwayW = Math.max(
    -1,
    Math.min(1, (combatOrbit - sep) / COMBAT_ORBIT_BLEND),
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

/** Accumulate a separation bias away from nearby allies into out (may be zero). */
function allySeparation(
  position: Vector3,
  allies: RefObject<Object3D | null>[],
  out: Vector3,
): Vector3 {
  out.set(0, 0, 0)
  for (const ref of allies) {
    const ally = ref.current
    if (!ally || !ally.visible) continue
    ally.getWorldPosition(_ally)
    _avoid.copy(position).sub(_ally)
    const d = _avoid.length()
    if (d < 1e-4 || d >= ALLY_SEPARATION) continue
    const urgency = 1 - d / ALLY_SEPARATION
    out.addScaledVector(_avoid, (urgency * urgency) / d)
  }
  return out
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
  spawnSide = 1,
  variant = 0,
  allyRefs = [],
  rivalRefs = [],
  rivalLaserHitRefs = [],
  playerCargoRef,
  cargoBaitRef,
  onBaitClaimed,
}: BanditShipProps) {
  const persona = personaFor(variant)
  const root = useRef<Group>(null!)
  const velocity = useRef(new Vector3())
  const mode = useRef<BanditMode>('patrol')
  const searchTimer = useRef(0)
  const losGrace = useRef(0)
  const lastSeen = useRef(new Vector3())
  const onBaitClaimedRef = useRef(onBaitClaimed)
  onBaitClaimedRef.current = onBaitClaimed
  const hp = useRef(BANDIT_HP)
  const pendingDamage = useRef(0)
  const hurtMemory = useRef(0)
  const returnFire = useRef(0)
  const respawnTimer = useRef(-1)
  const fireCooldown = useRef(persona.firePhase)
  const nextGun = useRef(variant & 1)
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

    const side = spawnSide >= 0 ? 1 : -1
    const pad = hermesRadius + HERMES_CLEARANCE
    group.position
      .copy(hermesWorld)
      .addScaledVector(_right, pad * side)
      .addScaledVector(_worldUp, hermesRadius * 0.4)
    velocity.current.set(0, 0, 0)

    const player = targetRef.current
    if (player) player.getWorldPosition(_target)
    else _target.copy(group.position).addScaledVector(_right, side)
    dirToward(group.position, _target, _forward)
    if (_forward.lengthSq() < 1e-6) _forward.copy(_right).multiplyScalar(side)
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
      impact(point, pad, damage = 22) {
        if (respawnTimer.current >= 0 || hidden || !spawned.current) return false
        const group = root.current
        if (!group) return false
        if (group.position.distanceTo(point) > pad + shipPad) return false
        pendingDamage.current += damage
        hurtMemory.current = HURT_MEMORY
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
      fireCooldown.current = persona.firePhase
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
        fireCooldown.current = persona.firePhase
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
        lastSeen.current.copy(group.position)
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

    hurtMemory.current = Math.max(0, hurtMemory.current - dt)
    returnFire.current = Math.max(0, returnFire.current - dt)

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

    // Nearest rival (patrol) — return fire / evade only, never hunt across the belt
    let rivalDist = Infinity
    let rivalLive: Object3D | null = null
    for (const ref of rivalRefs) {
      const rival = ref.current
      if (!rival || !rival.visible) continue
      rival.getWorldPosition(_aim)
      const d = group.position.distanceTo(_aim)
      if (d < rivalDist) {
        rivalDist = d
        rivalLive = rival
      }
    }
    if (
      rivalLive &&
      rivalDist < RIVAL_EVADE_RANGE &&
      (hurtMemory.current > 0 || rivalDist < CONTACT_RANGE)
    ) {
      returnFire.current = Math.max(returnFire.current, RETURN_FIRE_TIME)
    }

    const bait = cargoBaitRef?.current
    const baitLive = !!bait && bait.active && bait.remaining > 0
    if (baitLive && bait) {
      _aim.set(bait.x, bait.y, bait.z)
    }
    const baitDist = baitLive ? group.position.distanceTo(_aim) : Infinity
    const haulUnits = playerCargoRef?.current?.units ?? 0
    // Pirates hunt hauls — empty holds aren't worth it unless you shot them
    const worthChasing = haulUnits > 0 || hurtMemory.current > 0

    // Spot → chase. Dumped cargo pulls hunters into scavenge instead.
    if (
      dockSafe &&
      (mode.current === 'chase' ||
        mode.current === 'search' ||
        mode.current === 'scavenge')
    ) {
      mode.current = 'patrol'
      searchTimer.current = 0
      losGrace.current = 0
    } else if (
      baitLive &&
      (mode.current === 'chase' ||
        mode.current === 'search' ||
        mode.current === 'scavenge' ||
        (mode.current === 'patrol' && baitDist < DETECT_RANGE))
    ) {
      mode.current = 'scavenge'
      searchTimer.current = 0
      losGrace.current = 0
    } else if (spotted && worthChasing) {
      mode.current = 'chase'
      lastSeen.current.copy(_target)
      searchTimer.current = SEARCH_TIME
      losGrace.current = LOS_GRACE
    } else if (mode.current === 'chase' && !worthChasing) {
      mode.current = 'patrol'
      searchTimer.current = 0
      losGrace.current = 0
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
    } else if (mode.current === 'scavenge' && !baitLive) {
      mode.current = 'patrol'
    }

    const chasing = mode.current === 'chase'
    const scavenging = mode.current === 'scavenge'
    const patrolling = mode.current === 'patrol'
    const skirmishing =
      !chasing &&
      !scavenging &&
      returnFire.current > 0 &&
      !!rivalLive &&
      rivalDist < FIRE_RANGE * 1.8
    showHealth.current = chasing || skirmishing
    writeCombatState(chasing, true)

    let patrolRadialW = 0
    let combatSep = preyDist
    const trackLive = chasing && spotted
    const seen = lastSeen.current
    const combatOrbit = persona.combatOrbit

    if (scavenging && baitLive && bait) {
      _aim.set(bait.x, bait.y, bait.z)
      dirToward(group.position, _aim, _dir)
      if (baitDist < SCAVENGE_ARRIVE) {
        clearCargoBait(bait)
        onBaitClaimedRef.current?.()
        mode.current = 'patrol'
      }
    } else if (chasing && prey) {
      combatSep = steerCombatOrbit(
        group.position,
        trackLive ? _target : seen,
        _dir,
        combatOrbit,
        persona.orbitSign,
      )
    } else if (skirmishing && rivalLive) {
      rivalLive.getWorldPosition(_aim)
      combatSep = steerCombatOrbit(
        group.position,
        _aim,
        _dir,
        combatOrbit,
        persona.orbitSign,
      )
    } else if (mode.current === 'search') {
      dirToward(group.position, seen, _dir)
      if (group.position.distanceTo(seen) < 4) {
        mode.current = 'patrol'
      }
    } else {
      const patrol = steerBeltPatrol(
        group.position,
        _sun,
        _dir,
        null,
        persona.patrolOrbit,
        persona.patrolSign,
      )
      patrolRadialW = patrol.radialW
      if (rivalLive && rivalDist < RIVAL_EVADE_RANGE) {
        rivalLive.getWorldPosition(_aim)
        _avoid.copy(group.position).sub(_aim)
        if (_avoid.lengthSq() > 1e-6) {
          _avoid.normalize()
          steerWithAvoidance(_dir, _avoid, 0.55, _steer)
          _dir.copy(_steer)
        }
      }
    }

    allySeparation(group.position, allyRefs, _avoid)
    if (_avoid.lengthSq() > 1e-6) {
      const weight =
        chasing || skirmishing || scavenging ? ALLY_SEPARATION_WEIGHT : 0.75
      steerWithAvoidance(_dir, _avoid, weight, _steer)
      _dir.copy(_steer)
    }

    if (planet && !chasing && !skirmishing && !scavenging) {
      avoidSphere(group.position, _thalassa, THALASSA_KEEP_OUT, _avoid)
      if (_avoid.lengthSq() > 1e-6) {
        steerWithAvoidance(_dir, _avoid, 0.85, _steer)
        _dir.copy(_steer)
      }
    }

    const cruise = scavenging
      ? SCAVENGE_CRUISE
      : chasing
        ? combatSep > combatOrbit * 2.2
          ? persona.approachCruise
          : persona.orbitCruise
        : skirmishing
          ? persona.orbitCruise
          : patrolling
            ? persona.patrolCruise
            : SEARCH_CRUISE
    _wish.copy(_dir).multiplyScalar(cruise)
    velocity.current.lerp(_wish, 1 - Math.exp(-5.5 * dt))
    group.position.addScaledVector(velocity.current, dt)

    // Hard floor: never overlap the live player (hostile collision = instant death)
    if (chasing && prey) {
      const liveSep = group.position.distanceTo(_target)
      if (liveSep < combatOrbit * 0.55) {
        _radial.copy(group.position).sub(_target)
        if (_radial.lengthSq() < 1e-6) _radial.set(1, 0, 0)
        else _radial.normalize()
        group.position
          .copy(_target)
          .addScaledVector(_radial, combatOrbit * 0.75)
        const toward = velocity.current.dot(_radial)
        if (toward < 0) velocity.current.addScaledVector(_radial, -toward + 2)
        combatSep = combatOrbit * 0.75
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
    const shootRival =
      skirmishing &&
      !!rivalLive &&
      returnFire.current > 0 &&
      rivalDist < FIRE_RANGE
    if (chasing && prey) {
      dirToward(group.position, trackLive ? _target : seen, _aim)
      if (_aim.lengthSq() > 1e-8) {
        _steer.copy(group.position).sub(_aim)
        group.lookAt(_steer)
      }
    } else if (shootRival && rivalLive) {
      rivalLive.getWorldPosition(_aim)
      dirToward(group.position, _aim, _aim)
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
      ((chasing || skirmishing || scavenging
        ? 0.95
        : patrolling
          ? 0.55
          : 0.35) -
        thrustGlow.current) *
      (1 - Math.exp(-8 * dt))

    fireCooldown.current = Math.max(0, fireCooldown.current - dt)
    let fireAtPlayer = false
    let fireAtRival = false
    if (trackLive) {
      dirToward(group.position, _target, _aim)
      fireAtPlayer = true
    } else if (shootRival && rivalLive) {
      rivalLive.getWorldPosition(_steer)
      dirToward(group.position, _steer, _aim)
      fireAtRival = true
    }
    const aimDot =
      (fireAtPlayer || fireAtRival) && _aim.lengthSq() > 1e-8
        ? _forward.dot(_aim)
        : null
    const fireDist = fireAtPlayer ? preyDist : rivalDist
    if (
      (fireAtPlayer || fireAtRival) &&
      !(fireAtPlayer && dockSafe) &&
      fireDist < FIRE_RANGE &&
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
      // Soft damage vs patrol; full default vs player (player ignores bolt damage arg)
      weapons.current?.fire(
        _wish,
        _aim,
        _zeroVel,
        70,
        1.6,
        fireAtRival ? RIVAL_BOLT_DAMAGE : undefined,
      )
      // Persona cadence + jitter so wingmates don't volley in sync
      const base = fireAtRival
        ? persona.fireInterval * 1.25
        : persona.fireInterval
      fireCooldown.current = base * (0.8 + Math.random() * 0.45)
    }
  }, -1)

  const laserTargets = useRef<MutableRefObject<LaserTarget | null>[]>([
    playerLaserHitRef,
    ...rivalLaserHitRefs,
  ])
  laserTargets.current[0] = playerLaserHitRef
  for (let i = 0; i < rivalLaserHitRefs.length; i++) {
    laserTargets.current[i + 1] = rivalLaserHitRefs[i]
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
        laserTargets={laserTargets.current}
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
