import { useFrame } from '@react-three/fiber'
import { useRef, type MutableRefObject, type RefObject } from 'react'
import { Vector3, type Group, type Object3D } from 'three'
import type { CargoBait } from '@/loot/cargoBait'
import type { MapBodyKind, MapLorePing, MapSnapshot } from '@/map/systemMap'

export type TrackedBody = {
  name: string
  object: RefObject<Object3D | null>
  size: number
  color: string
  kind?: MapBodyKind
  /**
   * Stable dashed-orbit radius on the map (e.g. semi-major axis).
   * When omitted, the guide uses the body's current sun distance.
   */
  guideOrbit?: number
  eccentricity?: number
  /** Periapsis angle in the map XZ plane (radians) */
  periapsisPhase?: number
  /** Orbital plane tilt (radians) */
  inclination?: number
}

/** Station object + the body whose map pip owns the berth ring. */
export type TrackedStation = {
  name: string
  object: RefObject<Object3D | null>
  host: RefObject<Object3D | null>
  hostSize: number
  /** Default true — ghost Transit has no livable berth ring on Nyx */
  hostRing?: boolean
  /** Default true — gold pip at station (Hyperion apo clue gates Nyx Transit) */
  showPip?: boolean
  /** Keep the chart label visible without selecting the pip */
  alwaysShowLabel?: boolean
}

type MapTrackerProps = {
  snapshotRef: RefObject<MapSnapshot>
  sunPosition: [number, number, number]
  sunSize: number
  sunColor: string
  starName?: string
  beltInner: number
  beltOuter: number
  bodies: TrackedBody[]
  shipRef?: RefObject<Group | null>
  banditRefs?: RefObject<Group | null>[]
  patrolRefs?: RefObject<Group | null>[]
  /** Dock stations — ring around host pip + pip at true berth. */
  stations?: TrackedStation[]
  /** When true, bandit / patrol pips are omitted from the map snapshot */
  hideNpcsRef?: RefObject<boolean>
  /** Ship-relative contact radius for NPC pips (world units). */
  sensorRangeRef?: RefObject<number>
  /** Countdown (seconds) for Nyx orbit highlight — decayed each frame. */
  nyxOrbitGlowRef?: RefObject<number>
  /** Persist — draw NYX TRANSIT corridor when true. */
  nyxCorridorUnlockedRef?: RefObject<boolean>
  /** Live lore pings (NT-0) written by NyxBeacon. */
  lorePingsRef?: RefObject<MapLorePing[]>
  /** Contested jettison dump — always visible system-wide while active. */
  cargoBaitRef?: MutableRefObject<CargoBait>
}

const _pos = new Vector3()
const _sun = new Vector3()
const _forward = new Vector3()
const _prevShip = new Vector3()
/** Min horizontal speed (u/s) before the map cone follows velocity. */
const MAP_TRAVEL_SPEED = 0.5

