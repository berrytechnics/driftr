import { useFrame } from '@react-three/fiber'
import { useRef, type MutableRefObject, type RefObject } from 'react'
import { Vector3, type Object3D } from 'three'
import {
  NYX_BEACON_APPROACH_RANGE,
  NYX_BEACON_COOLDOWN_S,
  NYX_BEACON_LABEL,
  NYX_BEACON_LIFE_S,
  NYX_BEACON_NEAR_RANGE,
} from '@/lore/easterEggs'
import type { MapLorePing } from '@/map/systemMap'

type NyxBeaconProps = {
  nyxRef: RefObject<Object3D | null>
  sunPosition: [number, number, number]
  playerRef: RefObject<Object3D | null>
  lorePingsRef: MutableRefObject<MapLorePing[]>
  paused?: boolean
}

const _nyx = new Vector3()
const _player = new Vector3()
const _sun = new Vector3()

/** Rare cold distress ping near Nyx — writes into the map lore ping list. */
export function NyxBeacon({
  nyxRef,
  sunPosition,
  playerRef,
  lorePingsRef,
  paused = false,
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

    list.length = 0
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
      z: _nyx.z - _sun.z,
      label: NYX_BEACON_LABEL,
    }
    activeLife.current = NYX_BEACON_LIFE_S
    cooldown.current = NYX_BEACON_COOLDOWN_S
  })

  return null
}
