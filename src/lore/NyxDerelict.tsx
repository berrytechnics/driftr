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
  OUTER_DWARF_ECC,
  OUTER_DWARF_ORBIT,
} from '@/game/systemConfig'
import { NYX_DERELICT_PLAYER_RANGE, NYX_DERELICT_TOAST } from '@/lore/easterEggs'
import { placeEllipticalOrbit } from '@/world/gravity'

type NyxDerelictProps = {
  sunPosition: [number, number, number]
  playerRef: RefObject<Object3D | null>
  /** Must match Nyx Planet orbital elements in Space. */
  periapsisPhase?: number
  inclination?: number
  /** Game freeze — hide mesh but keep pose if docked. */
  paused?: boolean
  /** Hard-docked at Transit — keep apo pose for ship attach. */
  docked?: boolean
  /** Night shards held — denser mesh + DockBerth live. */
  dockable?: boolean
  alreadySeen?: boolean
  onFirstSight?: (toast: string) => void
  /** Exposed root for DockBerth hard-dock follow. */
  stationRef?: RefObject<Group | null>
}

const _sun = new Vector3()
const _player = new Vector3()
const _vel = new Vector3()
const _look = new Vector3()
const GHOST = new Color('#8a7ab8')
const KEYED = new Color('#a898d0')

/** Approach radius when the apo pad is treated as its own dock "planet". */
export const NYX_TRANSIT_DOCK_RANGE = 36

/** Match Space.tsx Nyx Planet — phase / inclination of the ellipse. */
export const NYX_ORBIT_PHASE = 5.6
export const NYX_ORBIT_INCLINATION = 0.22

function ghostMaterials(root: Object3D, keyed: boolean) {
  const tint = keyed ? KEYED : GHOST
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
      if ('color' in mat && mat.color) mat.color.copy(tint)
      if ('emissive' in mat && mat.emissive) mat.emissive.copy(tint)
      if ('emissiveIntensity' in mat) mat.emissiveIntensity = keyed ? 0.38 : 0.26
      if ('transparent' in mat) mat.transparent = true
      if ('opacity' in mat) mat.opacity = keyed ? 0.72 : 0.52
      if ('depthWrite' in mat) mat.depthWrite = keyed
      if ('metalness' in mat) mat.metalness = 0.15
      if ('roughness' in mat) mat.roughness = 0.85
      mat.needsUpdate = true
    }
  })
}

/**
 * Nyx Transit ghost pad — parked at the apoapsis of Nyx’s ellipse (a place on
 * her path, not on the dwarf). Night dust densifies it into a hard-dock berth.
 */
export function NyxDerelict({
  sunPosition,
  playerRef,
  periapsisPhase = NYX_ORBIT_PHASE,
  inclination = NYX_ORBIT_INCLINATION,
  paused = false,
  docked = false,
  dockable = false,
  alreadySeen = false,
  onFirstSight,
  stationRef,
}: NyxDerelictProps) {
  const root = useRef<Group>(null!)
  const seenRef = useRef(alreadySeen)
  const keyedRef = useRef(dockable)
  seenRef.current = alreadySeen
  const { scene } = useGLTF(stationUrl, true, true)
  const model = useMemo(() => {
    const clone = scene.clone(true)
    ghostMaterials(clone, false)
    return clone
  }, [scene])

  useLayoutEffect(() => {
    if (root.current) root.current.visible = false
  }, [])

  useFrame(() => {
    const group = root.current
    if (!group) return

    if (keyedRef.current !== dockable) {
      keyedRef.current = dockable
      ghostMaterials(model, dockable)
    }

    _sun.set(...sunPosition)
    placeEllipticalOrbit(
      group.position,
      _vel,
      _sun,
      OUTER_DWARF_ORBIT,
      OUTER_DWARF_ECC,
      1,
      periapsisPhase,
      inclination,
      1, // apoapsis of Nyx’s path
    )
    // Face sunward (in from the far turn)
    _look.copy(_sun)
    group.lookAt(_look)

    if (paused && !docked) {
      group.visible = false
      return
    }

    const player = playerRef.current
    let nearPlayer = false
    if (player) {
      player.getWorldPosition(_player)
      nearPlayer =
        group.position.distanceTo(_player) < NYX_DERELICT_PLAYER_RANGE
    }

    const show = docked || nearPlayer
    group.visible = show

    if (nearPlayer && !seenRef.current) {
      seenRef.current = true
      onFirstSight?.(NYX_DERELICT_TOAST)
    }
  })

  return (
    <group
      ref={(node) => {
        root.current = node!
        if (stationRef) stationRef.current = node
      }}
      visible={false}
    >
      <Center>
        <primitive object={model} scale={0.42} />
      </Center>
    </group>
  )
}

useGLTF.preload(stationUrl, true, true)
