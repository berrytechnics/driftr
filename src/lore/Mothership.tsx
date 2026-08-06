import { Center } from '@react-three/drei'
import { useFrame, useLoader } from '@react-three/fiber'
import {
  Suspense,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react'
import {
  Color,
  Group,
  Matrix4,
  MeshStandardMaterial,
  PointLight,
  Vector3,
  type Mesh,
  type Object3D,
} from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import mothershipUrl from '@/assets/models/mothership.obj?url'
import {
  VOID_MOTHERSHIP_INCLINATION,
  VOID_MOTHERSHIP_LENGTH,
  VOID_MOTHERSHIP_NATIVE_HEIGHT,
  VOID_MOTHERSHIP_NATIVE_LONGEST,
  VOID_MOTHERSHIP_ORBIT,
  VOID_MOTHERSHIP_SPIN_SPEED,
} from '@/game/systemConfig'
import type { HazardField } from '@/ship/PlayerShip'

export const MOTHERSHIP_MODEL_URL = mothershipUrl

type MothershipProps = {
  sunPosition: [number, number, number]
  /** Fixed distance from the dwarf (same ballpark as the old orbit). */
  orbitRadius?: number
  /** Yaw rate (rad/s) while parked. */
  spinSpeed?: number
  /** Vertical offset angle for the parked berth. */
  inclination?: number
  /** Azimuth of the parked berth around the dwarf. */
  phase?: number
  /** Longest world-unit span after scale (must beat Sol’s diameter). */
  length?: number
  paused?: boolean
  shipRef?: RefObject<Group | null>
  hazardRef?: RefObject<HazardField | null>
}

const _sun = new Vector3()
const _offset = new Vector3()
const _tilt = new Vector3(1, 0, 0)
const _local = new Vector3()
const _inv = new Matrix4()
const _from = new Vector3()
const _to = new Vector3()

const HULL = new Color('#8c8782')
const TRIM = new Color('#4a5858')
const RUN_EMISSIVE = new Color('#3ad8ff')
const BAY_EMISSIVE = new Color('#ff9a48')
const HULL_EMISSIVE = new Color('#2a3238')

/**
 * Slightly outside the centered AABB so the chase camera dies on plating
 * instead of clipping into bay cavities / backfaces first.
 */
const HULL_FIT = 1.02

function tuneMothershipMaterials(root: Object3D) {
  root.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = false
    mesh.receiveShadow = false
    const name = (mesh.name || mesh.parent?.name || '').toLowerCase()
    const isRing = /ring/.test(name)
    const isBay = /dimple|bay|canyon/.test(name)
    const isGreeble = /greeble/.test(name)

    let color = HULL
    let metalness = 0.52
    let roughness = 0.58
    let emissive = HULL_EMISSIVE
    let emissiveIntensity = 0.22

    if (isRing) {
      color = TRIM
      metalness = 0.68
      roughness = 0.38
      emissive = RUN_EMISSIVE
      emissiveIntensity = 1.15
    } else if (isBay) {
      color = new Color('#5a5048')
      metalness = 0.45
      roughness = 0.5
      emissive = BAY_EMISSIVE
      emissiveIntensity = 0.95
    } else if (isGreeble) {
      color = TRIM
      metalness = 0.62
      roughness = 0.44
      emissive = RUN_EMISSIVE
      emissiveIntensity = 0.55
    }

    const mat = new MeshStandardMaterial({
      color,
      metalness,
      roughness,
      envMapIntensity: 0.75,
      emissive,
      emissiveIntensity,
      toneMapped: true,
    })
    mesh.material = mat
  })
}

/**
 * Solid saucer volume in orbit-root local space (centered by `<Center>`).
 * Surface-triangle pads alone always tunnel — the hull is ~250u thick at the
 * core and PlayerShip only samples the current point with a ~0.01 pad.
 */
function hullExtents(length: number) {
  const hx = length * 0.5 * HULL_FIT
  const hy =
    length *
    (VOID_MOTHERSHIP_NATIVE_HEIGHT / VOID_MOTHERSHIP_NATIVE_LONGEST) *
    0.5 *
    HULL_FIT
  return { hx, hy, hz: hx }
}

