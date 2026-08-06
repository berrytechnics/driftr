import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, type RefObject } from 'react'
import { GodRaysEffect, KernelSize } from 'postprocessing'
import type { Mesh } from 'three'

type StableGodRaysProps = {
  sun: RefObject<Mesh | null>
  /** Softer scattering for cool / dim stars */
  soft?: boolean
}

/**
 * GodRays from @react-three/postprocessing recreates the effect whenever the
 * props object identity changes (useMemo deps: [camera, props]) and never
 * disposes it (dispose={null}). That leaks GPU memory on every parent render.
 */
export function StableGodRays({ sun, soft = false }: StableGodRaysProps) {
  const camera = useThree((s) => s.camera)

  const effect = useMemo(() => {
    const light = sun.current
    if (!light) return null
    return new GodRaysEffect(camera, light, {
      samples: soft ? 24 : 36,
      density: soft ? 0.72 : 0.88,
      decay: soft ? 0.975 : 0.94,
      weight: soft ? 0.06 : 0.28,
      exposure: soft ? 0.045 : 0.28,
      clampMax: soft ? 0.28 : 0.85,
      blur: true,
      kernelSize: KernelSize.SMALL,
    })
  }, [camera, sun, soft])

  useEffect(() => {
    if (!effect) return
    if (sun.current) effect.lightSource = sun.current
    return () => {
      effect.dispose()
    }
  }, [effect, sun])

  if (!effect) return null
  // dispose={null}: we dispose manually above so R3F doesn't double-free
  return <primitive object={effect} dispose={null} />
}
