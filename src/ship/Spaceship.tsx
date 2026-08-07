import { Center, useGLTF } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import {
  Color,
  type Mesh,
  type MeshPhysicalMaterial,
  type MeshStandardMaterial,
  type Object3D,
} from 'three'
import shipUrl from '@/assets/models/ships/player_ship.glb?url'

type SpaceshipProps = {
  scale?: number
  metalness?: number
  roughness?: number
  envMapIntensity?: number
  /** Optional multiply tint for NPC variants */
  tint?: string
}

function applyMaterialLook(
  root: Object3D,
  metalness: number,
  roughness: number,
  envMapIntensity: number,
  tint?: string,
) {
  const tintColor = tint ? new Color(tint) : null
  root.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh) return

    mesh.castShadow = true
    mesh.receiveShadow = true

    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material]

    for (const material of materials) {
      const mat = material as MeshStandardMaterial & MeshPhysicalMaterial

      if ('metalnessMap' in mat) mat.metalnessMap = null
      if ('roughnessMap' in mat) mat.roughnessMap = null

      if ('metalness' in mat) mat.metalness = metalness
      if ('roughness' in mat) mat.roughness = roughness
      if ('envMapIntensity' in mat) mat.envMapIntensity = envMapIntensity

      if ('specularIntensity' in mat) mat.specularIntensity = 0.45
      if ('clearcoat' in mat) mat.clearcoat = 0.12
      if ('clearcoatRoughness' in mat) mat.clearcoatRoughness = 0.35
      if ('sheen' in mat) mat.sheen = 0
      if ('emissive' in mat && mat.emissive) mat.emissive.setScalar(0)
      if ('emissiveIntensity' in mat) mat.emissiveIntensity = 0

      if ('color' in mat && mat.color) {
        if (!mat.userData.baseColor) {
          mat.userData.baseColor = mat.color.clone()
        }
        if (tintColor) mat.color.copy(tintColor)
        else mat.color.copy(mat.userData.baseColor)
      }

      mat.needsUpdate = true
    }
  })
}

export function Spaceship({
  scale = 1,
  metalness = 0.38,
  roughness = 0.42,
  envMapIntensity = 0.55,
  tint,
}: SpaceshipProps) {
  const { scene } = useGLTF(shipUrl)
  // Deep-clone meshes + materials so player/bandit don't share GPU state
  const model = useMemo(() => {
    const root = scene.clone(true)
    root.traverse((child) => {
      const mesh = child as Mesh
      if (!mesh.isMesh) return
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => m.clone())
      } else if (mesh.material) {
        mesh.material = mesh.material.clone()
      }
    })
    return root
  }, [scene])

  useEffect(() => {
    applyMaterialLook(model, metalness, roughness, envMapIntensity, tint)
  }, [model, metalness, roughness, envMapIntensity, tint])

  // Mesh noses along +X; flight/camera forward is local -Z.
  return (
    <group rotation={[0, Math.PI / 2, 0]}>
      <Center>
        <primitive object={model} scale={scale} />
      </Center>
    </group>
  )
}

useGLTF.preload(shipUrl)
