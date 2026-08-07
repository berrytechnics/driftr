import { Center, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import {
  Color,
  Group,
  MathUtils,
  Vector3,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
} from 'three'
import type { HazardField } from '@/ship/PlayerShip'
import {
  buildHullColliders,
  createMeshHazardField,
  type HullCollider,
} from '@/world/meshHazard'

type FloatingWreckProps = {
  modelUrl: string
  /** Final display scale after Center. */
  scale: number
  sunPosition: [number, number, number]
  /** Fixed world offset from the star. */
  offset: [number, number, number]
  /** Slow tumble rate (rad/s). */
  tumbleSpeed?: number
  playerRef: RefObject<Object3D | null>
  /** Proximity for first-sight toast / journal. */
  sightRange?: number
  alreadySeen?: boolean
  onFirstSight?: (toast: string) => void
  toast?: string
  paused?: boolean
  /** Hard-docked here — keep mesh up for berth attach. */
  docked?: boolean
  /** Exposed root for DockBerth / map tracking. */
  stationRef?: RefObject<Group | null>
  /** Mesh-surface lethal plating (BVH). */
  hazardRef?: RefObject<HazardField | null>
  /** Ghost / cold-metal retune (default true). */
  ghost?: boolean
}

const _sun = new Vector3()
const _player = new Vector3()
const GHOST = new Color('#5a564e')

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
      if ('color' in mat && mat.color) mat.color.lerp(GHOST, 0.35)
      if ('emissive' in mat && mat.emissive) {
        mat.emissive.lerp(GHOST, 0.5)
      }
      if ('emissiveIntensity' in mat) {
        mat.emissiveIntensity = Math.min(mat.emissiveIntensity ?? 0, 0.12)
      }
      if ('metalness' in mat && mat.metalness > 0.75) mat.metalness = 0.55
      if ('roughness' in mat && mat.roughness < 0.35) mat.roughness = 0.55
      if ('envMapIntensity' in mat) mat.envMapIntensity = 0.45
      mat.needsUpdate = true
    }
  })
}

/**
 * Powered-down floating wreck in alt space — optional sight toast and dock root.
 */
export function FloatingWreck({
  modelUrl,
  scale,
  sunPosition,
  offset,
  tumbleSpeed = 0.07,
  playerRef,
  sightRange = 80,
  alreadySeen = false,
  onFirstSight,
  toast,
  paused = false,
  docked = false,
  stationRef,
  hazardRef,
  ghost = true,
}: FloatingWreckProps) {
  const root = useRef<Group>(null!)
  const hullRef = useRef<HullCollider[]>([])
  const seenRef = useRef(alreadySeen)
  seenRef.current = alreadySeen
  const spin = useRef(MathUtils.seededRandom(offset[0] + offset[2]) * Math.PI * 2)
  const { scene } = useGLTF(modelUrl, true, true)
  const model = useMemo(() => {
    const clone = scene.clone(true)
    if (ghost) ghostMaterials(clone)
    return clone
  }, [scene, ghost])

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
    group.position.set(
      _sun.x + offset[0],
      _sun.y + offset[1],
      _sun.z + offset[2],
    )

    if (!(paused || docked)) {
      spin.current += tumbleSpeed * dt
      group.rotation.set(
        spin.current * 0.35,
        spin.current,
        spin.current * 0.18,
      )
    }

    if (paused && !docked) return

    const player = playerRef.current
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
