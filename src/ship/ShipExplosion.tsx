import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  Points,
  ShaderMaterial,
  Vector3,
  type Mesh,
  type MeshBasicMaterial,
} from 'three'

const EMBER_COUNT = 72
const SPARK_COUNT = 110
export const EXPLOSION_LIFETIME = 1.05
/** Effects were authored for ship scale 6. */
const REFERENCE_SHIP_SCALE = 6

type ShipExplosionProps = {
  position: Vector3
  /** Ship scale — burst size tracks the craft */
  scale?: number
  onDone: () => void
}

let softGlowTexture: CanvasTexture | null = null

/** Soft radial sprite so points read as glowing orbs, not squares. */
function getSoftGlowTexture() {
  if (softGlowTexture) return softGlowTexture
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(
    size * 0.5,
    size * 0.5,
    0,
    size * 0.5,
    size * 0.5,
    size * 0.5,
  )
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.18, 'rgba(255,255,255,0.9)')
  g.addColorStop(0.42, 'rgba(255,255,255,0.35)')
  g.addColorStop(0.75, 'rgba(255,255,255,0.06)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  softGlowTexture = new CanvasTexture(canvas)
  softGlowTexture.needsUpdate = true
  return softGlowTexture
}

const particleVertex = /* glsl */ `
attribute float aSize;
attribute float aSeed;
uniform float uTime;
uniform float uScale;
uniform float uOpacity;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vColor = color;
  float life = clamp(uTime, 0.0, 1.0);
  // Persist a hair longer than the overall opacity ramp
  vAlpha = uOpacity * (1.0 - smoothstep(0.55, 1.0, life + aSeed * 0.25));

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  // Match PointsMaterial sizeAttenuation: aSize is roughly world units
  float atten = 280.0 / max(-mvPosition.z, 0.5);
  // Soft bloom: particles swell early, then shrink as they cool
  float swell = mix(1.25, 0.55, life);
  gl_PointSize = max(aSize * uScale * swell * atten, 1.25);
  gl_Position = projectionMatrix * mvPosition;
}
`

