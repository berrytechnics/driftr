import { Billboard } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { DoubleSide, type Group, type MeshBasicMaterial } from 'three'

type ShipHealthBarProps = {
  /** Local Y above the ship root */
  y: number
  width: number
  height: number
  /** 0–1 fill, read each frame */
  ratioRef: { current: number }
  /** Hide when false */
  visibleRef: { current: boolean }
  fillColor?: string
  lowColor?: string
}

/**
 * World-space billboard HP bar. Driven by refs so combat ticks don't re-render React.
 */
export function ShipHealthBar({
  y,
  width,
  height,
  ratioRef,
  visibleRef,
  fillColor = '#7ee787',
  lowColor = '#ff5a4a',
}: ShipHealthBarProps) {
  const root = useRef<Group>(null!)
  const fill = useRef<Group>(null!)
  const fillMat = useRef<MeshBasicMaterial>(null!)

  useFrame(() => {
    const group = root.current
    if (!group) return
    const show = visibleRef.current
    group.visible = show
    if (!show) return

    const ratio = Math.max(0, Math.min(1, ratioRef.current))
    const fillGroup = fill.current
    if (fillGroup) {
      fillGroup.scale.x = Math.max(0.001, ratio)
      fillGroup.position.x = -width * 0.5 * (1 - ratio)
    }
    if (fillMat.current) {
      fillMat.current.color.set(ratio < 0.35 ? lowColor : fillColor)
    }
  })

  return (
    <Billboard follow position={[0, y, 0]}>
      <group ref={root} visible={false}>
        {/* Backing */}
        <mesh position={[0, 0, 0]}>
          <planeGeometry args={[width + height * 0.35, height + height * 0.45]} />
          <meshBasicMaterial
            color="#0a0c10"
            transparent
            opacity={0.72}
            depthWrite={false}
            side={DoubleSide}
          />
        </mesh>
        {/* Empty track */}
        <mesh position={[0, 0, 0.001]}>
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial
            color="#2a3038"
            transparent
            opacity={0.9}
            depthWrite={false}
            side={DoubleSide}
          />
        </mesh>
        {/* Fill — scaled from the left */}
        <group ref={fill} position={[0, 0, 0.002]}>
          <mesh>
            <planeGeometry args={[width, height]} />
            <meshBasicMaterial
              ref={fillMat}
              color={fillColor}
              toneMapped={false}
              depthWrite={false}
              side={DoubleSide}
            />
          </mesh>
        </group>
      </group>
    </Billboard>
  )
}
