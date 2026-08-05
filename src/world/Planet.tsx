import { useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef, type RefObject } from 'react'
import { Group, SRGBColorSpace, Vector3 } from 'three'
import {
  circularOrbitSpeed,
  circularOrbitTangent,
  gravityAcceleration,
} from '@/world/gravity'

type PlanetProps = {
  sunPosition: [number, number, number]
  sunSize: number
  /** Orbital radius from sun center */
  orbitRadius: number
  mu: number
  /**
   * Scales circular-orbit speed (and matching gravity).
   * 1 = full μ; lower = slower year.
   */
  orbitSpeedScale?: number
  /** Diffuse / albedo map (equirectangular) */
  map: string
  size?: number
  /** Surface color multiply */
  color?: string
  /** Starting angle around the sun (radians) */
  phase?: number
  /** Orbital plane tilt (radians) */
  inclination?: number
  /** Axial spin speed (rad/s) */
  spin?: number
  paused?: boolean
  /** Exposes the planet root for ship collision tests */
  planetRef?: RefObject<Group | null>
}

const _body = new Vector3()
const _radial = new Vector3()
const _tangent = new Vector3()
const _gravity = new Vector3()
const _tilt = new Vector3()

function placeInOrbit(
  group: Group,
  velocity: Vector3,
  body: Vector3,
  orbitRadius: number,
  effectiveMu: number,
  phase: number,
  inclination: number,
) {
  // Start in the XZ plane, then tilt around X
  _radial.set(Math.cos(phase), 0, Math.sin(phase))
  if (inclination !== 0) {
    _tilt.set(1, 0, 0)
    _radial.applyAxisAngle(_tilt, inclination)
  }
  _radial.normalize()

  group.position.copy(body).addScaledVector(_radial, orbitRadius)
  const speed = circularOrbitSpeed(effectiveMu, orbitRadius)
  circularOrbitTangent(_radial, _tangent)
  velocity.copy(_tangent).multiplyScalar(speed)
}

export function Planet({
  sunPosition,
  sunSize,
  orbitRadius,
  mu,
  orbitSpeedScale = 0.12,
  map,
  size = 3,
  color = '#ffffff',
  phase = 0,
  inclination = 0,
  spin = 0.06,
  paused = false,
  planetRef,
}: PlanetProps) {
  const group = useRef<Group>(null!)
  const spinGroup = useRef<Group>(null!)
  const velocity = useRef(new Vector3())
  const texture = useTexture(map)

  // v ∝ √μ, so scale μ by k² to keep a circular orbit at speed k·v
  const effectiveMu = mu * orbitSpeedScale * orbitSpeedScale

  useLayoutEffect(() => {
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 8
    texture.needsUpdate = true
  }, [texture])

  // Re-seed circular orbit when sun / μ / radius change via Leva
  useLayoutEffect(() => {
    _body.set(...sunPosition)
    placeInOrbit(
      group.current,
      velocity.current,
      _body,
      orbitRadius,
      effectiveMu,
      phase,
      inclination,
    )
  }, [sunPosition, orbitRadius, effectiveMu, phase, inclination])

  useFrame((_, delta) => {
    if (paused) return
    const dt = Math.min(delta, 0.05)
    const root = group.current
    _body.set(...sunPosition)

    const softRadius = Math.max(sunSize * 1.35, size * 2, 4)
    gravityAcceleration(root.position, _body, effectiveMu, softRadius, _gravity)
    velocity.current.addScaledVector(_gravity, dt)
    root.position.addScaledVector(velocity.current, dt)

    if (spin !== 0) {
      spinGroup.current.rotation.y += spin * dt
    }
  })

  return (
    <group
      ref={(node) => {
        group.current = node!
        if (planetRef) planetRef.current = node
      }}
    >
      <group ref={spinGroup}>
        <mesh castShadow={false} receiveShadow={false}>
          <sphereGeometry args={[size, 64, 64]} />
          <meshStandardMaterial
            map={texture}
            color={color}
            roughness={0.88}
            metalness={0}
            envMapIntensity={0}
          />
        </mesh>
      </group>
    </group>
  )
}
