import { Center, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import {
  Group,
  Vector3,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
} from 'three'
import freeport2Url from '@/assets/models/stations/station_freeport_2.glb?url'
import freeportUrl from '@/assets/models/stations/station_freeport_zero.glb?url'
import greenpeaceUrl from '@/assets/models/stations/station_greenpeace.glb?url'
import orbitalComplexUrl from '@/assets/models/stations/station_orbital_complex.glb?url'
import miningOutpostUrl from '@/assets/models/stations/station_ssc_mining_outpost.glb?url'
import type { HazardField } from '@/ship/PlayerShip'
import {
  buildHullColliders,
  createMeshHazardField,
  type HullCollider,
} from '@/world/meshHazard'

export const VOID_STATION_URLS = {
  freeport2: freeport2Url,
  freeport: freeportUrl,
  greenpeace: greenpeaceUrl,
  orbitalComplex: orbitalComplexUrl,
  miningOutpost: miningOutpostUrl,
} as const

/** Native longest AABB edges (for display scale). */
export const VOID_STATION_NATIVE = {
  freeport2: 149.65,
  freeport: 29.48,
  greenpeace: 177.39,
  orbitalComplex: 4.55,
  miningOutpost: 392.29,
} as const

type VoidDerelictStationProps = {
  modelUrl: string
  sunPosition: [number, number, number]
  /** Longest world-unit span after scale. */
  length: number
  /** Native longest AABB edge used to derive scale. */
  nativeLongest: number
  /** Fixed park offset from the star (no orbit). */
  offset?: [number, number, number]
  /** Circular orbit radius; ignored when `offset` is set. */
  orbitRadius?: number
  orbitSpeed?: number
  inclination?: number
  phase?: number
  /** Local yaw spin (rad/s). */
  spinSpeed?: number
  paused?: boolean
  /** Hard-docked here — freeze local spin for a steady berth. */
  docked?: boolean
  stationRef?: RefObject<Group | null>
  hazardRef?: RefObject<HazardField | null>
  playerRef?: RefObject<Object3D | null>
  sightRange?: number
  alreadySeen?: boolean
  onFirstSight?: (toast: string) => void
  toast?: string
}

const _sun = new Vector3()
const _offset = new Vector3()
const _tilt = new Vector3(1, 0, 0)
const _player = new Vector3()

function prepStation(root: Object3D) {
  root.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = false
    mesh.receiveShadow = false
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((m) => m.clone())
    } else if (mesh.material) {
      mesh.material = mesh.material.clone()
    }
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material]
    for (const material of materials) {
      const mat = material as MeshStandardMaterial
      if ('envMapIntensity' in mat) mat.envMapIntensity = 0.55
      if ('metalness' in mat && mat.metalness > 0.85) mat.metalness = 0.7
      if ('roughness' in mat && mat.roughness < 0.15) mat.roughness = 0.32
      mat.needsUpdate = true
    }
  })
}

/**
 * Remnant-space station — BVH collision, optional sight toast / dock root.
 * Parks at a fixed offset (spin only) or drifts on a slow star orbit.
 */
export function VoidDerelictStation({
  modelUrl,
  sunPosition,
  length,
  nativeLongest,
  offset,
  orbitRadius = 1400,
  orbitSpeed = 0.01,
  inclination = 0.12,
  phase = 0,
  spinSpeed = 0,
  paused = false,
  docked = false,
  stationRef,
  hazardRef,
  playerRef,
  sightRange = 120,
  alreadySeen = false,
  onFirstSight,
  toast,
}: VoidDerelictStationProps) {
  const root = useRef<Group>(null!)
  const hullRef = useRef<HullCollider[]>([])
  const angle = useRef(phase)
  const yaw = useRef(0)
  const parked = useRef(false)
  const seenRef = useRef(alreadySeen)
  seenRef.current = alreadySeen

  const { scene } = useGLTF(modelUrl, true, true)
  const model = useMemo(() => {
    const clone = scene.clone(true)
    prepStation(clone)
    return clone
  }, [scene])

  const scale = length / nativeLongest

  useLayoutEffect(() => {
    hullRef.current = buildHullColliders(model)
  }, [model])

  useLayoutEffect(() => {
    if (!hazardRef) return
    hazardRef.current = createMeshHazardField({
      getRoot: () => root.current,
      getHull: () => hullRef.current,
    })
    return () => {
      hazardRef.current = null
    }
  }, [hazardRef])

  useFrame((_, dt) => {
    const group = root.current
    if (!group) return
    _sun.set(...sunPosition)
    const step = Math.min(dt, 0.05)
    const freeze = paused || docked

    if (offset) {
      if (!parked.current) {
        group.position.set(
          _sun.x + offset[0],
          _sun.y + offset[1],
          _sun.z + offset[2],
        )
        parked.current = true
      }
    } else if (!freeze) {
      angle.current += orbitSpeed * step
      _offset.set(
        Math.cos(angle.current) * orbitRadius,
        0,
        Math.sin(angle.current) * orbitRadius,
      )
      if (inclination !== 0) _offset.applyAxisAngle(_tilt, inclination)
      group.position.copy(_sun).add(_offset)
    } else if (!offset) {
      // Hold last orbital phase while paused / hard-docked.
      _offset.set(
        Math.cos(angle.current) * orbitRadius,
        0,
        Math.sin(angle.current) * orbitRadius,
      )
      if (inclination !== 0) _offset.applyAxisAngle(_tilt, inclination)
      group.position.copy(_sun).add(_offset)
    }

    if (!freeze && spinSpeed !== 0) {
      yaw.current += spinSpeed * step
      group.rotation.order = 'YXZ'
      group.rotation.y = yaw.current
    }

    if (paused && !docked) return

    const player = playerRef?.current
    if (!player || seenRef.current || !toast || !onFirstSight) return
    player.getWorldPosition(_player)
    if (group.position.distanceTo(_player) < sightRange) {
      seenRef.current = true
      onFirstSight(toast)
    }
  })

  return (
    <group
      ref={(node) => {
        root.current = node!
        if (stationRef) stationRef.current = node
      }}
    >
      <Center>
        <primitive object={model} scale={scale} />
      </Center>
    </group>
  )
}

useGLTF.preload(VOID_STATION_URLS.freeport2, true, true)
useGLTF.preload(VOID_STATION_URLS.freeport, true, true)
useGLTF.preload(VOID_STATION_URLS.greenpeace, true, true)
useGLTF.preload(VOID_STATION_URLS.orbitalComplex, true, true)
useGLTF.preload(VOID_STATION_URLS.miningOutpost, true, true)
