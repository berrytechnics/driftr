import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  Color,
  CubeCamera,
  DoubleSide,
  Group,
  Mesh,
  NormalBlending,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  UnsignedByteType,
  Vector3,
  WebGLCubeRenderTarget,
} from 'three'
import {
  createGlowGeometry,
  createSunFlaresGeometry,
  createSunRaysGeometry,
} from '@/world/sun/geometry'
import {
  glowFS,
  glowVS,
  perlinFS,
  perlinVS,
  sunFlaresFS,
  sunFlaresVS,
  sunRaysFS,
  sunRaysVS,
  sunSphereFS,
  sunSphereVS,
} from '@/world/sun/shaders'

type SunProps = {
  position: [number, number, number]
  size: number
  color: string
  intensity: number
  /** Surface animation speed */
  flowSpeed?: number
  sunRef?: RefObject<Mesh | null>
  onReady?: (mesh: Mesh | null) => void
}

const _lightDir = new Vector3(1, 1, 1).normalize()

/**
 * Realistic animated sun ported from Tibi's three.js showcase
 * https://discourse.threejs.org/t/realistic-sun-with-noise-and-rays/87759
 * (noise cubemap + sphere + rim glow + rays + flares)
 */
export function Sun({
  position,
  size,
  color,
  intensity,
  flowSpeed = 1,
  sunRef,
  onReady,
}: SunProps) {
  const localRef = useRef<Mesh>(null!)
  const coreRef = sunRef ?? localRef
  const group = useRef<Group>(null!)
  const { gl } = useThree()

  const hot = useMemo(() => new Color(color), [color])

  // --- Perlin cubemap bake ---
  const { cubeRT, cubeCam, perlinScene, perlinMat } = useMemo(() => {
    const cubeRT = new WebGLCubeRenderTarget(256, {
      format: RGBAFormat,
      type: UnsignedByteType,
      generateMipmaps: false,
    })
    const cubeCam = new CubeCamera(0.1, 100, cubeRT)
    const perlinScene = new Scene()
    const perlinMat = new ShaderMaterial({
      vertexShader: perlinVS,
      fragmentShader: perlinFS,
      depthWrite: false,
      side: BackSide,
      uniforms: {
        uTime: { value: 0 },
        uSpatialFrequency: { value: 6 },
        uTemporalFrequency: { value: 0.1 },
        uH: { value: 1 },
        uContrast: { value: 0.25 },
        uFlatten: { value: 0.72 },
      },
    })
    const box = new Mesh(new BoxGeometry(2, 2, 2), perlinMat)
    perlinScene.add(box)
    return { cubeRT, cubeCam, perlinScene, perlinMat }
  }, [])

  const sunRadius = size * 0.993

  const sunMat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: sunSphereVS,
        fragmentShader: sunSphereFS,
        transparent: true,
        premultipliedAlpha: true,
        blending: NormalBlending,
        depthWrite: true,
        toneMapped: false,
        uniforms: {
          uTime: { value: 0 },
          uPerlinCube: { value: cubeRT.texture },
          uFresnelPower: { value: 1.0 },
          uFresnelInfluence: { value: 0.8 },
          uTint: { value: 0.2 },
          uBase: { value: 4.0 },
          uBrightnessOffset: { value: 1.0 },
          uBrightness: { value: 0.75 },
          uVisibility: { value: 1 },
          uDirection: { value: 1 },
          uLightView: { value: _lightDir.clone() },
        },
      }),
    [cubeRT],
  )

  const glowGeo = useMemo(() => createGlowGeometry(sunRadius, 96), [sunRadius])
  const glowMat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: glowVS,
        fragmentShader: glowFS,
        transparent: true,
        premultipliedAlpha: true,
        depthWrite: false,
        // Must depth-test — false draws the halo over the ship when looking at the sun
        depthTest: true,
        blending: NormalBlending,
        side: DoubleSide,
        toneMapped: false,
        uniforms: {
          uRadius: { value: 0.55 },
          uTint: { value: 0.4 },
          uBrightness: { value: 1.15 },
          uFalloffColor: { value: 0.55 },
          uVisibility: { value: 1 },
          uDirection: { value: 1 },
          uLightView: { value: _lightDir.clone() },
        },
      }),
    [],
  )

  const raysGeo = useMemo(
    () => createSunRaysGeometry(sunRadius, 512, 8),
    [sunRadius],
  )
  const raysMat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: sunRaysVS,
        fragmentShader: sunRaysFS,
        transparent: true,
        premultipliedAlpha: true,
        depthWrite: false,
        depthTest: true,
        blending: AdditiveBlending,
        side: DoubleSide,
        toneMapped: false,
        uniforms: {
          uTime: { value: 0 },
          uVisibility: { value: 1 },
          uDirection: { value: 1 },
          uLightView: { value: _lightDir.clone() },
          uWidth: { value: 0.035 },
          uLength: { value: 0.5 },
          uOpacity: { value: 0.04 },
          uNoiseFrequency: { value: 8.0 },
          uNoiseAmplitude: { value: 0.4 },
          uAlphaBlended: { value: 0.3 },
          uHueSpread: { value: 0.2 },
          uHue: { value: 0.2 },
        },
      }),
    [],
  )

  const flaresGeo = useMemo(
    () => createSunFlaresGeometry(sunRadius, 768, 12),
    [sunRadius],
  )
  const flaresMat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: sunFlaresVS,
        fragmentShader: sunFlaresFS,
        transparent: true,
        premultipliedAlpha: true,
        depthWrite: false,
        depthTest: true,
        blending: NormalBlending,
        side: DoubleSide,
        toneMapped: false,
        uniforms: {
          uTime: { value: 0 },
          uVisibility: { value: 1 },
          uDirection: { value: 1 },
          uLightView: { value: _lightDir.clone() },
          uWidth: { value: 0.006 },
          uAmp: { value: 0.5 },
          uOpacity: { value: 0.35 },
          uAlphaBlended: { value: 0.65 },
          uHueSpread: { value: 0.16 },
          uHue: { value: 0.0 },
          uNoiseFrequency: { value: 4.0 },
          uNoiseAmplitude: { value: 0.2 },
        },
      }),
    [],
  )

  const sphereGeo = useMemo(() => new SphereGeometry(size, 64, 64), [size])

  useEffect(() => {
    return () => {
      sunMat.dispose()
      glowMat.dispose()
      raysMat.dispose()
      flaresMat.dispose()
      perlinMat.dispose()
      cubeRT.dispose()
      sphereGeo.dispose()
      glowGeo.dispose()
      raysGeo.dispose()
      flaresGeo.dispose()
    }
  }, [
    sunMat,
    glowMat,
    raysMat,
    flaresMat,
    perlinMat,
    cubeRT,
    sphereGeo,
    glowGeo,
    raysGeo,
    flaresGeo,
  ])

  useEffect(() => {
    onReady?.(coreRef.current)
    return () => onReady?.(null)
  }, [onReady, coreRef])

  // Warm tint from sunColor → shift hue slightly via uHue on rays
  useEffect(() => {
    const hue = hot.getHSL({ h: 0, s: 0, l: 0 }).h
    raysMat.uniforms.uHue.value = hue * 0.35 + 0.12
    flaresMat.uniforms.uHue.value = hue * 0.2
  }, [hot, raysMat, flaresMat])

  const cubemapFrame = useRef(0)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * flowSpeed

    // Cubemap bake is 6 extra passes — throttle to ease GPU TDR / context loss
    cubemapFrame.current += 1
    if (cubemapFrame.current % 3 === 0) {
      perlinMat.uniforms.uTime.value = t * 0.1
      cubeCam.update(gl, perlinScene)
    }

    // Glow/rays/flares use Three's built-in view/projection at draw time,
    // so they stay locked to the sphere when the chase camera moves.
    sunMat.uniforms.uTime.value = t * 0.15
    sunMat.uniforms.uPerlinCube.value = cubeRT.texture
    raysMat.uniforms.uTime.value = t
    flaresMat.uniforms.uTime.value = t
  })

  return (
    <group ref={group} position={position}>
      <mesh
        ref={coreRef}
        geometry={sphereGeo}
        material={sunMat}
        renderOrder={0}
      />
      <mesh
        geometry={flaresGeo}
        material={flaresMat}
        frustumCulled={false}
        renderOrder={1}
      />
      <mesh
        geometry={glowGeo}
        material={glowMat}
        frustumCulled={false}
        renderOrder={2}
      />
      <mesh
        geometry={raysGeo}
        material={raysMat}
        frustumCulled={false}
        renderOrder={3}
      />
      <pointLight
        color={hot}
        intensity={intensity * 1.6}
        distance={180}
        decay={2}
      />
    </group>
  )
}
