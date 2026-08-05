import { useFrame } from '@react-three/fiber'
import type { RefObject } from 'react'
import { Vector3, type Group, type Object3D } from 'three'
import type { MapBodyKind, MapSnapshot } from '@/map/systemMap'

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
  /** When true, bandit / patrol pips are omitted from the map snapshot */
  hideNpcsRef?: RefObject<boolean>
  /** Ship-relative contact radius for NPC pips (world units). */
  sensorRangeRef?: RefObject<number>
}

const _pos = new Vector3()
const _sun = new Vector3()
const _forward = new Vector3()

/** Writes a sun-centered XZ snapshot each frame for the hold-M system map. */
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
  hideNpcsRef,
  sensorRangeRef,
}: MapTrackerProps) {
  useFrame(() => {
    const snap = snapshotRef.current
    _sun.set(...sunPosition)
    const hideNpcs = !!hideNpcsRef?.current

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
      if (obj) {
        obj.getWorldPosition(_pos)
        dst.x = _pos.x - _sun.x
        dst.z = _pos.z - _sun.z
      }
    }

    const ship = shipRef?.current
    if (ship) {
      ship.getWorldPosition(_pos)
      // Ship forward is local −Z; map +Y is world −Z, so 0° points up on the map
      _forward.set(0, 0, -1).applyQuaternion(ship.quaternion)
      const heading =
        (Math.atan2(_forward.x, -_forward.z) * 180) / Math.PI
      if (!snap.ship) snap.ship = { x: 0, z: 0, heading: 0 }
      snap.ship.x = _pos.x - _sun.x
      snap.ship.z = _pos.z - _sun.z
      snap.ship.heading = heading
    } else {
      snap.ship = null
    }

    const range = sensorRangeRef?.current
    const rangeSq =
      typeof range === 'number' && Number.isFinite(range) && range > 0
        ? range * range
        : Infinity
    const sx = snap.ship?.x ?? 0
    const sz = snap.ship?.z ?? 0

    const bandits = snap.bandits
    bandits.length = 0
    if (!hideNpcs && banditRefs) {
      for (const ref of banditRefs) {
        const bandit = ref.current
        if (!bandit || !bandit.visible) continue
        bandit.getWorldPosition(_pos)
        const x = _pos.x - _sun.x
        const z = _pos.z - _sun.z
        const dx = x - sx
        const dz = z - sz
        if (dx * dx + dz * dz > rangeSq) continue
        bandits.push({ x, z })
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
        const z = _pos.z - _sun.z
        const dx = x - sx
        const dz = z - sz
        if (dx * dx + dz * dz > rangeSq) continue
        patrols.push({ x, z })
      }
    }
  })

  return null
}
