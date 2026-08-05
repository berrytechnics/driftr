import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  Color,
  Points,
  PointsMaterial,
  Vector3,
} from 'three'

const PARTICLE_COUNT = 96
export const EXPLOSION_LIFETIME = 0.85
/** Effects were authored for ship scale 6. */
const REFERENCE_SHIP_SCALE = 6

type ShipExplosionProps = {
  position: Vector3
  /** Ship scale — burst size tracks the craft */
  scale?: number
  onDone: () => void
}

/** Short-lived additive particle burst at a world position. */
export function ShipExplosion({
  position,
  scale = 1,
  onDone,
}: ShipExplosionProps) {
  const points = useRef<Points>(null!)
  const age = useRef(0)
  const done = useRef(false)
  const fxScale = Math.max(scale / REFERENCE_SHIP_SCALE, 0.04)

  const { positions, velocities, colors } = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3)
    const velocities = new Float32Array(PARTICLE_COUNT * 3)
    const colors = new Float32Array(PARTICLE_COUNT * 3)
    const hot = new Color('#fff2c8')
    const cool = new Color('#ff6a1a')

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3
      positions[i3] = position.x
      positions[i3 + 1] = position.y
      positions[i3 + 2] = position.z

      // Bias outward in a sphere — speeds scale with the ship
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const speed = (8 + Math.random() * 28) * fxScale
      velocities[i3] = Math.sin(phi) * Math.cos(theta) * speed
      velocities[i3 + 1] = Math.sin(phi) * Math.sin(theta) * speed
      velocities[i3 + 2] = Math.cos(phi) * speed

      const c = hot.clone().lerp(cool, Math.random())
      colors[i3] = c.r
      colors[i3 + 1] = c.g
      colors[i3 + 2] = c.b
    }

    return { positions, velocities, colors }
  }, [position, fxScale])

  useLayoutEffect(() => {
    const geo = points.current.geometry
    geo.setAttribute('position', new BufferAttribute(positions, 3))
    geo.setAttribute('color', new BufferAttribute(colors, 3))
  }, [positions, colors])

  useFrame((_, delta) => {
    if (done.current) return
    const dt = Math.min(delta, 0.05)
    age.current += dt
    const t = age.current / EXPLOSION_LIFETIME

    const attr = points.current.geometry.getAttribute('position') as BufferAttribute
    const arr = attr.array as Float32Array
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3
      arr[i3] += velocities[i3] * dt
      arr[i3 + 1] += velocities[i3 + 1] * dt
      arr[i3 + 2] += velocities[i3 + 2] * dt
      // Mild drag so the burst blooms then hangs
      velocities[i3] *= 1 - 1.8 * dt
      velocities[i3 + 1] *= 1 - 1.8 * dt
      velocities[i3 + 2] *= 1 - 1.8 * dt
    }
    attr.needsUpdate = true

    const mat = points.current.material as PointsMaterial
    mat.opacity = Math.max(0, 1 - t * t)
    mat.size = (1.8 + t * 2.4) * fxScale

    if (age.current >= EXPLOSION_LIFETIME) {
      done.current = true
      onDone()
    }
  })

  return (
    <points ref={points}>
      <bufferGeometry />
      <pointsMaterial
        vertexColors
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        size={1.8 * fxScale}
        sizeAttenuation
        opacity={1}
        toneMapped={false}
      />
    </points>
  )
}
