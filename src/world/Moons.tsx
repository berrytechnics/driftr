import { useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef, type RefObject } from 'react'
import { Group, SRGBColorSpace, Vector3, type Object3D } from 'three'

export type MoonSpec = {
  size: number
  /** Clearance above the parent planet surface */
  orbitAltitude: number
  /** Orbital angular speed (rad/s) */
  orbitSpeed: number
  inclination?: number
  phase?: number
  map: string
  color?: string
  spin?: number
  moonRef?: RefObject<Group | null>
}

type OrbitingMoonProps = MoonSpec & {
  planetRef: RefObject<Object3D | null>
  planetSize: number
  paused?: boolean
}

const _planet = new Vector3()
const _offset = new Vector3()
const _axisX = new Vector3(1, 0, 0)

/** Single moon on a kinematic circular orbit around a planet. */
export function OrbitingMoon({
  planetRef,
  planetSize,
  size,
  orbitAltitude,
  orbitSpeed,
  inclination = 0,
  phase = 0,
  map,
  color = '#ffffff',
  spin = 0.08,
  paused = false,
  moonRef,
}: OrbitingMoonProps) {
  const group = useRef<Group>(null!)
  const spinGroup = useRef<Group>(null!)
  const angle = useRef(phase)
  const texture = useTexture(map)

  useLayoutEffect(() => {
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 4
    texture.needsUpdate = true
  }, [texture])

  const placeAtAngle = (root: Group, theta: number) => {
    const planet = planetRef.current
    if (!planet) return
    planet.getWorldPosition(_planet)
    const radius = planetSize + orbitAltitude
    _offset.set(Math.cos(theta) * radius, 0, Math.sin(theta) * radius)
    if (inclination !== 0) {
      _offset.applyAxisAngle(_axisX, inclination)
    }
    root.position.copy(_planet).add(_offset)
  }

  useLayoutEffect(() => {
    placeAtAngle(group.current, angle.current)
  }, [planetRef, planetSize, orbitAltitude, inclination])

  useFrame((_, delta) => {
    const root = group.current
    if (!paused) {
      const dt = Math.min(delta, 0.05)
      angle.current -= orbitSpeed * dt
      if (spin !== 0) {
        spinGroup.current.rotation.y += spin * dt
      }
    }
    placeAtAngle(root, angle.current)
  })

  return (
    <group
      ref={(node) => {
        group.current = node!
        if (moonRef) moonRef.current = node
      }}
    >
      <group ref={spinGroup}>
        <mesh castShadow={false} receiveShadow={false}>
          <sphereGeometry args={[size, 32, 32]} />
          <meshStandardMaterial
            map={texture}
            color={color}
            roughness={0.92}
            metalness={0}
            envMapIntensity={0}
          />
        </mesh>
      </group>
    </group>
  )
}

type PlanetMoonsProps = {
  planetRef: RefObject<Object3D | null>
  planetSize: number
  moons: MoonSpec[]
  paused?: boolean
}

/** Several moons sharing one parent planet. */
export function PlanetMoons({
  planetRef,
  planetSize,
  moons,
  paused = false,
}: PlanetMoonsProps) {
  return (
    <>
      {moons.map((moon, i) => (
        <OrbitingMoon
          key={i}
          planetRef={planetRef}
          planetSize={planetSize}
          paused={paused}
          {...moon}
        />
      ))}
    </>
  )
}
