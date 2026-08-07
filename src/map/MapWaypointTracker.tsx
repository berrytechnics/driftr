import { useFrame, useThree } from '@react-three/fiber'
import type { RefObject } from 'react'
import { Vector3 } from 'three'
import { STATION_NAMES } from '@/game/systemConfig'
import { NYX_APO_MAP_LABEL } from '@/lore/easterEggs'
import type { MapWaypointState } from '@/map/mapWaypoint'
import type { MapSnapshot } from '@/map/systemMap'

type MapWaypointTrackerProps = {
  waypointRef: RefObject<MapWaypointState>
  snapshotRef: RefObject<MapSnapshot>
  sunPosition: [number, number, number]
  /** Hide while paused / docked / menus */
  active: boolean
}

const _pos = new Vector3()
const ON_SCREEN = 0.82
const EDGE_INSET_PX = 22

/**
 * Projects the map-selected body to screen space for the DOM waypoint overlay.
 */
export function MapWaypointTracker({
  waypointRef,
  snapshotRef,
  sunPosition,
  active,
}: MapWaypointTrackerProps) {
  const { camera, size } = useThree()

  useFrame(() => {
    const wp = waypointRef.current
    if (!active || !wp.name) {
      wp.show = false
      wp.onScreen = false
      return
    }

    const snap = snapshotRef.current
    const [sx, sy, sz] = sunPosition

    if (wp.name === snap.starName) {
      _pos.set(sx, sy, sz)
      wp.kind = 'star'
    } else {
      const station = snap.stations.find((s) => s.name === wp.name)
      if (station) {
        _pos.set(sx + station.x, sy + station.y, sz + station.z)
        wp.kind = 'station'
      } else {
        // Nyx Transit corridor / apo pick before the berth pip lands in snap
        const apoPing = snap.lorePings.find(
          (p) =>
            p.label === NYX_APO_MAP_LABEL && wp.name === STATION_NAMES.nyx,
        )
        if (apoPing) {
          _pos.set(sx + apoPing.x, sy + apoPing.y, sz + apoPing.z)
          wp.kind = 'station'
        } else {
          const lore = snap.lorePings.find((p) => p.label === wp.name)
          if (lore) {
            _pos.set(sx + lore.x, sy + (lore.y ?? 0), sz + lore.z)
            wp.kind = 'marker'
          } else {
            const body = snap.bodies.find((b) => b.name === wp.name)
            if (!body) {
              wp.show = false
              wp.onScreen = false
              return
            }
            _pos.set(sx + body.x, sy + body.y, sz + body.z)
            wp.kind = body.kind === 'moon' ? 'moon' : 'planet'
          }
        }
      }
    }

    wp.distance = camera.position.distanceTo(_pos)
    _pos.project(camera)

    let nx = _pos.x
    let ny = _pos.y
    const behind = _pos.z > 1

    if (behind) {
      nx = -nx
      ny = -ny
    }

    const onScreen =
      !behind && Math.abs(nx) < ON_SCREEN && Math.abs(ny) < ON_SCREEN

    wp.show = true
    wp.onScreen = onScreen

    if (onScreen) {
      wp.x = (nx * 0.5 + 0.5) * size.width
      wp.y = (-ny * 0.5 + 0.5) * size.height
      return
    }

    if (Math.abs(nx) < 1e-6 && Math.abs(ny) < 1e-6) {
      nx = 0
      ny = -1
    }
    const halfW = Math.max(1, size.width * 0.5 - EDGE_INSET_PX)
    const halfH = Math.max(1, size.height * 0.5 - EDGE_INSET_PX)
    const tx =
      Math.abs(nx) > 1e-8 ? halfW / Math.abs(nx) : Number.POSITIVE_INFINITY
    const ty =
      Math.abs(ny) > 1e-8 ? halfH / Math.abs(ny) : Number.POSITIVE_INFINITY
    const t = Math.min(tx, ty)

    wp.x = size.width * 0.5 + nx * t
    wp.y = size.height * 0.5 - ny * t
    wp.angle = Math.atan2(-ny, nx)
  })

  return null
}
