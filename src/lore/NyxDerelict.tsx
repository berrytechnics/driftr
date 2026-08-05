import { Center, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import {
  Color,
  Group,
  Vector3,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
} from 'three'
import stationUrl from '@/assets/models/space__station.glb?url'
import {
  isNyxNearApoapsis,
  NYX_DERELICT_PLAYER_RANGE,
  NYX_DERELICT_TOAST,
} from '@/lore/easterEggs'

type NyxDerelictProps = {
  nyxRef: RefObject<Object3D | null>
  sunPosition: [number, number, number]
  playerRef: RefObject<Object3D | null>
  paused?: boolean
  alreadySeen?: boolean
  onFirstSight?: (toast: string) => void
}

const _nyx = new Vector3()
const _player = new Vector3()
const _sun = new Vector3()
const GHOST = new Color('#6a5a88')

function ghostMaterials(root: Object3D) {
  root.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = false
    mesh.receiveShadow = false
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material]
    for (const material of materials) {
      const mat = material as MeshStandardMaterial
      if ('color' in mat && mat.color) mat.color.copy(GHOST)
      if ('emissive' in mat && mat.emissive) mat.emissive.copy(GHOST)
      if ('emissiveIntensity' in mat) mat.emissiveIntensity = 0.12
      if ('transparent' in mat) mat.transparent = true
      if ('opacity' in mat) mat.opacity = 0.28
      if ('depthWrite' in mat) mat.depthWrite = false
      if ('metalness' in mat) mat.metalness = 0.15
      if ('roughness' in mat) mat.roughness = 0.85
      mat.needsUpdate = true
    }
  })
}

/**
 * Decommissioned Nyx Transit berth — translucent ghost mesh, visible only
 * when Nyx is near apoapsis and the pilot is close. Not dockable.
 */
export function NyxDerelict({
  nyxRef,
  sunPosition,
  playerRef,
  paused = false,
  alreadySeen = false,
  onFirstSight,
}: NyxDerelictProps) {
  const root = useRef<Group>(null!)
  const seenRef = useRef(alreadySeen)
  seenRef.current = alreadySeen
  const { scene } = useGLTF(stationUrl, true, true)
  const model = useMemo(() => {
    const clone = scene.clone(true)
    ghostMaterials(clone)
    return clone
  }, [scene])

  useLayoutEffect(() => {
    if (root.current) root.current.visible = false
  }, [])

  useFrame(() => {
    const group = root.current
    const nyx = nyxRef.current
    if (!group || !nyx) return
    if (paused) {
      group.visible = false
      return
    }

    nyx.getWorldPosition(_nyx)
    _sun.set(...sunPosition)
    const sunDist = _nyx.distanceTo(_sun)
    const atApo = isNyxNearApoapsis(sunDist)

    // Hold a fixed local berth offset from Nyx
    group.position.copy(_nyx)
    group.position.x += 14
    group.position.y += 3
    group.position.z += 8
    group.lookAt(_nyx)

    const player = playerRef.current
    let nearPlayer = false
    if (player) {
      player.getWorldPosition(_player)
      nearPlayer =
        group.position.distanceTo(_player) < NYX_DERELICT_PLAYER_RANGE
    }

    const show = atApo && nearPlayer
    group.visible = show
    if (show && !seenRef.current) {
      seenRef.current = true
      onFirstSight?.(NYX_DERELICT_TOAST)
    }
  })

  return (
    <group ref={root} visible={false}>
      <Center>
        <primitive object={model} scale={0.32} />
      </Center>
    </group>
  )
}

useGLTF.preload(stationUrl, true, true)
