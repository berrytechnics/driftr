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
import stationUrl from '@/assets/models/space+station.glb?url'

type SpaceStationProps = {
  /** Planet the station orbits (habitable world) */
  planetRef: RefObject<Object3D | null>
  planetSize: number
  /** Clearance above the planet surface */
  orbitAltitude?: number
  /** Orbital angular speed (rad/s) */
  orbitSpeed?: number
  /** Orbital plane tilt (radians) */
  inclination?: number
  scale?: number
  paused?: boolean
  /** Exposes the station root for collision tests */
  stationRef?: RefObject<Group | null>
}

const _planet = new Vector3()
const _offset = new Vector3()
const _axisX = new Vector3(1, 0, 0)

function tuneStationMaterials(root: Object3D) {
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
      if ('envMapIntensity' in mat) mat.envMapIntensity = 0.65
      if ('metalness' in mat && mat.metalness > 0.85) mat.metalness = 0.72
      if ('roughness' in mat && mat.roughness < 0.15) mat.roughness = 0.28
      mat.needsUpdate = true
    }
  })
}

export function SpaceStation({
  planetRef,
  planetSize,
  orbitAltitude = 2.4,
  orbitSpeed = 0.14,
  inclination = 0.18,
  scale = 0.28,
  paused = false,
  stationRef,
}: SpaceStationProps) {
  const group = useRef<Group>(null!)
  const angle = useRef(Math.PI * 0.35)
  const { scene } = useGLTF(stationUrl)

  const model = useMemo(() => {
    const clone = scene.clone(true)
    tuneStationMaterials(clone)
    return clone
  }, [scene])

  const placeAtAngle = (root: Group, theta: number) => {
    const planet = planetRef.current
    if (!planet) return false
    planet.getWorldPosition(_planet)
    const radius = planetSize + orbitAltitude
    _offset.set(Math.cos(theta) * radius, 0, Math.sin(theta) * radius)
    if (inclination !== 0) {
      _offset.applyAxisAngle(_axisX, inclination)
    }
    root.position.copy(_planet).add(_offset)
    // Local −Z faces the planet; local +Z is the open dock side for ship spawn
    root.lookAt(_planet)
    return true
  }

  useLayoutEffect(() => {
    placeAtAngle(group.current, angle.current)
  }, [planetRef, planetSize, orbitAltitude, inclination])

  useFrame((_, delta) => {
    const root = group.current
    if (!paused) {
      const dt = Math.min(delta, 0.05)
      angle.current -= orbitSpeed * dt
    }
    // Always keep pose current (needed while the start screen is paused)
    placeAtAngle(root, angle.current)
  })

  return (
    <group
      ref={(node) => {
        group.current = node!
        if (stationRef) stationRef.current = node
      }}
    >
      <Center>
        <primitive object={model} scale={scale} />
      </Center>
    </group>
  )
}

useGLTF.preload(stationUrl)
