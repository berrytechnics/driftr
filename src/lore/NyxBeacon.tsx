import { useFrame } from '@react-three/fiber'
import { useRef, type MutableRefObject, type RefObject } from 'react'
import { Vector3, type Object3D } from 'three'
import {
  OUTER_DWARF_ECC,
  OUTER_DWARF_ORBIT,
} from '@/game/systemConfig'
import {
  NYX_APO_MAP_LABEL,
  NYX_BEACON_APPROACH_RANGE,
  NYX_BEACON_COOLDOWN_S,
  NYX_BEACON_LABEL,
  NYX_BEACON_LIFE_S,
  NYX_BEACON_NEAR_RANGE,
} from '@/lore/easterEggs'
import {
  NYX_ORBIT_INCLINATION,
  NYX_ORBIT_PHASE,
} from '@/lore/NyxDerelict'
import type { MapLorePing } from '@/map/systemMap'
import { placeEllipticalOrbit } from '@/world/gravity'

type NyxBeaconProps = {
  nyxRef: RefObject<Object3D | null>
  sunPosition: [number, number, number]
  playerRef: RefObject<Object3D | null>
  lorePingsRef: MutableRefObject<MapLorePing[]>
  paused?: boolean
  /** Persist apo pad mark after Hyperion clue (until ghost found). */
  apoMarkActive?: boolean
  periapsisPhase?: number
  inclination?: number
}

const _nyx = new Vector3()
const _player = new Vector3()
const _sun = new Vector3()
const _apo = new Vector3()
const _vel = new Vector3()

function removePingLabel(list: MapLorePing[], label: string) {
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].label === label) list.splice(i, 1)
  }
}

/**
 * Map lore pings: ephemeral NT-0 near Nyx, plus sticky apo Transit mark
 * once Hyperion points you at the far turn.
 * Only mutates this component's labels — other writers (e.g. Sol shard cheat) share the list.
 */
export function NyxBeacon({
  nyxRef,
  sunPosition,
  playerRef,
  lorePingsRef,
  paused = false,
  apoMarkActive = false,
  periapsisPhase = NYX_ORBIT_PHASE,
  inclination = NYX_ORBIT_INCLINATION,
}: NyxBeaconProps) {
  const cooldown = useRef(12)
  const activeLife = useRef(0)
  const ping = useRef<MapLorePing | null>(null)

  useFrame((_, delta) => {
    if (paused) return
    const dt = Math.min(delta, 0.05)
    const nyx = nyxRef.current
    const player = playerRef.current
    const list = lorePingsRef.current
    _sun.set(...sunPosition)

    if (ping.current && activeLife.current > 0) {
      let drain = dt
      if (player) {
        player.getWorldPosition(_player)
        const px = _player.x - _sun.x
        const pz = _player.z - _sun.z
        const dPing = Math.hypot(ping.current.x - px, ping.current.z - pz)
        if (dPing < NYX_BEACON_APPROACH_RANGE) drain *= 3.5
      }
      activeLife.current -= drain
      if (activeLife.current <= 0) {
        ping.current = null
        activeLife.current = 0
      }
    }

    // Don't `list.length = 0` — Sol shard map cheat (and future writers) share this array.
    removePingLabel(list, NYX_APO_MAP_LABEL)
    removePingLabel(list, NYX_BEACON_LABEL)

    if (apoMarkActive) {
      placeEllipticalOrbit(
        _apo,
        _vel,
        _sun,
        OUTER_DWARF_ORBIT,
        OUTER_DWARF_ECC,
        1,
        periapsisPhase,
        inclination,
        1,
      )
      list.push({
        x: _apo.x - _sun.x,
        y: _apo.y - _sun.y,
        z: _apo.z - _sun.z,
        label: NYX_APO_MAP_LABEL,
      })
    }

    if (ping.current && activeLife.current > 0) {
      list.push({ ...ping.current })
    }

    cooldown.current = Math.max(0, cooldown.current - dt)
    if (cooldown.current > 0 || !nyx || !player || activeLife.current > 0) {
      return
    }

    nyx.getWorldPosition(_nyx)
    player.getWorldPosition(_player)
    if (_nyx.distanceTo(_player) > NYX_BEACON_NEAR_RANGE) return

    ping.current = {
      x: _nyx.x - _sun.x,
      y: _nyx.y - _sun.y,
      z: _nyx.z - _sun.z,
      label: NYX_BEACON_LABEL,
    }
    activeLife.current = NYX_BEACON_LIFE_S
    cooldown.current = NYX_BEACON_COOLDOWN_S
  })

  return null
}
