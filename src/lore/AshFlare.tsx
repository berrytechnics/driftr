import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { AdditiveBlending, DoubleSide, Group, type MeshBasicMaterial } from 'three'

type AshFlareProps = {
  /** Bump `seq` to ignite a new flare at this world point. */
  event: { seq: number; x: number; y: number; z: number } | null
}

const LIFE = 1.35

/** Brief solar offering flash when cargo is burned inside Hermes’ orbit. */
export function AshFlare({ event }: AshFlareProps) {
  const root = useRef<Group>(null!)
  const coreMat = useRef<MeshBasicMaterial>(null!)
  const shellMat = useRef<MeshBasicMaterial>(null!)
  const life = useRef(0)
  const lastSeq = useRef(0)

  useEffect(() => {
    if (!event || event.seq === lastSeq.current) return
    lastSeq.current = event.seq
    life.current = LIFE
    const g = root.current
    if (!g) return
    g.position.set(event.x, event.y, event.z)
    g.visible = true
    g.scale.setScalar(0.4)
  }, [event])

  useFrame((_, delta) => {
    const g = root.current
    if (!g || life.current <= 0) {
      if (g) g.visible = false
      return
    }
    const dt = Math.min(delta, 0.05)
    life.current -= dt
    const t = 1 - Math.max(0, life.current) / LIFE
    const expand = 0.5 + t * 6.5
    g.scale.setScalar(expand)
    const fade = Math.max(0, 1 - t)
    if (coreMat.current) coreMat.current.opacity = fade * 0.95
    if (shellMat.current) shellMat.current.opacity = fade * 0.45
    if (life.current <= 0) g.visible = false
  })

  return (
    <group ref={root} visible={false}>
      <mesh>
        <sphereGeometry args={[1.2, 16, 16]} />
        <meshBasicMaterial
          ref={coreMat}
          color="#ffc878"
          toneMapped={false}
          transparent
          opacity={0.9}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[2.1, 16, 16]} />
        <meshBasicMaterial
          ref={shellMat}
          color="#ff8a4a"
          toneMapped={false}
          transparent
          opacity={0.4}
          depthWrite={false}
          side={DoubleSide}
          blending={AdditiveBlending}
        />
      </mesh>
      <pointLight color="#ffb060" intensity={8} distance={40} decay={2} />
    </group>
  )
}
