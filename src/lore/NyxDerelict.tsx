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
import stationUrl from '@/assets/models/stations/station_kronos.glb?url'
import {
  OUTER_DWARF_ECC,
  OUTER_DWARF_ORBIT,
} from '@/game/systemConfig'
import { NYX_DERELICT_PLAYER_RANGE, NYX_DERELICT_TOAST } from '@/lore/easterEggs'
import type { HazardField } from '@/ship/PlayerShip'
import { placeEllipticalOrbit } from '@/world/gravity'
import {
  buildHullColliders,
  createMeshHazardField,
  type HullCollider,
} from '@/world/meshHazard'

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
  /** Mesh-surface lethality only while keyed / dockable. */
  hazardRef?: RefObject<HazardField | null>
}

const _sun = new Vector3()
const _player = new Vector3()
const _vel = new Vector3()
const _look = new Vector3()
/** Cold, powered-down metal — not a lit commercial pad. */
const GHOST = new Color('#5a564e')
const KEYED = new Color('#6e6a60')

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
      // Near-dead emitters — keyed pad is solid enough to dock, not lit
      if ('emissiveIntensity' in mat) mat.emissiveIntensity = keyed ? 0.08 : 0.04
      if ('transparent' in mat) mat.transparent = true
      if ('opacity' in mat) mat.opacity = keyed ? 0.92 : 0.58
      if ('depthWrite' in mat) mat.depthWrite = keyed
      if ('metalness' in mat) mat.metalness = keyed ? 0.42 : 0.22
      if ('roughness' in mat) mat.roughness = keyed ? 0.72 : 0.9
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
  hazardRef,
}: NyxDerelictProps) {
  const root = useRef<Group>(null!)
  const hullRef = useRef<HullCollider[]>([])
  const seenRef = useRef(alreadySeen)
  const keyedRef = useRef(dockable)
  const dockableRef = useRef(dockable)
  seenRef.current = alreadySeen
  dockableRef.current = dockable
  const { scene } = useGLTF(stationUrl, true, true)
  const model = useMemo(() => {
    const clone = scene.clone(true)
    ghostMaterials(clone, false)
    return clone
  }, [scene])

  useLayoutEffect(() => {
    // Ghost materials use low opacity — include all meshes; lethality is gated.
    hullRef.current = buildHullColliders(model, () => true)
  }, [model])

  useLayoutEffect(() => {
    if (!hazardRef) return
    hazardRef.current = createMeshHazardField({
      getRoot: () => root.current,
      getHull: () => hullRef.current,
      active: () => dockableRef.current,
    })
    return () => {
      hazardRef.current = null
    }
  }, [hazardRef])

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
