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
    const flicker =
      0.82 +
      0.12 * Math.sin(phase.current * 1.7 + side) +
      0.06 * Math.sin(clock.elapsedTime * 40 + side * 2)

    const power = intensity * flicker
    // Cone is authored along +Y; parent rotates it to aft (+Z)
    jet.current.scale.set(
      fx * (0.65 + power * 0.7),
      fx * (0.75 + power * 1.7),
      fx * (0.65 + power * 0.7),
    )

    const coreMat = core.current.material as MeshBasicMaterial
    const midMat = mid.current.material as MeshBasicMaterial
    const glowMat = glow.current.material as MeshBasicMaterial
    coreMat.opacity = 0.55 + power * 0.4
    midMat.opacity = 0.28 + power * 0.35
    glowMat.opacity = 0.12 + power * 0.22

    light.current.intensity = power * 2.2
    light.current.distance = (5 + power * 8) * fx
  })

  return (
    <group ref={root} position={[side * x, y, z]} visible={false}>
      <group ref={jet} rotation={[Math.PI / 2, 0, 0]}>
        <mesh ref={glow} position={[0, 0.55, 0]} frustumCulled={false}>
          <coneGeometry args={[0.55, 1.1, 16, 1, true]} />
          <meshBasicMaterial
            color="#4ad2ff"
            transparent
            opacity={0.15}
            depthWrite={false}
            blending={AdditiveBlending}
            side={DoubleSide}
            toneMapped={false}
          />
        </mesh>
        <mesh ref={mid} position={[0, 0.4, 0]} frustumCulled={false}>
          <coneGeometry args={[0.28, 0.9, 14, 1, true]} />
          <meshBasicMaterial
            color="#7ae7ff"
            transparent
            opacity={0.35}
            depthWrite={false}
            blending={AdditiveBlending}
            side={DoubleSide}
            toneMapped={false}
          />
        </mesh>
        <mesh ref={core} position={[0, 0.22, 0]} frustumCulled={false}>
          <coneGeometry args={[0.1, 0.55, 12, 1, true]} />
          <meshBasicMaterial
            color="#e8fbff"
            transparent
            opacity={0.7}
            depthWrite={false}
            blending={AdditiveBlending}
            side={DoubleSide}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, 0.02, 0]} frustumCulled={false}>
          <sphereGeometry args={[0.14, 12, 12]} />
          <meshBasicMaterial
            color="#c8f4ff"
            transparent
            opacity={0.9}
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
        distance={6}
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
