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
}: MapTrackerProps) {
  useFrame(() => {
    const snap = snapshotRef.current
    _sun.set(...sunPosition)

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

    const bandits = snap.bandits
    bandits.length = 0
    if (banditRefs) {
      for (const ref of banditRefs) {
        const bandit = ref.current
        if (!bandit || !bandit.visible) continue
        bandit.getWorldPosition(_pos)
        bandits.push({
          x: _pos.x - _sun.x,
          z: _pos.z - _sun.z,
        })
      }
    }

    const patrols = snap.patrols
    patrols.length = 0
    if (patrolRefs) {
      for (const ref of patrolRefs) {
        const patrol = ref.current
        if (!patrol || !patrol.visible) continue
        patrol.getWorldPosition(_pos)
        patrols.push({
          x: _pos.x - _sun.x,
          z: _pos.z - _sun.z,
        })
      }
    }
  })

  return null
}