const particleFragment = /* glsl */ `
uniform sampler2D uMap;
varying vec3 vColor;
varying float vAlpha;

void main() {
  float glow = texture2D(uMap, gl_PointCoord).a;
  if (glow < 0.012) discard;
  // Hotter cores read as volumetric rather than flat discs
  vec3 col = vColor * (0.55 + 0.7 * glow);
  gl_FragColor = vec4(col, glow * vAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

type BurstData = {
  positions: Float32Array
  velocities: Float32Array
  colors: Float32Array
  sizes: Float32Array
  seeds: Float32Array
  drag: Float32Array
}

function createBurst(
  count: number,
  fxScale: number,
  speedMin: number,
  speedMax: number,
  sizeMin: number,
  sizeMax: number,
  hotHex: string,
  coolHex: string,
  dragMin: number,
  dragMax: number,
): BurstData {
  const positions = new Float32Array(count * 3)
  const velocities = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const seeds = new Float32Array(count)
  const drag = new Float32Array(count)
  const hot = new Color(hotHex)
  const cool = new Color(coolHex)
  const tmp = new Color()

  for (let i = 0; i < count; i++) {
    const i3 = i * 3
    // Seed near origin with a little volume so the flash isn't a needlepoint
    const jitter = (0.15 + Math.random() * 0.55) * fxScale
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const sx = Math.sin(phi) * Math.cos(theta)
    const sy = Math.sin(phi) * Math.sin(theta)
    const sz = Math.cos(phi)
    positions[i3] = sx * jitter
    positions[i3 + 1] = sy * jitter
    positions[i3 + 2] = sz * jitter

    const speed = (speedMin + Math.random() * (speedMax - speedMin)) * fxScale
    velocities[i3] = sx * speed
    velocities[i3 + 1] = sy * speed
    velocities[i3 + 2] = sz * speed

    tmp.copy(hot).lerp(cool, Math.random())
    colors[i3] = tmp.r
    colors[i3 + 1] = tmp.g
    colors[i3 + 2] = tmp.b

    sizes[i] = sizeMin + Math.random() * (sizeMax - sizeMin)
    seeds[i] = Math.random()
    drag[i] = dragMin + Math.random() * (dragMax - dragMin)
  }

  return { positions, velocities, colors, sizes, seeds, drag }
}

function buildGeometry(data: BurstData) {
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(data.positions, 3))
  geo.setAttribute('color', new BufferAttribute(data.colors, 3))
  geo.setAttribute('aSize', new BufferAttribute(data.sizes, 1))
  geo.setAttribute('aSeed', new BufferAttribute(data.seeds, 1))
  return geo
}

function makeParticleMaterial() {
  return new ShaderMaterial({
    uniforms: {
      uMap: { value: getSoftGlowTexture() },
      uTime: { value: 0 },
      uScale: { value: 1 },
      uOpacity: { value: 1 },
    },
    vertexShader: particleVertex,
    fragmentShader: particleFragment,
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
    vertexColors: true,
    toneMapped: false,
  })
}

/** Short-lived soft particle + flash burst at a world position. */
export function ShipExplosion({
  position,
  scale = 1,
  onDone,
}: ShipExplosionProps) {
  const root = useRef<Group>(null!)
  const embers = useRef<Points>(null!)
  const sparks = useRef<Points>(null!)
  const coreMesh = useRef<Mesh>(null!)
  const shellMesh = useRef<Mesh>(null!)
  const coreMat = useRef<MeshBasicMaterial>(null!)
  const shellMat = useRef<MeshBasicMaterial>(null!)
  const age = useRef(0)
  const done = useRef(false)
  const fxScale = Math.max(scale / REFERENCE_SHIP_SCALE, 0.04)

  const { emberData, sparkData, emberGeo, sparkGeo, emberMat, sparkMat } =
    useMemo(() => {
      const emberData = createBurst(
        EMBER_COUNT,
        fxScale,
        4,
        16,
        0.9,
        2.6,
        '#fff4d0',
        '#ff5a18',
        1.1,
        2.4,
      )
      const sparkData = createBurst(
        SPARK_COUNT,
        fxScale,
        14,
        42,
        0.18,
        0.7,
        '#ffffff',
        '#ffb048',
        1.8,
        3.6,
      )
      return {
        emberData,
        sparkData,
        emberGeo: buildGeometry(emberData),
        sparkGeo: buildGeometry(sparkData),
        emberMat: makeParticleMaterial(),
        sparkMat: makeParticleMaterial(),
      }
    }, [fxScale])

  useLayoutEffect(() => {
    const g = root.current
    if (!g) return
    g.position.copy(position)
  }, [position])

  useLayoutEffect(
    () => () => {
      emberGeo.dispose()
      sparkGeo.dispose()
      emberMat.dispose()
      sparkMat.dispose()
    },
    [emberGeo, sparkGeo, emberMat, sparkMat],
  )

  useFrame((_, delta) => {
    if (done.current) return
    const dt = Math.min(delta, 0.05)
    age.current += dt
    const t = age.current / EXPLOSION_LIFETIME

    const integrate = (points: Points, data: BurstData, count: number) => {
      const attr = points.geometry.getAttribute('position') as BufferAttribute
      const arr = attr.array as Float32Array
      for (let i = 0; i < count; i++) {
        const i3 = i * 3
        const damp = Math.max(0, 1 - data.drag[i] * dt)
        data.velocities[i3] *= damp
        data.velocities[i3 + 1] *= damp
        data.velocities[i3 + 2] *= damp
        arr[i3] += data.velocities[i3] * dt
        arr[i3 + 1] += data.velocities[i3 + 1] * dt
        arr[i3 + 2] += data.velocities[i3 + 2] * dt
      }
      attr.needsUpdate = true
    }

    integrate(embers.current, emberData, EMBER_COUNT)
    integrate(sparks.current, sparkData, SPARK_COUNT)

    // Ease out overall fade — linger on the cooler embers
    const fade = Math.max(0, 1 - t * t)
    emberMat.uniforms.uTime.value = t
    emberMat.uniforms.uOpacity.value = fade
    emberMat.uniforms.uScale.value = fxScale
    sparkMat.uniforms.uTime.value = t
    sparkMat.uniforms.uOpacity.value = fade * (1 - t * 0.55)
    sparkMat.uniforms.uScale.value = fxScale

    // Quick white-hot fireball that balloons then vanishes
    const flashT = Math.min(1, age.current / (EXPLOSION_LIFETIME * 0.42))
    const flashExpand = (0.35 + flashT * flashT * 3.8) * fxScale
    const flashFade = Math.max(0, 1 - flashT)
    if (coreMat.current) {
      coreMat.current.opacity = flashFade * flashFade * 0.95
    }
    if (shellMat.current) {
      shellMat.current.opacity = flashFade * 0.4
    }
    coreMesh.current.scale.setScalar(flashExpand)
    shellMesh.current.scale.setScalar(flashExpand * 1.65)

    if (age.current >= EXPLOSION_LIFETIME) {
      done.current = true
      onDone()
    }
  })

  return (
    <group ref={root}>
      <mesh ref={coreMesh}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial
          ref={coreMat}
          color="#fff2c4"
          toneMapped={false}
          transparent
          opacity={0.95}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
      <mesh ref={shellMesh}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial
          ref={shellMat}
          color="#ff6a28"
          toneMapped={false}
          transparent
          opacity={0.4}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
      <points
        ref={embers}
        geometry={emberGeo}
        material={emberMat}
        frustumCulled={false}
      />
      <points
        ref={sparks}
        geometry={sparkGeo}
        material={sparkMat}
        frustumCulled={false}
      />
    </group>
  )
}