/** Writes a sun-centered XYZ snapshot each frame for the system map. */
export function MapTracker({
  snapshotRef,
  sunPosition,
  sunSize,
  sunColor,
  starName = 'Sol',
  beltInner,
  beltOuter,
  bodies,
  shipRef,
  banditRefs,
  patrolRefs,
  stations: stationList,
  hideNpcsRef,
  sensorRangeRef,
  nyxOrbitGlowRef,
  nyxCorridorUnlockedRef,
  lorePingsRef,
  cargoBaitRef,
}: MapTrackerProps) {
  const hadShipPos = useRef(false)

  useFrame((_, delta) => {
    const snap = snapshotRef.current
    _sun.set(...sunPosition)
    const hideNpcs = !!hideNpcsRef?.current
    const dt = Math.min(delta, 0.05)

    if (nyxOrbitGlowRef) {
      nyxOrbitGlowRef.current = Math.max(0, nyxOrbitGlowRef.current - dt)
      snap.nyxOrbitGlow = nyxOrbitGlowRef.current
    } else {
      snap.nyxOrbitGlow = 0
    }

    snap.nyxCorridorUnlocked = !!nyxCorridorUnlockedRef?.current

    const srcPings = lorePingsRef?.current
    if (!snap.lorePings) snap.lorePings = []
    const out = snap.lorePings
    out.length = 0
    if (srcPings) {
      for (const p of srcPings) {
        out.push({ x: p.x, y: p.y ?? 0, z: p.z, label: p.label })
      }
    }

    const bait = cargoBaitRef?.current
    if (bait?.active && bait.remaining > 0) {
      if (!snap.cargoDump) snap.cargoDump = { x: 0, y: 0, z: 0 }
      snap.cargoDump.x = bait.x - _sun.x
      snap.cargoDump.y = bait.y - _sun.y
      snap.cargoDump.z = bait.z - _sun.z
    } else {
      snap.cargoDump = null
    }

    snap.starName = starName
    snap.starSize = sunSize
    snap.starColor = sunColor
    snap.beltInner = beltInner
    snap.beltOuter = beltOuter

    const list = snap.bodies
    list.length = bodies.length
    for (let i = 0; i < bodies.length; i++) {
      const src = bodies[i]
      const obj = src.object.current
      const kind = src.kind ?? 'planet'
      if (!list[i]) {
        list[i] = {
          name: src.name,
          x: 0,
          y: 0,
          z: 0,
          size: src.size,
          color: src.color,
          kind,
        }
      }
      const dst = list[i]
      dst.name = src.name
      dst.size = src.size
      dst.color = src.color
      dst.kind = kind
      dst.guideOrbit = src.guideOrbit
      dst.eccentricity = src.eccentricity
      dst.periapsisPhase = src.periapsisPhase
      dst.inclination = src.inclination
      if (obj) {
        obj.getWorldPosition(_pos)
        dst.x = _pos.x - _sun.x
        dst.y = _pos.y - _sun.y
        dst.z = _pos.z - _sun.z
      }
    }

    const ship = shipRef?.current
    if (ship) {
      ship.getWorldPosition(_pos)
      // Direction the cone should point on the ecliptic (XZ).
      // Group yaw θ maps local −Z → (−sin θ, 0, −cos θ), so
      // θ = atan2(−dir.x, −dir.z).
      let dx = 0
      let dz = -1
      _forward.set(0, 0, -1).applyQuaternion(ship.quaternion)
      dx = _forward.x
      dz = _forward.z
      if (hadShipPos.current && dt > 1e-6) {
        const vx = (_pos.x - _prevShip.x) / dt
        const vz = (_pos.z - _prevShip.z) / dt
        if (vx * vx + vz * vz > MAP_TRAVEL_SPEED * MAP_TRAVEL_SPEED) {
          dx = vx
          dz = vz
        }
      }
      _prevShip.copy(_pos)
      hadShipPos.current = true
      const heading = (Math.atan2(-dx, -dz) * 180) / Math.PI
      if (!snap.ship) snap.ship = { x: 0, y: 0, z: 0, heading: 0 }
      snap.ship.x = _pos.x - _sun.x
      snap.ship.y = _pos.y - _sun.y
      snap.ship.z = _pos.z - _sun.z
      snap.ship.heading = heading
    } else {
      snap.ship = null
      hadShipPos.current = false
    }

    const range = sensorRangeRef?.current
    const rangeSq =
      typeof range === 'number' && Number.isFinite(range) && range > 0
        ? range * range
        : Infinity
    const sx = snap.ship?.x ?? 0
    const sy = snap.ship?.y ?? 0
    const sz = snap.ship?.z ?? 0

    const bandits = snap.bandits
    bandits.length = 0
    if (!hideNpcs && banditRefs) {
      for (const ref of banditRefs) {
        const bandit = ref.current
        if (!bandit || !bandit.visible) continue
        bandit.getWorldPosition(_pos)
        const x = _pos.x - _sun.x
        const y = _pos.y - _sun.y
        const z = _pos.z - _sun.z
        const dx = x - sx
        const dy = y - sy
        const dz = z - sz
        if (dx * dx + dy * dy + dz * dz > rangeSq) continue
        bandits.push({ x, y, z })
      }
    }

    const patrols = snap.patrols
    patrols.length = 0
    if (!hideNpcs && patrolRefs) {
      for (const ref of patrolRefs) {
        const patrol = ref.current
        if (!patrol || !patrol.visible) continue
        patrol.getWorldPosition(_pos)
        const x = _pos.x - _sun.x
        const y = _pos.y - _sun.y
        const z = _pos.z - _sun.z
        const dx = x - sx
        const dy = y - sy
        const dz = z - sz
        if (dx * dx + dy * dy + dz * dz > rangeSq) continue
        patrols.push({ x, y, z })
      }
    }

    if (!snap.stations) snap.stations = []
    const stations = snap.stations
    stations.length = 0
    if (stationList) {
      for (const entry of stationList) {
        const station = entry.object.current
        const host = entry.host.current
        if (!station || !host) continue
        station.getWorldPosition(_pos)
        const x = _pos.x - _sun.x
        const y = _pos.y - _sun.y
        const z = _pos.z - _sun.z
        host.getWorldPosition(_pos)
        stations.push({
          name: entry.name,
          x,
          y,
          z,
          hostX: _pos.x - _sun.x,
          hostY: _pos.y - _sun.y,
          hostZ: _pos.z - _sun.z,
          hostSize: entry.hostSize,
          hostRing: entry.hostRing !== false,
          showPip: entry.showPip !== false,
          alwaysShowLabel: entry.alwaysShowLabel === true,
        })
      }
    }
  })

  return null
}
