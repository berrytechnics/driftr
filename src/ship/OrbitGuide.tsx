import { useFrame } from '@react-three/fiber'
import { useRef, type RefObject } from 'react'
import {
  DoubleSide,
  Group,
  Matrix4,
  Quaternion,
  Vector3,
  type Mesh,
} from 'three'

type OrbitGuideProps = {
  ship: RefObject<Group | null>
  velocity: RefObject<Vector3>
  body: [number, number, number]
  visible: boolean
}

const _body = new Vector3()
const _radius = new Vector3()
const _normal = new Vector3()
const _quat = new Quaternion()
const _mat = new Matrix4()
const _x = new Vector3()
const _y = new Vector3()
const _z = new Vector3()
const _fallbackUp = new Vector3(0, 1, 0)

/** Circular reference orbit at the ship's current altitude, in its orbital plane. */
export function OrbitGuide({
  ship,
  velocity,
  body,
  visible,
}: OrbitGuideProps) {
  const mesh = useRef<Mesh>(null!)

  useFrame(() => {
    if (!visible || !ship.current || !mesh.current) return

    _body.set(...body)
    _radius.copy(ship.current.position).sub(_body)
    const radius = _radius.length()
    if (radius < 1) return

    // Orbital plane normal from angular momentum L = r × v
    _normal.crossVectors(_radius, velocity.current)
    if (_normal.lengthSq() < 1e-6) {
      _normal.crossVectors(_radius, _fallbackUp)
    }
    if (_normal.lengthSq() < 1e-6) _normal.set(0, 1, 0)
    _normal.normalize()

    _z.copy(_normal)
    _x.crossVectors(_fallbackUp, _z)
    if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0)
    _x.normalize()
    _y.crossVectors(_z, _x).normalize()

    _mat.makeBasis(_x, _y, _z)
    _quat.setFromRotationMatrix(_mat)

    mesh.current.position.copy(_body)
    mesh.current.quaternion.copy(_quat)
    mesh.current.scale.setScalar(radius)
  })

  if (!visible) return null

  return (
    <mesh ref={mesh}>
      <ringGeometry args={[0.997, 1.003, 160]} />
      <meshBasicMaterial
        color="#5cdbff"
        transparent
        opacity={0.28}
        side={DoubleSide}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}
