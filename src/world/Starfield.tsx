import { Stars } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'

type StarfieldProps = {
  count: number
  depth: number
  radius: number
  factor: number
  saturation: number
  fade: boolean
  speed: number
}

/** Stars follow the camera so deep space stays filled while flying. */
export function Starfield(props: StarfieldProps) {
  const group = useRef<Group>(null!)

  useFrame(({ camera }) => {
    group.current.position.copy(camera.position)
  })

  return (
    <group ref={group}>
      <Stars {...props} />
    </group>
  )
}