function hitEllipsoid(
  px: number,
  py: number,
  pz: number,
  hx: number,
  hy: number,
  hz: number,
  pad: number,
) {
  const ax = hx + pad
  const ay = hy + pad
  const az = hz + pad
  if (ax <= 0 || ay <= 0 || az <= 0) return false
  const nx = px / ax
  const ny = py / ay
  const nz = pz / az
  return nx * nx + ny * ny + nz * nz <= 1
}

/** Segment ∩ solid ellipsoid (local space). */
function segmentHitsEllipsoid(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  hx: number,
  hy: number,
  hz: number,
) {
  if (hx <= 0 || hy <= 0 || hz <= 0) return false
  // Map to unit sphere, then solve |P + t D|^2 = 1 for t ∈ [0,1]
  const px = ax / hx
  const py = ay / hy
  const pz = az / hz
  const dx = (bx - ax) / hx
  const dy = (by - ay) / hy
  const dz = (bz - az) / hz
  const a = dx * dx + dy * dy + dz * dz
  if (a < 1e-12) return px * px + py * py + pz * pz <= 1
  const b = 2 * (px * dx + py * dy + pz * dz)
  const c = px * px + py * py + pz * pz - 1
  let disc = b * b - 4 * a * c
  if (disc < 0) return false
  disc = Math.sqrt(disc)
  const inv = 0.5 / a
  const t0 = (-b - disc) * inv
  const t1 = (-b + disc) * inv
  return (t0 >= 0 && t0 <= 1) || (t1 >= 0 && t1 <= 1) || (t0 < 0 && t1 > 1)
}

function MothershipModel({
  length,
  paused = false,
}: {
  length: number
  paused?: boolean
}) {
  const contentRef = useRef<Group>(null!)
  const object = useLoader(OBJLoader, mothershipUrl)
  const warmRefs = useRef<Array<{ intensity: number; light: PointLight | null }>>(
    [],
  )
  const coolRefs = useRef<Array<{ intensity: number; light: PointLight | null }>>(
    [],
  )
  const pulse = useRef(0)

  const model = useMemo(() => {
    const clone = object.clone(true)
    tuneMothershipMaterials(clone)
    return clone
  }, [object])

  const scale = length / VOID_MOTHERSHIP_NATIVE_LONGEST
  const half = length * 0.5
  const rimY = length * 0.035
  const bayY = length * 0.02

  const rimLights = useMemo(() => {
    const list: { key: string; position: [number, number, number]; intensity: number }[] =
      []
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      const r = half * 0.82
      list.push({
        key: `rim-${i}`,
        position: [Math.cos(a) * r, rimY * (i % 2 === 0 ? 1 : -1), Math.sin(a) * r],
        intensity: 55,
      })
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2
      const r = half * 0.48
      list.push({
        key: `mid-${i}`,
        position: [Math.cos(a) * r, rimY * 0.6, Math.sin(a) * r],
        intensity: 42,
      })
    }
    return list
  }, [half, rimY])

  const bayLights = useMemo(
    () =>
      [
        { key: 'bay-n', position: [0, bayY, half * 0.22] as [number, number, number], intensity: 70 },
        { key: 'bay-s', position: [0, -bayY, -half * 0.22] as [number, number, number], intensity: 62 },
        { key: 'bay-e', position: [half * 0.28, bayY * 0.5, 0] as [number, number, number], intensity: 58 },
        { key: 'bay-w', position: [-half * 0.28, -bayY * 0.5, 0] as [number, number, number], intensity: 58 },
        { key: 'core', position: [0, bayY * 1.4, 0] as [number, number, number], intensity: 90 },
      ] as const,
    [bayY, half],
  )

  useFrame((_, dt) => {
    if (!paused) pulse.current += dt
    const t = pulse.current
    for (let i = 0; i < coolRefs.current.length; i++) {
      const entry = coolRefs.current[i]
      if (!entry?.light) continue
      const flicker = 0.88 + 0.12 * Math.sin(t * 1.1 + i * 0.7)
      entry.light.intensity = entry.intensity * flicker
    }
    for (let i = 0; i < warmRefs.current.length; i++) {
      const entry = warmRefs.current[i]
      if (!entry?.light) continue
      const breathe = 0.9 + 0.1 * Math.sin(t * 0.55 + i * 1.3)
      entry.light.intensity = entry.intensity * breathe
    }
  })

  const coolDistance = half * 0.55
  const warmDistance = half * 0.7

  return (
    <group ref={contentRef}>
      <Center>
        <primitive object={model} scale={scale} />
      </Center>

      <pointLight
        color="#8ec8e0"
        intensity={35}
        distance={half * 1.1}
        decay={2}
        position={[0, half * 0.12, 0]}
      />
      <pointLight
        color="#7a90a0"
        intensity={28}
        distance={half * 1.1}
        decay={2}
        position={[0, -half * 0.1, 0]}
      />

      {rimLights.map((lamp, i) => (
        <pointLight
          key={lamp.key}
          ref={(node) => {
            coolRefs.current[i] = { intensity: lamp.intensity, light: node }
          }}
          color="#4ae0ff"
          intensity={lamp.intensity}
          distance={coolDistance}
          decay={2}
          position={lamp.position}
        />
      ))}

      {bayLights.map((lamp, i) => (
        <pointLight
          key={lamp.key}
          ref={(node) => {
            warmRefs.current[i] = { intensity: lamp.intensity, light: node }
          }}
          color="#ffb060"
          intensity={lamp.intensity}
          distance={warmDistance}
          decay={2}
          position={lamp.position}
        />
      ))}
    </group>
  )
}

