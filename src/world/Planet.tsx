import { useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef, type RefObject } from 'react'
import { Group, SRGBColorSpace, Vector3 } from 'three'
import { useGraphicsSettings } from '@/game/useGraphicsSettings'
import {
  gravityAcceleration,
  placeEllipticalOrbit,
} from '@/world/gravity'

type PlanetProps = {
  sunPosition: [number, number, number]
  sunSize: number
  /**
   * Semi-major axis from sun center.
   * When eccentricity is 0 this is also the circular orbital radius.
   */
  orbitRadius: number
  /**
   * Orbital eccentricity (0 = circle). Default start is periapsis unless
   * `startRadiusFraction` is set.
   */
  eccentricity?: number
  /**
   * Where on the ellipse to seed (0 = periapsis, 1 = apoapsis) by radius.
   * Only meaningful when eccentricity > 0.
   */
  startRadiusFraction?: number
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
  /** Starting angle around the sun (radians) — periapsis argument when e > 0 */
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
const _gravity = new Vector3()

export function Planet({
  sunPosition,
  sunSize,
  orbitRadius,
  eccentricity = 0,
  startRadiusFraction = 0,
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
  const gfx = useGraphicsSettings()

  // v ∝ √μ, so scale μ by k² to keep a circular orbit at speed k·v
  const effectiveMu = mu * orbitSpeedScale * orbitSpeedScale

  useLayoutEffect(() => {
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = gfx.anisotropy
    texture.needsUpdate = true
  }, [texture, gfx.anisotropy])

  // Re-seed orbit when sun / μ / elements change via Leva
  useLayoutEffect(() => {
    _body.set(...sunPosition)
    placeEllipticalOrbit(
      group.current.position,
      velocity.current,
      _body,
      orbitRadius,
      eccentricity,
      effectiveMu,
      phase,
      inclination,
      eccentricity > 0.02 ? startRadiusFraction : 0,
    )
  }, [
    sunPosition,
    orbitRadius,
    eccentricity,
    startRadiusFraction,
    effectiveMu,
    phase,
    inclination,
  ])

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
            roughness={0.85}
            metalness={0.05}
          />
        </mesh>
      </group>
    </group>
  )
}
