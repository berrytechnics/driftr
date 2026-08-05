import { useFrame } from '@react-three/fiber'
import { useRef, type RefObject } from 'react'
import {
  AdditiveBlending,
  DoubleSide,
  Group,
  Mesh,
  PointLight,
  type MeshBasicMaterial,
} from 'three'

/** Authored against ship scale 6 — plume meshes scale with the craft. */
const REFERENCE_SHIP_SCALE = 6

type ShipThrustersProps = {
  scale: number
  /** 0 = off, ~0.65 = cruise, 1 = boost — smoothed by the ship */
  intensityRef: RefObject<number>
}

function Exhaust({
  side,
  scale,
  intensityRef,
}: {
  side: -1 | 1
  scale: number
  intensityRef: RefObject<number>
}) {
  const root = useRef<Group>(null!)
  const jet = useRef<Group>(null!)
  const core = useRef<Mesh>(null!)
  const mid = useRef<Mesh>(null!)
  const glow = useRef<Mesh>(null!)
  const light = useRef<PointLight>(null!)
  const phase = useRef(Math.random() * Math.PI * 2)

  const fx = Math.max(scale / REFERENCE_SHIP_SCALE, 0.04)
  const x = 0.2 * scale
  const y = -0.05 * scale
  const z = 0.4 * scale

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05)
    const intensity = intensityRef.current
    const on = intensity > 0.02
    root.current.visible = on
    if (!on) {
      light.current.intensity = 0
      return
    }

    phase.current += dt * (14 + intensity * 10)
    const rawFlicker =
      0.82 +
      0.12 * Math.sin(phase.current * 1.7 + side) +
      0.06 * Math.sin(clock.elapsedTime * 40 + side * 2)
    // Full burn: freeze plume/light — flicker + bloom reads as sun/star pulse
    const steadyBlend = Math.max(0, Math.min(1, (intensity - 0.68) / 0.22))
    const flicker =
      steadyBlend >= 1
        ? 1
        : rawFlicker * (1 - steadyBlend) + 1 * steadyBlend

    const power = intensity * (steadyBlend >= 1 ? 1 : flicker)
    // Cone is authored along +Y; parent rotates it to aft (+Z)
    jet.current.scale.set(
      fx * (0.38 + power * 0.38),
      fx * (0.42 + power * 0.85),
      fx * (0.38 + power * 0.38),
    )

    const coreMat = core.current.material as MeshBasicMaterial
    const midMat = mid.current.material as MeshBasicMaterial
    const glowMat = glow.current.material as MeshBasicMaterial
    coreMat.opacity = 0.5 + power * 0.35
    midMat.opacity = 0.22 + power * 0.28
    glowMat.opacity = 0.08 + power * 0.16

    light.current.intensity = intensity * 1.15
    light.current.distance = (3.5 + intensity * 5) * fx
  })

  return (
    <group ref={root} position={[side * x, y, z]} visible={false}>
      <group ref={jet} rotation={[Math.PI / 2, 0, 0]}>
        <mesh ref={glow} position={[0, 0.32, 0]} frustumCulled={false}>
          <coneGeometry args={[0.3, 0.62, 14, 1, true]} />
          <meshBasicMaterial
            color="#4ad2ff"
            transparent
            opacity={0.12}
            depthWrite={false}
            blending={AdditiveBlending}
            side={DoubleSide}
            toneMapped={false}
          />
        </mesh>
        <mesh ref={mid} position={[0, 0.24, 0]} frustumCulled={false}>
          <coneGeometry args={[0.15, 0.5, 12, 1, true]} />
          <meshBasicMaterial
            color="#7ae7ff"
            transparent
            opacity={0.3}
            depthWrite={false}
            blending={AdditiveBlending}
            side={DoubleSide}
            toneMapped={false}
          />
        </mesh>
        <mesh ref={core} position={[0, 0.13, 0]} frustumCulled={false}>
          <coneGeometry args={[0.055, 0.3, 10, 1, true]} />
          <meshBasicMaterial
            color="#e8fbff"
            transparent
            opacity={0.65}
            depthWrite={false}
            blending={AdditiveBlending}
            side={DoubleSide}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, 0.015, 0]} frustumCulled={false}>
          <sphereGeometry args={[0.075, 10, 10]} />
          <meshBasicMaterial
            color="#c8f4ff"
            transparent
            opacity={0.85}
            depthWrite={false}
            blending={AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      </group>
      <pointLight
        ref={light}
        color="#6ad8ff"
        intensity={0}
        distance={4}
        decay={2}
      />
    </group>
  )
}

/** Twin rear thruster plumes — intensity driven by the flight loop. */
export function ShipThrusters({ scale, intensityRef }: ShipThrustersProps) {
  return (
    <group>
      <Exhaust side={-1} scale={scale} intensityRef={intensityRef} />
      <Exhaust side={1} scale={scale} intensityRef={intensityRef} />
    </group>
  )
}