/**
 * Ancient saucer circling the black dwarf — larger than Sol, scenery only.
 */
export function Mothership({
  sunPosition,
  orbitRadius = VOID_MOTHERSHIP_ORBIT,
  spinSpeed = VOID_MOTHERSHIP_SPIN_SPEED,
  inclination = VOID_MOTHERSHIP_INCLINATION,
  phase = 1.1,
  length = VOID_MOTHERSHIP_LENGTH,
  paused = false,
  shipRef,
  hazardRef,
}: MothershipProps) {
  const root = useRef<Group>(null!)
  const yaw = useRef(0)
  const parked = useRef(false)
  const extents = useMemo(() => hullExtents(length), [length])

  useLayoutEffect(() => {
    if (!hazardRef) return
    const { hx, hy, hz } = extents
    hazardRef.current = {
      test(point, pad) {
        const group = root.current
        if (!group) return false
        group.updateWorldMatrix(true, false)
        _inv.copy(group.matrixWorld).invert()
        _local.copy(point).applyMatrix4(_inv)
        return hitEllipsoid(_local.x, _local.y, _local.z, hx, hy, hz, pad)
      },
      impact(point, pad) {
        const group = root.current
        if (!group) return false
        group.updateWorldMatrix(true, false)
        _inv.copy(group.matrixWorld).invert()
        _local.copy(point).applyMatrix4(_inv)
        return hitEllipsoid(_local.x, _local.y, _local.z, hx, hy, hz, pad)
      },
      occludes(from, to) {
        const group = root.current
        if (!group) return false
        group.updateWorldMatrix(true, false)
        _inv.copy(group.matrixWorld).invert()
        _from.copy(from).applyMatrix4(_inv)
        _to.copy(to).applyMatrix4(_inv)
        return segmentHitsEllipsoid(
          _from.x,
          _from.y,
          _from.z,
          _to.x,
          _to.y,
          _to.z,
          hx,
          hy,
          hz,
        )
      },
    }
    return () => {
      hazardRef.current = null
    }
  }, [hazardRef, extents])

  useFrame((_, dt) => {
    const group = root.current
    if (!group) return

    if (!parked.current) {
      _sun.set(...sunPosition)
      _offset.set(
        Math.cos(phase) * orbitRadius,
        0,
        Math.sin(phase) * orbitRadius,
      )
      if (inclination !== 0) _offset.applyAxisAngle(_tilt, inclination)
      group.position.copy(_sun).add(_offset)
      parked.current = true
    }

    if (!paused) {
      yaw.current += spinSpeed * Math.min(dt, 0.05)
    }

    group.rotation.order = 'YXZ'
    group.rotation.x = 0
    group.rotation.y = yaw.current
    group.rotation.z = 0
  })

  return (
    <group
      ref={(node) => {
        root.current = node!
        if (shipRef) shipRef.current = node
      }}
    >
      <Suspense fallback={null}>
        <MothershipModel length={length} paused={paused} />
      </Suspense>
    </group>
  )
}

/** Optional named export for lore tree barrel. */
export function MothershipSuspense(props: MothershipProps): ReactNode {
  return (
    <Suspense fallback={null}>
      <Mothership {...props} />
    </Suspense>
  )
}

useLoader.preload(OBJLoader, mothershipUrl)
