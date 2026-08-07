import { Bloom, EffectComposer } from '@react-three/postprocessing'
import type { RefObject } from 'react'
import type { Mesh } from 'three'
import { StableGodRays } from '@/world/StableGodRays'

export type ScenePostFXProps = {
  multisampling: number
  intensity: number
  luminanceThreshold: number
  luminanceSmoothing?: number
  /** When set (and sun mesh is ready), enables volumetric god rays. */
  godRaysSun?: RefObject<Mesh | null> | null
}

/**
 * Bloom (+ optional god rays) via EffectComposer.
 * Loaded via lazy() so the postprocessing chunk is off the initial critical path.
 */
export function ScenePostFX({
  multisampling,
  intensity,
  luminanceThreshold,
  luminanceSmoothing = 0.9,
  godRaysSun = null,
}: ScenePostFXProps) {
  return (
    <EffectComposer enableNormalPass={false} multisampling={multisampling}>
      <Bloom
        intensity={intensity}
        luminanceThreshold={luminanceThreshold}
        luminanceSmoothing={luminanceSmoothing}
        mipmapBlur
      />
      {godRaysSun ? <StableGodRays sun={godRaysSun} /> : <></>}
    </EffectComposer>
  )
}
