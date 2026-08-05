import { useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from 'react'
import { Group, Object3D, Quaternion, Vector3 } from 'three'
import { circularOrbitSpeed } from '@/world/gravity'
import { OrbitGuide } from '@/ship/OrbitGuide'
import { HitSpark } from '@/ship/HitSpark'
import { EXPLOSION_LIFETIME, ShipExplosion } from '@/ship/ShipExplosion'
import {
  GunHardpoints,
  ProjectileField,
  playLaserSound,
  type LaserTarget,
  type WeaponsHandle,
} from '@/ship/ShipWeapons'
import {
  BUFF_DURATION,
  FIRERATE_BUFF_MULT,
  SPEED_BUFF_MULT,
  type BuffKind,
} from '@/loot/buffs'
import type { BuffDropsHandle } from '@/loot/BuffDrops'
import type { MaterialDropsHandle, MaterialPickup } from '@/loot/MaterialDrops'
import { playBuffPickupSound, playMaterialPickupSound } from '@/audio/gameAudio'
import { ShipThrusters } from '@/ship/ShipThrusters'
import { Spaceship } from '@/ship/Spaceship'
import { useKeyboard } from '@/ship/useKeyboard'

const _forward = new Vector3()
const _right = new Vector3()
const _up = new Vector3()
const _wish = new Vector3()
const _camPos = new Vector3()
const _lookAt = new Vector3()
const _qYaw = new Quaternion()
const _qPitch = new Quaternion()
const _qRoll = new Quaternion()
const _body = new Vector3()
const _radial = new Vector3()
const _hazardPos = new Vector3()
const _prevPos = new Vector3()
const _seg = new Vector3()
const _closest = new Vector3()
const _deathPos = new Vector3()
const _deathCamPos = new Vector3()
const _deathCamUp = new Vector3()
const _muzzle = new Vector3()

/** True if segment a→b intersects a sphere (covers fast tunneling). */
function segmentHitsSphere(
  a: Vector3,
  b: Vector3,
  center: Vector3,
  radius: number,
) {
  const r2 = radius * radius
  _seg.copy(b).sub(a)
  const abLenSq = _seg.lengthSq()
  if (abLenSq < 1e-12) return a.distanceToSquared(center) < r2
  _closest.copy(center).sub(a)
  let t = _closest.dot(_seg) / abLenSq
  if (t < 0) t = 0
  else if (t > 1) t = 1
  _closest.copy(a).addScaledVector(_seg, t)
  return _closest.distanceToSquared(center) < r2
}

const MAX_HP = 100
/** Damage taken from a pirate laser bolt (~8 hits to hull break) */
const LASER_HIT_DAMAGE = 12
/** Hold on the blast a beat past the particle lifetime, then respawn. */
const RESPAWN_DELAY = EXPLOSION_LIFETIME + 0.55

export type OrbitalTelemetry = {
  speed: number
  altitude: number
  circularSpeed: number
  orbitRatio: number
  hp: number
  maxHp: number
  /** 0–1 weapon heat */
  heat: number
  overheated: boolean
  /** Seconds remaining on active buffs */
  speedBuff: number
  fireBuff: number
}

/** Moving body the ship can fatally collide with (planets, etc.). */
export type CollisionHazard = {
  object: RefObject<Object3D | null>
  radius: number
}

/** Dense field of lethal spheres (asteroid belt, debris, …). */
export type HazardField = {
  test: (point: Vector3, pad: number) => boolean
  /** Laser / projectile hit — returns true if something was struck. */
  impact?: (point: Vector3, pad: number, direction: Vector3) => boolean
}

type ExplosionBurst = {
  id: number
  position: Vector3
}

type HitBurst = {
  id: number
  position: Vector3
}

const PLAYER_DAMAGE_FLASH = 0.14

type PlayerShipProps = {
  scale?: number
  metalness?: number
  roughness?: number
  envMapIntensity?: number
  sunPosition: [number, number, number]
  sunSize: number
  /** Shared μ for HUD circular-orbit reference only — ship ignores gravity. */
  mu?: number
  /** Extra lethal bodies (planets). Sun is always checked separately. */
  hazards?: CollisionHazard[]
  /** Hostile ships — sphere collision while active */
  hostiles?: RefObject<CollisionHazard | null>[]
  /** Extra lethal fields (asteroid belts, etc.). */
  hazardFields?: RefObject<HazardField | null>[]
  /** Enemy hulls the player's lasers can strike */
  laserTargets?: RefObject<LaserTarget | null>[]
  /** Exposes this hull so NPC lasers can damage the player */
  laserHitRef?: MutableRefObject<LaserTarget | null>
  /** Exposes the ship root for the system map */
  shipRef?: RefObject<Group | null>
  /** Glowing asteroid drop tokens */
  buffDropsRef?: RefObject<BuffDropsHandle | null>
  /** Raw material shards from destroyed rocks */
  materialDropsRef?: RefObject<MaterialDropsHandle | null>
  onMaterialPickup?: (pickup: MaterialPickup) => void
  /** Prefer spawning / respawning beside this object (space station) */
  spawnAnchorRef?: RefObject<Object3D | null>
  /** Planet the spawn anchor orbits — used to push the ship into open space */
  spawnPlanetRef?: RefObject<Object3D | null>
  /** Clearance beyond the spawn anchor center */
  spawnClearance?: number
  /** Hard-docked to the station — ship follows berth, no pilot input */
  docked?: boolean
  /** True while within docking range of the station (not while docked) */
  onDockAvailable?: (available: boolean) => void
  paused?: boolean
  onLockChange?: (locked: boolean) => void
  onTelemetry?: (telemetry: OrbitalTelemetry) => void
  /** Applied once on first spawn (localStorage restore). */
  initialHull?: {
    hp: number
    heat?: number
    overheated?: boolean
    speedBuff?: number
    fireBuff?: number
  }
}

/** Approach radius for the dock offer (world units from station center). */
export const DOCK_OFFER_RANGE = 7.5
/** Clearance while hard-docked (tucked to the berth). */
const DOCK_ATTACH_CLEARANCE = 2.4
/** Safety push distance / speed when undocking. */
const UNDOCK_CLEARANCE = 11
const UNDOCK_SPEED = 14
/** How quickly forward thrust ramps to full when holding W (higher = snappier). */
const THRUST_RAMP_UP = 3.2
/** How quickly thrust engagement falls off when releasing W. */
const THRUST_RAMP_DOWN = 8

function grantBuff(
  kind: BuffKind,
  speedBuff: { current: number },
  fireBuff: { current: number },
) {
  if (kind === 'speed') {
    speedBuff.current = Math.max(speedBuff.current, BUFF_DURATION)
  } else {
    fireBuff.current = Math.max(fireBuff.current, BUFF_DURATION)
  }
}

/** Fallback spawn near the sun if the station isn't ready yet. */
function placeShipNearSun(
  group: Group,
  velocity: Vector3,
  body: Vector3,
  sunSize: number,
  orbitAltitude: number,
) {
  const radius = sunSize + orbitAltitude
  _radial.set(1, 0.08, 0).normalize()
  group.position.copy(body).addScaledVector(_radial, radius)
  velocity.set(0, 0, 0)
  group.lookAt(
    group.position.x + _radial.x,
    group.position.y + _radial.y,
    group.position.z + _radial.z,
  )
}

/** Dock outside the station along planet → station → open space. */
function placeShipAtAnchor(
  group: Group,
  velocity: Vector3,
  anchor: Object3D,
  planet: Object3D | null | undefined,
  clearance: number,
) {
  anchor.updateWorldMatrix(true, false)
  anchor.getWorldPosition(_hazardPos)

  if (planet) {
    planet.getWorldPosition(_deathPos)
    _forward.copy(_hazardPos).sub(_deathPos)
  } else {
    _forward.set(0, 0, 1).transformDirection(anchor.matrixWorld)
  }
  if (_forward.lengthSq() < 1e-8) _forward.set(1, 0.1, 0)
  _forward.normalize()

  _up.set(0, 1, 0)
  // Keep a slight world-up bias so we don't sit in the orbital plane of the hitbox
  group.position
    .copy(_hazardPos)
    .addScaledVector(_forward, clearance)
    .addScaledVector(_up, Math.max(1.2, clearance * 0.2))
  // Nudge away so the orbiting station doesn't immediately sweep back into us
  velocity.copy(_forward).multiplyScalar(3.5)
  group.lookAt(
    group.position.x + _forward.x,
    group.position.y + _forward.y,
    group.position.z + _forward.z,
  )
}

function placeShip(
  group: Group,
  velocity: Vector3,
  body: Vector3,
  sunSize: number,
  orbitAltitude: number,
  spawnAnchor: Object3D | null | undefined,
  spawnPlanet: Object3D | null | undefined,
  spawnClearance: number,
) {
  if (spawnAnchor) {
    placeShipAtAnchor(
      group,
      velocity,
      spawnAnchor,
      spawnPlanet,
      spawnClearance,
    )
    return
  }
  placeShipNearSun(group, velocity, body, sunSize, orbitAltitude)
}

export function PlayerShip({
  scale = 1,
  metalness,
  roughness,
  envMapIntensity,
  sunPosition,
  sunSize,
  mu = 8000,
  hazards,
  hostiles,
  hazardFields,
  laserTargets,
  laserHitRef,
  shipRef,
  buffDropsRef,
  materialDropsRef,
  onMaterialPickup,
  spawnAnchorRef,
  spawnPlanetRef,
  spawnClearance = 8,
  docked = false,
  onDockAvailable,
  paused = false,
  onLockChange,
  onTelemetry,
  initialHull,
}: PlayerShipProps) {
  const ship = useRef<Group>(null!)
  const velocity = useRef(new Vector3())
  const mouse = useRef({ x: 0, y: 0 })
  const spawned = useRef(false)
  const cameraReady = useRef(false)
  const wasDocked = useRef(docked)
  const initialHullRef = useRef(initialHull)
  initialHullRef.current = initialHull
  const dockAvailableRef = useRef(false)
  const telemetryAge = useRef(0)
  const hp = useRef(MAX_HP)
  const explosionId = useRef(0)
  const respawnTimer = useRef(-1)
  /** Ignore world collisions briefly after spawn / respawn */
  const spawnGrace = useRef(0)
  const pausedRef = useRef(paused)
  const firing = useRef(false)
  const fireCooldown = useRef(0)
  const nextGun = useRef(0)
  const heat = useRef(0)
  const overheated = useRef(false)
  const weapons = useRef<WeaponsHandle | null>(null)
  const leftMuzzle = useRef<Object3D>(null!)
  const rightMuzzle = useRef<Object3D>(null!)
  /** 0..1 thruster VFX level — updated in the flight loop */
  const thrustGlow = useRef(0)
  /** 0..1 forward thrust engagement — ramps so W doesn't dump full force instantly */
  const thrustEngaged = useRef(0)
  const speedBuff = useRef(0)
  const fireBuff = useRef(0)
  const keys = useKeyboard()
  const { camera, gl } = useThree()
  const [explosions, setExplosions] = useState<ExplosionBurst[]>([])
  const [hitSparks, setHitSparks] = useState<HitBurst[]>([])
  const [hidden, setHidden] = useState(false)
  const [hurtTint, setHurtTint] = useState(false)
  const pendingDamage = useRef(0)
  const hitSparkId = useRef(0)
  const dockedRef = useRef(docked)
  dockedRef.current = docked

  pausedRef.current = paused

  useLayoutEffect(() => {
    if (!laserHitRef) return
    laserHitRef.current = {
      impact(point, pad) {
        if (
          respawnTimer.current >= 0 ||
          dockedRef.current ||
          spawnGrace.current > 0
        ) {
          return false
        }
        const group = ship.current
        if (!group || !group.visible) return false
        const shipPad = Math.max(scale * 0.9, 0.05)
        if (group.position.distanceTo(point) > pad + shipPad) return false
        pendingDamage.current += LASER_HIT_DAMAGE
        setHurtTint(true)
        window.setTimeout(() => setHurtTint(false), PLAYER_DAMAGE_FLASH * 1000)
        const id = ++hitSparkId.current
        setHitSparks((list) => [...list, { id, position: point.clone() }])
        return true
      },
    }
    return () => {
      laserHitRef.current = null
    }
  }, [laserHitRef, scale])

  const {
    thrust,
    boostMultiplier,
    turnSpeed,
    rollSpeed,
    damping,
    mouseSensitivity,
    camDistance,
    camHeight,
    camLag,
    lookAhead,
    modelYaw,
  } = useControls('Flight', {
    thrust: { value: 24, min: 1, max: 200, step: 0.5 },
    boostMultiplier: { value: 1.7, min: 1, max: 5, step: 0.1 },
    turnSpeed: { value: 0.65, min: 0.1, max: 4, step: 0.05 },
    rollSpeed: { value: 1.0, min: 0.1, max: 5, step: 0.05 },
    // EVE-like: space has drag so you ease toward a top speed and coast to a stop
    damping: {
      value: 1.7,
      min: 0,
      max: 3,
      step: 0.05,
      label: 'Drag (0 = vacuum)',
    },
    mouseSensitivity: {
      value: 0.0005,
      min: 0.0001,
      max: 0.006,
      step: 0.0001,
    },
    camDistance: { value: 0.22, min: 0.08, max: 40, step: 0.01 },
    camHeight: { value: 0.045, min: 0, max: 12, step: 0.005 },
    // Higher = camera stays glued behind the ship
    camLag: { value: 9, min: 0.4, max: 24, step: 0.1 },
    lookAhead: { value: 0.34, min: 0, max: 40, step: 0.01 },
    modelYaw: {
      value: 0,
      min: -Math.PI,
      max: Math.PI,
      step: 0.01,
      label: 'Model yaw fix',
    },
  })

  const {
    fireRate,
    boltSpeed,
    boltLife,
    heatBuild,
    heatCool,
    overheatCool,
  } = useControls('Weapons', {
    fireRate: {
      value: 10,
      min: 1,
      max: 30,
      step: 0.5,
      label: 'Fire rate (bolts/s)',
    },
    boltSpeed: { value: 90, min: 40, max: 400, step: 5 },
    boltLife: { value: 2.5, min: 0.4, max: 6, step: 0.1 },
    heatBuild: {
      // ~8s continuous fire to overheat (1 / 0.125)
      value: 0.125,
      min: 0.05,
      max: 1.5,
      step: 0.01,
      label: 'Heat build (/s)',
    },
    heatCool: {
      value: 0.28,
      min: 0.05,
      max: 1.5,
      step: 0.01,
      label: 'Heat cool (/s)',
    },
    overheatCool: {
      // ~4.4s to clear a full overheat (was ~2.2s at 0.45)
      value: 0.225,
      min: 0.05,
      max: 2,
      step: 0.01,
      label: 'Overheat cool (/s)',
    },
  })

  // Ship ignores gravity (planets use shared μ from App). Spawn helpers only.
  const { orbitAltitude, showOrbitGuide } = useControls('Spawn', {
    orbitAltitude: {
      value: 120,
      min: 20,
      max: 300,
      step: 1,
      label: 'Start altitude',
    },
    showOrbitGuide: { value: false, label: 'Orbit guide' },
  })

  useEffect(() => {
    const element = gl.domElement

    const onClick = () => {
      // Menu overlays own Launch/Resume; ignore canvas clicks while paused
      if (pausedRef.current) return
      if (document.pointerLockElement !== element) {
        void element.requestPointerLock()
      }
    }
    const onChange = () => {
      const locked = document.pointerLockElement === element
      if (!locked) {
        mouse.current.x = 0
        mouse.current.y = 0
        firing.current = false
        for (const code of Object.keys(keys.current)) {
          keys.current[code] = false
        }
      }
      onLockChange?.(locked)
    }
    const onMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== element) return
      mouse.current.x += event.movementX
      mouse.current.y += event.movementY
    }
    // Trackpads often emit wheel (two-finger pan) instead of — or as well as —
    // mousemove, and OS "disable while typing" may still allow scroll gestures.
    const onWheel = (event: WheelEvent) => {
      if (document.pointerLockElement !== element) return
      event.preventDefault()
      mouse.current.x += event.deltaX
      mouse.current.y += event.deltaY
    }
    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return
      if (document.pointerLockElement !== element) return
      event.preventDefault()
      firing.current = true
    }
    const onMouseUp = (event: MouseEvent) => {
      if (event.button !== 0) return
      firing.current = false
    }

    element.addEventListener('click', onClick)
    // Capture on window — most reliable under pointer lock across browsers
    window.addEventListener('mousedown', onMouseDown, true)
    window.addEventListener('mouseup', onMouseUp, true)
    document.addEventListener('pointerlockchange', onChange)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('wheel', onWheel, { passive: false })
    onChange()

    return () => {
      element.removeEventListener('click', onClick)
      window.removeEventListener('mousedown', onMouseDown, true)
      window.removeEventListener('mouseup', onMouseUp, true)
      document.removeEventListener('pointerlockchange', onChange)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('wheel', onWheel)
    }
  }, [gl.domElement, onLockChange, keys])

  const removeExplosion = (id: number) => {
    setExplosions((list) => list.filter((burst) => burst.id !== id))
  }

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const group = ship.current
    const input = keys.current
    _body.set(...sunPosition)
    const softRadius = Math.max(sunSize * 1.35, 4)
    const dead = respawnTimer.current >= 0

    // Spawn once at the station (fall back to the sun if anchor isn't ready)
    if (!spawned.current) {
      const anchor = spawnAnchorRef?.current
      // Wait a frame for the station to finish its first layout place
      if (spawnAnchorRef && !anchor) {
        // keep trying
      } else {
        spawned.current = true
        placeShip(
          group,
          velocity.current,
          _body,
          sunSize,
          orbitAltitude,
          anchor,
          spawnPlanetRef?.current,
          spawnClearance,
        )
        const hull = initialHullRef.current
        if (hull) {
          hp.current = Math.max(1, Math.min(MAX_HP, Math.round(hull.hp)))
          heat.current = Math.max(0, Math.min(1, hull.heat ?? 0))
          overheated.current = !!hull.overheated
          speedBuff.current = Math.max(0, hull.speedBuff ?? 0)
          fireBuff.current = Math.max(0, hull.fireBuff ?? 0)
        } else {
          hp.current = MAX_HP
          heat.current = 0
          overheated.current = false
        }
        cameraReady.current = false
        spawnGrace.current = 2.5
      }
    }

    // Pause — freeze sim & death timer; hold framing
    if (paused) {
      mouse.current.x = 0
      mouse.current.y = 0
      firing.current = false
      thrustGlow.current = 0
      thrustEngaged.current = 0
      // Buff timers freeze while paused (don't tick down)
      if (dead) {
        if (dockAvailableRef.current) {
          dockAvailableRef.current = false
          onDockAvailable?.(false)
        }
        camera.position.copy(_deathCamPos)
        camera.up.copy(_deathCamUp)
        camera.lookAt(_deathPos)
      } else {
        _forward.set(0, 0, -1).applyQuaternion(group.quaternion)
        _up.set(0, 1, 0).applyQuaternion(group.quaternion)
        _camPos
          .copy(group.position)
          .addScaledVector(_forward, -camDistance)
          .addScaledVector(_up, camHeight)
        _lookAt
          .copy(group.position)
          .addScaledVector(_forward, lookAhead)
          .addScaledVector(_up, camHeight)
        camera.position.copy(_camPos)
        camera.up.copy(_up)
        camera.lookAt(_lookAt)
      }
      return
    }

    // Dock edge — station services restore hull / guns
    if (!wasDocked.current && docked) {
      hp.current = MAX_HP
      heat.current = 0
      overheated.current = false
      weapons.current?.clear()
    }

    // Undock edge — jettison clear of the berth for ship safety
    if (wasDocked.current && !docked) {
      const anchor = spawnAnchorRef?.current
      if (anchor) {
        placeShipAtAnchor(
          group,
          velocity.current,
          anchor,
          spawnPlanetRef?.current,
          UNDOCK_CLEARANCE,
        )
        // Stronger outward push than a normal respawn
        if (velocity.current.lengthSq() > 1e-8) {
          velocity.current.normalize().multiplyScalar(UNDOCK_SPEED)
        } else {
          velocity.current.set(UNDOCK_SPEED, 0, 0)
        }
      }
      spawnGrace.current = 2.5
      heat.current = 0
      overheated.current = false
      firing.current = false
      thrustGlow.current = 0
      thrustEngaged.current = 0
      mouse.current.x = 0
      mouse.current.y = 0
      cameraReady.current = false
    }
    wasDocked.current = docked

    // Hard-dock — ride the station; world keeps orbiting
    if (docked) {
      mouse.current.x = 0
      mouse.current.y = 0
      firing.current = false
      thrustGlow.current = 0
      thrustEngaged.current = 0
      const anchor = spawnAnchorRef?.current
      if (anchor) {
        placeShipAtAnchor(
          group,
          velocity.current,
          anchor,
          spawnPlanetRef?.current,
          DOCK_ATTACH_CLEARANCE,
        )
        velocity.current.set(0, 0, 0)
      }
      if (dockAvailableRef.current) {
        dockAvailableRef.current = false
        onDockAvailable?.(false)
      }
      _forward.set(0, 0, -1).applyQuaternion(group.quaternion)
      _up.set(0, 1, 0).applyQuaternion(group.quaternion)
      _camPos
        .copy(group.position)
        .addScaledVector(_forward, -camDistance * 1.35)
        .addScaledVector(_up, camHeight * 1.2)
      _lookAt
        .copy(group.position)
        .addScaledVector(_forward, lookAhead)
        .addScaledVector(_up, camHeight)
      camera.position.lerp(_camPos, 1 - Math.exp(-6 * dt))
      camera.up.lerp(_up, 1 - Math.exp(-6 * dt)).normalize()
      camera.lookAt(_lookAt)

      telemetryAge.current += dt
      if (onTelemetry && telemetryAge.current > 0.1) {
        telemetryAge.current = 0
        const alt = group.position.distanceTo(_body)
        onTelemetry({
          speed: 0,
          altitude: Math.max(0, alt - sunSize),
          circularSpeed: 0,
          orbitRatio: 0,
          hp: hp.current,
          maxHp: MAX_HP,
          heat: heat.current,
          overheated: false,
          speedBuff: speedBuff.current,
          fireBuff: fireBuff.current,
        })
      }
      return
    }

    // Death hold — freeze flight, keep camera on the blast, then respawn
    if (dead) {
      respawnTimer.current -= dt
      mouse.current.x = 0
      mouse.current.y = 0
      thrustGlow.current = 0
      thrustEngaged.current = 0
      if (dockAvailableRef.current) {
        dockAvailableRef.current = false
        onDockAvailable?.(false)
      }

      camera.position.copy(_deathCamPos)
      camera.up.copy(_deathCamUp)
      camera.lookAt(_deathPos)

      if (respawnTimer.current <= 0) {
        respawnTimer.current = -1
        placeShip(
          group,
          velocity.current,
          _body,
          sunSize,
          orbitAltitude,
          spawnAnchorRef?.current,
          spawnPlanetRef?.current,
          spawnClearance,
        )
        hp.current = MAX_HP
        heat.current = 0
        overheated.current = false
        setHidden(false)
        cameraReady.current = false
        spawnGrace.current = 2.5
        mouse.current.x = 0
        mouse.current.y = 0
      } else {
        telemetryAge.current += dt
        if (onTelemetry && telemetryAge.current > 0.1) {
          telemetryAge.current = 0
          onTelemetry({
            speed: 0,
            altitude: Math.max(0, _deathPos.distanceTo(_body) - sunSize),
            circularSpeed: 0,
            orbitRatio: 0,
            hp: 0,
            maxHp: MAX_HP,
            heat: heat.current,
            overheated: overheated.current,
            speedBuff: 0,
            fireBuff: 0,
          })
        }
        return
      }
    }

    let yaw = -mouse.current.x * mouseSensitivity * turnSpeed
    let pitch = -mouse.current.y * mouseSensitivity * turnSpeed
    mouse.current.x = 0
    mouse.current.y = 0

    // Arrow-key look — trackpads are often muted by the OS while holding WASD
    const keyLook = turnSpeed * 2.8 * dt
    if (input.ArrowLeft) yaw += keyLook
    if (input.ArrowRight) yaw -= keyLook
    if (input.ArrowUp) pitch += keyLook
    if (input.ArrowDown) pitch -= keyLook

    let roll = 0
    if (input.KeyQ) roll += rollSpeed * dt
    if (input.KeyE) roll -= rollSpeed * dt

    if (spawnGrace.current > 0) {
      spawnGrace.current = Math.max(0, spawnGrace.current - dt)
    }

    if (yaw !== 0) {
      _qYaw.setFromAxisAngle(_up.set(0, 1, 0), yaw)
      group.quaternion.multiply(_qYaw)
    }
    if (pitch !== 0) {
      _qPitch.setFromAxisAngle(_right.set(1, 0, 0), pitch)
      group.quaternion.multiply(_qPitch)
    }
    if (roll !== 0) {
      _qRoll.setFromAxisAngle(_forward.set(0, 0, 1), roll)
      group.quaternion.multiply(_qRoll)
    }
    group.quaternion.normalize()

    _forward.set(0, 0, -1).applyQuaternion(group.quaternion)
    _right.set(1, 0, 0).applyQuaternion(group.quaternion)
    _up.set(0, 1, 0).applyQuaternion(group.quaternion)

    // Pickup glowing buff tokens + raw material shards
    const pickupR = Math.max(scale * 2.5, 1.25)
    if (buffDropsRef) {
      const got = buffDropsRef.current?.collect(group.position, pickupR)
      if (got) {
        grantBuff(got, speedBuff, fireBuff)
        playBuffPickupSound()
      }
    }
    if (materialDropsRef) {
      const mat = materialDropsRef.current?.collect(group.position, pickupR)
      if (mat) {
        onMaterialPickup?.(mat)
        playMaterialPickupSound()
      }
    }
    speedBuff.current = Math.max(0, speedBuff.current - dt)
    fireBuff.current = Math.max(0, fireBuff.current - dt)

    const boosting = !!(input.ShiftLeft || input.ShiftRight)
    const speedMult = speedBuff.current > 0 ? SPEED_BUFF_MULT : 1
    const thrustForce = thrust * (boosting ? boostMultiplier : 1) * speedMult
    const accelerating = !!input.KeyW

    // Ease thrust in/out so holding W doesn't instantly hit full power
    const engageTarget = accelerating ? 1 : 0
    const engageRate = accelerating ? THRUST_RAMP_UP : THRUST_RAMP_DOWN
    thrustEngaged.current +=
      (engageTarget - thrustEngaged.current) *
      (1 - Math.exp(-engageRate * dt))
    if (thrustEngaged.current < 1e-4) thrustEngaged.current = 0

    _wish.set(0, 0, 0)
    if (thrustEngaged.current > 0) {
      _wish.addScaledVector(_forward, thrustForce * thrustEngaged.current)
    }
    // S brakes against current motion — slows to a stop, never reverses
    if (input.KeyS) {
      const speed = velocity.current.length()
      if (speed > 1e-3) {
        _wish.addScaledVector(velocity.current, -(thrustForce * 1.15) / speed)
      }
    }

    // Thrust — gravity intentionally skipped for the ship (planets orbit via App)
    velocity.current.addScaledVector(_wish, dt)
    if (input.KeyS && !accelerating) {
      // Kill residual creep so brake settles at rest instead of oscillating
      if (velocity.current.lengthSq() < 0.04) velocity.current.set(0, 0, 0)
    }

    // Smooth thruster glow toward cruise / boost
    const thrustTarget = accelerating ? (boosting ? 1 : 0.62) : 0
    const glowRate = accelerating ? 10 : 7
    thrustGlow.current +=
      (thrustTarget - thrustGlow.current) * (1 - Math.exp(-glowRate * dt))

    // Optional drag — EVE-like coasting
    if (damping > 0) {
      velocity.current.multiplyScalar(Math.exp(-damping * dt))
    }

    _prevPos.copy(group.position)
    group.position.addScaledVector(velocity.current, dt)

    // Dock offer — station is non-lethal; proximity opens the berth prompt
    {
      const station = spawnAnchorRef?.current
      let available = false
      if (station && !dead) {
        station.getWorldPosition(_hazardPos)
        available =
          group.position.distanceTo(_hazardPos) < DOCK_OFFER_RANGE
      }
      if (available !== dockAvailableRef.current) {
        dockAvailableRef.current = available
        onDockAvailable?.(available)
      }
    }

    // Lethal collisions — sun + planets + fields: explode, hold camera, then respawn
    _radial.copy(group.position).sub(_body)
    let altitude = _radial.length()
    const shipPad = Math.max(scale * 0.55, 0.03)
    let hit = false

    if (pendingDamage.current > 0 && respawnTimer.current < 0) {
      hp.current = Math.max(0, hp.current - pendingDamage.current)
      pendingDamage.current = 0
      if (hp.current <= 0) hit = true
    }

    // Planets / sun always collide (spawn grace only softens belt + hostiles)
    hit =
      hit ||
      segmentHitsSphere(
        _prevPos,
        group.position,
        _body,
        sunSize + shipPad,
      )

    if (!hit && hazards) {
      for (const hazard of hazards) {
        const obj = hazard.object.current
        if (!obj) continue
        obj.getWorldPosition(_hazardPos)
        if (
          segmentHitsSphere(
            _prevPos,
            group.position,
            _hazardPos,
            hazard.radius + shipPad,
          )
        ) {
          hit = true
          break
        }
      }
    }

    if (spawnGrace.current <= 0) {
      if (!hit && hostiles) {
        for (const hostileRef of hostiles) {
          const hazard = hostileRef.current
          const obj = hazard?.object.current
          if (!hazard || !obj) continue
          obj.getWorldPosition(_hazardPos)
          if (
            segmentHitsSphere(
              _prevPos,
              group.position,
              _hazardPos,
              hazard.radius + shipPad,
            )
          ) {
            hit = true
            break
          }
        }
      }

      if (!hit && hazardFields) {
        for (const fieldRef of hazardFields) {
          if (fieldRef.current?.test(group.position, shipPad)) {
            hit = true
            break
          }
        }
      }
    }

    if (hit && respawnTimer.current < 0) {
      _deathPos.copy(group.position)
      _forward.set(0, 0, -1).applyQuaternion(group.quaternion)
      _up.set(0, 1, 0).applyQuaternion(group.quaternion)
      _deathCamPos
        .copy(_deathPos)
        .addScaledVector(_forward, -camDistance)
        .addScaledVector(_up, camHeight)
      _deathCamUp.copy(_up)
      velocity.current.set(0, 0, 0)
      hp.current = 0
      heat.current = 0
      overheated.current = false
      firing.current = false
      speedBuff.current = 0
      fireBuff.current = 0
      thrustGlow.current = 0
      thrustEngaged.current = 0
      weapons.current?.clear()
      setHidden(true)
      respawnTimer.current = RESPAWN_DELAY
      telemetryAge.current = 0
      if (dockAvailableRef.current) {
        dockAvailableRef.current = false
        onDockAvailable?.(false)
      }

      onTelemetry?.({
        speed: 0,
        altitude: 0,
        circularSpeed: 0,
        orbitRatio: 0,
        hp: 0,
        maxHp: MAX_HP,
        heat: 0,
        overheated: false,
        speedBuff: 0,
        fireBuff: 0,
      })

      const id = ++explosionId.current
      setExplosions((list) => [
        ...list,
        { id, position: _deathPos.clone() },
      ])

      camera.position.copy(_deathCamPos)
      camera.up.copy(_deathCamUp)
      camera.lookAt(_deathPos)
      return
    }

    // Guns — hold LMB or F (blocked while overheated / dock offer steals F)
    fireCooldown.current = Math.max(0, fireCooldown.current - dt)
    const wantsFire =
      firing.current || (!!input.KeyF && !dockAvailableRef.current)

    if (overheated.current) {
      heat.current = Math.max(0, heat.current - overheatCool * dt)
      if (heat.current <= 0) {
        heat.current = 0
        overheated.current = false
      }
    } else if (wantsFire && respawnTimer.current < 0) {
      heat.current = Math.min(1, heat.current + heatBuild * dt)
      if (heat.current >= 1) {
        heat.current = 1
        overheated.current = true
      }
    } else {
      heat.current = Math.max(0, heat.current - heatCool * dt)
    }

    const effectiveFireRate =
      fireRate * (fireBuff.current > 0 ? FIRERATE_BUFF_MULT : 1)

    if (
      wantsFire &&
      !overheated.current &&
      respawnTimer.current < 0 &&
      fireCooldown.current <= 0
    ) {
      const side = nextGun.current % 2 === 0 ? -1 : 1
      nextGun.current++
      _forward.set(0, 0, -1).applyQuaternion(group.quaternion)
      _right.set(1, 0, 0).applyQuaternion(group.quaternion)
      _up.set(0, 1, 0).applyQuaternion(group.quaternion)

      _muzzle
        .copy(group.position)
        .addScaledVector(_right, side * scale * 0.35)
        .addScaledVector(_up, -scale * 0.12)
        .addScaledVector(_forward, scale * 0.55)

      const ok = weapons.current?.fire(
        _muzzle,
        _forward,
        velocity.current,
        boltSpeed,
        boltLife,
      )
      if (!ok) playLaserSound(0.18)

      fireCooldown.current = 1 / Math.max(effectiveFireRate, 0.1)
    }

    // Telemetry (throttled — avoid React renders every frame)
    telemetryAge.current += dt
    if (onTelemetry && telemetryAge.current > 0.1) {
      telemetryAge.current = 0
      const speed = velocity.current.length()
      const orbitRadius = Math.max(altitude, softRadius)
      // Reference circular speed at this altitude (ship is not under gravity)
      const vCircular = circularOrbitSpeed(mu, orbitRadius)
      onTelemetry({
        speed,
        altitude: Math.max(0, altitude - sunSize),
        circularSpeed: vCircular,
        orbitRatio: vCircular > 1e-4 ? speed / vCircular : 0,
        hp: hp.current,
        maxHp: MAX_HP,
        heat: heat.current,
        overheated: overheated.current,
        speedBuff: speedBuff.current,
        fireBuff: fireBuff.current,
      })
    }

    // Chase camera — same up-offset on eye & look so view axis = ship forward
    // (crosshair / laser stay aligned; old 0.25*height look made shots sit high)
    _forward.set(0, 0, -1).applyQuaternion(group.quaternion)
    _up.set(0, 1, 0).applyQuaternion(group.quaternion)
    _camPos
      .copy(group.position)
      .addScaledVector(_forward, -camDistance)
      .addScaledVector(_up, camHeight)
    _lookAt
      .copy(group.position)
      .addScaledVector(_forward, lookAhead)
      .addScaledVector(_up, camHeight)

    if (!cameraReady.current) {
      camera.position.copy(_camPos)
      camera.up.copy(_up)
      camera.lookAt(_lookAt)
      cameraReady.current = true
    } else {
      // Catch up harder when the ship is moving fast so it can't pull away
      const speed = velocity.current.length()
      const follow = camLag + Math.min(speed * 0.35, 14)
      const camAlpha = 1 - Math.exp(-follow * dt)
      camera.position.lerp(_camPos, camAlpha)
      camera.up.lerp(_up, camAlpha).normalize()
      camera.lookAt(_lookAt)
    }
  })

  return (
    <>
      <group
        ref={(node) => {
          ship.current = node!
          if (shipRef) shipRef.current = node
        }}
        visible={!hidden}
      >
        <group rotation={[0, modelYaw, 0]}>
          <Spaceship
            scale={scale}
            metalness={metalness}
            roughness={roughness}
            envMapIntensity={envMapIntensity}
            tint={hurtTint ? '#ffaa88' : undefined}
          />
          <GunHardpoints
            scale={scale}
            leftMuzzle={leftMuzzle}
            rightMuzzle={rightMuzzle}
          />
          <ShipThrusters scale={scale} intensityRef={thrustGlow} />
        </group>
      </group>
      <ProjectileField
        weapons={weapons}
        sunPosition={sunPosition}
        sunSize={sunSize}
        scale={scale}
        hazardFields={hazardFields}
        laserTargets={laserTargets}
        paused={paused}
      />
      {explosions.map((burst) => (
        <ShipExplosion
          key={burst.id}
          position={burst.position}
          scale={scale}
          onDone={() => removeExplosion(burst.id)}
        />
      ))}
      {hitSparks.map((spark) => (
        <HitSpark
          key={spark.id}
          position={spark.position}
          scale={scale}
          color="#ffcc88"
          onDone={() =>
            setHitSparks((list) => list.filter((s) => s.id !== spark.id))
          }
        />
      ))}
      <OrbitGuide
        ship={ship}
        velocity={velocity}
        body={sunPosition}
        visible={showOrbitGuide}
      />
    </>
  )
}
