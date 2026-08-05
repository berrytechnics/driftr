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

const PARTICLE_COUNT = 28
const LIFETIME = 0.28
const REFERENCE_SHIP_SCALE = 6

type HitSparkProps = {
  position: Vector3
  /** Ship scale — spark size tracks the craft */
  scale?: number
  color?: string
  onDone: () => void
}

/** Brief additive spark burst at a laser impact point. */
export function HitSpark({
  position,
  scale = 1,
  color = '#ffcc88',
  onDone,
}: HitSparkProps) {
  const points = useRef<Points>(null!)
  const age = useRef(0)
  const done = useRef(false)
  const fxScale = Math.max(scale / REFERENCE_SHIP_SCALE, 0.04)

  const { positions, velocities, colors } = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3)
    const velocities = new Float32Array(PARTICLE_COUNT * 3)
    const colors = new Float32Array(PARTICLE_COUNT * 3)
    const hot = new Color('#fff8e8')
    const cool = new Color(color)

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3
      positions[i3] = position.x
      positions[i3 + 1] = position.y
      positions[i3 + 2] = position.z

      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const speed = (4 + Math.random() * 18) * fxScale
      velocities[i3] = Math.sin(phi) * Math.cos(theta) * speed
      velocities[i3 + 1] = Math.sin(phi) * Math.sin(theta) * speed
      velocities[i3 + 2] = Math.cos(phi) * speed

      const c = hot.clone().lerp(cool, Math.random() * 0.85)
      colors[i3] = c.r
      colors[i3 + 1] = c.g
      colors[i3 + 2] = c.b
    }

    return { positions, velocities, colors }
  }, [position, fxScale, color])

  useLayoutEffect(() => {
    const geo = points.current.geometry
    geo.setAttribute('position', new BufferAttribute(positions, 3))
    geo.setAttribute('color', new BufferAttribute(colors, 3))
  }, [positions, colors])

  useFrame((_, delta) => {
    if (done.current) return
    const dt = Math.min(delta, 0.05)
    age.current += dt
    const t = age.current / LIFETIME

    const attr = points.current.geometry.getAttribute(
      'position',
    ) as BufferAttribute
    const arr = attr.array as Float32Array
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3
      arr[i3] += velocities[i3] * dt
      arr[i3 + 1] += velocities[i3 + 1] * dt
      arr[i3 + 2] += velocities[i3 + 2] * dt
      velocities[i3] *= 0.92
      velocities[i3 + 1] *= 0.92
      velocities[i3 + 2] *= 0.92
    }
    attr.needsUpdate = true

    const mat = points.current.material as PointsMaterial
    mat.opacity = Math.max(0, 1 - t)
    mat.size = 0.12 * fxScale * (1.2 - t * 0.6)

    if (age.current >= LIFETIME) {
      done.current = true
      onDone()
    }
  })

  return (
    <points ref={points} frustumCulled={false}>
      <bufferGeometry />
      <pointsMaterial
        size={0.12 * fxScale}
        vertexColors
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
        sizeAttenuation
      />
    </points>
  )
}
