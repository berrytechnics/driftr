import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  MathUtils,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  Spherical,
  Vector3,
  type Group,
} from 'three'

const noiseGLSL = /* glsl */ `
vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
  + i.y + vec4(0.0, i1.y, i2.y, 1.0))
  + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

float fbm(vec3 p) {
  float f = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    f += a * snoise(p);
    p = p * 2.02 + 17.3;
    a *= 0.5;
  }
  return f;
}
`

const shellVS = /* glsl */ `
varying vec3 vDir;

void main() {
  vDir = normalize(position);
  // Camera-anchored group with identity rotation — view rotation only.
  vec3 viewPosition = mat3(viewMatrix) * position;
  gl_Position = projectionMatrix * vec4(viewPosition, 1.0);
  gl_Position.z = gl_Position.w;
}
`

const shellFS = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform vec3 uColorQ0;
uniform vec3 uColorQ1;
uniform vec3 uColorQ2;
uniform vec3 uColorQ3;
uniform float uQuadrantMode;
varying vec3 vDir;

${noiseGLSL}

// Lerp keeping peak channel roughly on the mix curve (avoids pale/white seams).
vec3 blendHue(vec3 a, vec3 b, float t) {
  vec3 m = mix(a, b, t);
  float la = max(a.r, max(a.g, a.b));
  float lb = max(b.r, max(b.g, b.b));
  float lm = max(m.r, max(m.g, m.b));
  float target = mix(la, lb, t);
  if (lm > 1e-4) m *= target / lm;
  return m;
}

vec3 quadrantColor(vec3 dir) {
  float az = atan(dir.z, dir.x); // -PI..PI
  float u = az * (0.5 / 3.14159265) + 0.5; // 0..1
  float t = u * 4.0;
  float seg = floor(t);
  float f = smoothstep(0.0, 1.0, fract(t));
  vec3 c0 = uColorQ0;
  vec3 c1 = uColorQ1;
  vec3 c2 = uColorQ2;
  vec3 c3 = uColorQ3;
  vec3 col;
  if (seg < 1.0) col = blendHue(c0, c1, f);
  else if (seg < 2.0) col = blendHue(c1, c2, f);
  else if (seg < 3.0) col = blendHue(c2, c3, f);
  else col = blendHue(c3, c0, f);
  // Soft polar tint — slightly cooler toward the axes.
  float polar = smoothstep(0.2, 0.95, abs(dir.y));
  col = blendHue(col, c3, polar * 0.28);
  return col;
}

void main() {
  vec3 dir = normalize(vDir);
  float n1 = fbm(dir * 2.4 + vec3(0.0, uTime * 0.012, 0.0));
  float n2 = fbm(dir * 4.1 - vec3(uTime * 0.008, 0.0, 1.7));
  float veil = smoothstep(-0.15, 0.55, n1 * 0.65 + n2 * 0.45);
  float lanes = smoothstep(0.1, 0.7, n2 * 0.8 + n1 * 0.3);

  // Prefer a soft equatorial band so the sky has structure, not a blob.
  float band = 1.0 - smoothstep(0.15, 0.85, abs(dir.y));
  float mask = veil * mix(0.35, 1.0, band) * mix(0.55, 1.0, lanes);

  vec3 col;
  if (uQuadrantMode > 0.5) {
    col = quadrantColor(dir);
    // Subtle filament brightening without inventing a new hue.
    col *= 0.88 + 0.22 * lanes;
  } else {
    col = mix(uColorA, uColorB, clamp(n1 * 0.5 + 0.5, 0.0, 1.0));
    col = mix(col, uColorC, clamp(lanes * 0.55, 0.0, 1.0));
  }

  float alpha = mask * uIntensity;
  if (alpha < 0.004) discard;
  // Cap HDR peaks — additive shells + bloom turn partial-coverage edges
  // into intermittent white sparkles while the camera moves.
  vec3 lit = min(col * alpha, vec3(1.15));
  gl_FragColor = vec4(lit, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const wispVS = /* glsl */ `
uniform float uTime;
attribute vec3 aOffset;
attribute float aScale;
attribute float aSeed;
attribute vec3 aColor;
varying vec2 vUv;
varying vec3 vColor;
varying float vSeed;

void main() {
  vUv = uv;
  vColor = aColor;
  vSeed = aSeed;

  float drift = uTime * (0.04 + fract(aSeed * 7.13) * 0.06);
  vec3 worldPos = aOffset;
  worldPos.x += sin(drift + aSeed * 6.28) * (4.0 + aScale * 0.04);
  worldPos.y += cos(drift * 0.7 + aSeed * 3.1) * (2.5 + aScale * 0.02);
  worldPos.z += sin(drift * 0.55 + aSeed * 4.7) * (4.0 + aScale * 0.04);

  // Face the camera but lock "up" to world +Y so banking / turning doesn't
  // spin the soft cloud shapes (full view-matrix billboards do).
  vec3 toCam = cameraPosition - worldPos;
  vec3 worldUp = vec3(0.0, 1.0, 0.0);
  vec3 camRight = cross(worldUp, toCam);
  float rightLen = length(camRight);
  if (rightLen < 1e-4) {
    camRight = vec3(1.0, 0.0, 0.0);
  } else {
    camRight *= 1.0 / rightLen;
  }
  vec3 camUp = normalize(cross(toCam, camRight));
  vec3 pos = worldPos + (camRight * position.x + camUp * position.y) * aScale;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}
`

const wispFS = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
varying vec2 vUv;
varying vec3 vColor;
varying float vSeed;

${noiseGLSL}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;

  float soft = 1.0 - smoothstep(0.18, 1.0, r);
  float n = fbm(vec3(p * 1.8, vSeed * 5.0 + uTime * 0.05));
  float wispy = soft * smoothstep(-0.25, 0.55, n);
  float pulse = 0.82 + 0.18 * sin(uTime * 0.35 + vSeed * 12.0);
  float alpha = wispy * uOpacity * pulse;
  // Soft kill — hard discard at the noise fringe strobes under bloom.
  if (alpha < 0.004) discard;
  alpha = smoothstep(0.004, 0.03, alpha) * alpha;
  vec3 lit = min(vColor * alpha, vec3(1.1));
  gl_FragColor = vec4(lit, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

function mulberry32(seed: number) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

const DEFAULT_ORIGIN: [number, number, number] = [0, 0, 0]

/** Classic SNR cardinals — magenta, cyan, gold, violet. */
export const DEFAULT_QUADRANT_COLORS: [string, string, string, string] = [
  '#ff2f9a',
  '#12d4e8',
  '#e89a12',
  '#8a3dff',
]

function blendHueColor(a: Color, b: Color, t: number, out: Color) {
  out.copy(a).lerp(b, t)
  const la = Math.max(a.r, a.g, a.b)
  const lb = Math.max(b.r, b.g, b.b)
  const lm = Math.max(out.r, out.g, out.b)
  const target = la + (lb - la) * t
  if (lm > 1e-4) out.multiplyScalar(target / lm)
  return out
}

/** Azimuthal quadrant blend around +Y (matches shell shader). */
function quadrantColorAt(
  x: number,
  z: number,
  y: number,
  q: [Color, Color, Color, Color],
  out: Color,
) {
  const az = Math.atan2(z, x)
  const u = az * (0.5 / Math.PI) + 0.5
  const t = ((u % 1) + 1) % 1 * 4
  const seg = Math.floor(t)
  const f = MathUtils.smoothstep(t - seg, 0, 1)
  if (seg < 1) blendHueColor(q[0], q[1], f, out)
  else if (seg < 2) blendHueColor(q[1], q[2], f, out)
  else if (seg < 3) blendHueColor(q[2], q[3], f, out)
  else blendHueColor(q[3], q[0], f, out)
  const polar = MathUtils.smoothstep(0.2, 0.95, Math.abs(y))
  if (polar > 0) blendHueColor(out, q[3], polar * 0.28, out)
  return out
}

export type NebulaProps = {
  /** Distant shell radius (camera-relative). */
  shellRadius?: number
  shellIntensity?: number
  colorA?: string
  colorB?: string
  colorC?: string
  /**
   * Four azimuthal colors (N/E/S/W-ish) blended around the system.
   * When set, replaces the A/B/C noise mix on shell and wisps.
   */
  quadrantColors?: [string, string, string, string]
  /** World-space center for near wisps (usually the sun). */
  origin?: [number, number, number]
  /** Near additive wisps you can fly through. */
  wispCount?: number
  wispInner?: number
  wispOuter?: number
  wispMinScale?: number
  wispMaxScale?: number
  wispOpacity?: number
  /**
   * World distance from `origin` where intensity stays full.
   * Past this (toward `fadeEnd`) shell + wisps ease to zero.
   */
  fadeStart?: number
  /** Distance at which the veil is fully gone. Requires `fadeStart`. */
  fadeEnd?: number
  seed?: number
  paused?: boolean
  /**
   * Draw order for the camera-anchored shell. Distinct values matter when
   * stacking multiple Nebulas — identical orders can reorder frame-to-frame.
   */
  shellRenderOrder?: number
  /**
   * Draw order for world wisps. Instanced positions live in shader attrs
   * (mesh sits at origin), so Three's transparent sort can't stabilize
   * stacked layers — pin order explicitly instead.
   */
  wispRenderOrder?: number
}

/**
 * Soft nebulous gas — a distant camera-anchored veil plus near world-space wisps.
 */
export function Nebula({
  shellRadius = 1250,
  shellIntensity = 0.42,
  colorA = '#3a2a78',
  colorB = '#1e3a68',
  colorC = '#6a3858',
  quadrantColors,
  origin = DEFAULT_ORIGIN,
  wispCount = 52,
  wispInner = 130,
  wispOuter = 680,
  wispMinScale = 48,
  wispMaxScale = 140,
  wispOpacity = 0.22,
  fadeStart,
  fadeEnd,
  seed = 17,
  paused = false,
  shellRenderOrder = -1100,
  wispRenderOrder = -50,
}: NebulaProps) {
  const shellGroup = useRef<Group>(null!)
  const wispMesh = useRef<InstancedMesh>(null!)
  const pauseRef = useRef(paused)
  pauseRef.current = paused
  const timeRef = useRef(0)
  const intensityRef = useRef(shellIntensity)
  intensityRef.current = shellIntensity
  const opacityRef = useRef(wispOpacity)
  opacityRef.current = wispOpacity
  const fadeStartRef = useRef(fadeStart)
  fadeStartRef.current = fadeStart
  const fadeEndRef = useRef(fadeEnd)
  fadeEndRef.current = fadeEnd
  const originRef = useRef(new Vector3(origin[0], origin[1], origin[2]))
  originRef.current.set(origin[0], origin[1], origin[2])

  const useQuadrants = !!quadrantColors

  const shellGeo = useMemo(
    () => new SphereGeometry(shellRadius, 48, 32),
    [shellRadius],
  )

  const shellMat = useMemo(() => {
    const q = quadrantColors ?? DEFAULT_QUADRANT_COLORS
    return new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: shellIntensity },
        uColorA: { value: new Color(colorA) },
        uColorB: { value: new Color(colorB) },
        uColorC: { value: new Color(colorC) },
        uColorQ0: { value: new Color(q[0]) },
        uColorQ1: { value: new Color(q[1]) },
        uColorQ2: { value: new Color(q[2]) },
        uColorQ3: { value: new Color(q[3]) },
        uQuadrantMode: { value: useQuadrants ? 1 : 0 },
      },
      vertexShader: shellVS,
      fragmentShader: shellFS,
      blending: AdditiveBlending,
      depthWrite: false,
      // Far-plane shell (gl_Position.z = w) must depth-test so planets/
      // moons that already wrote the depth buffer occlude the veil.
      depthTest: true,
      transparent: true,
      side: DoubleSide,
    })
  }, [colorA, colorB, colorC, shellIntensity, useQuadrants, quadrantColors])

  const hasWisps = wispCount > 0

  const wispGeo = useMemo(() => {
    if (!hasWisps) return null
    const geo = new PlaneGeometry(1, 1, 1, 1)
    const rand = mulberry32(seed)
    const offsets = new Float32Array(wispCount * 3)
    const scales = new Float32Array(wispCount)
    const seeds = new Float32Array(wispCount)
    const colors = new Float32Array(wispCount * 3)
    const spherical = new Spherical()
    const vertex = new Vector3()
    const cA = new Color(colorA)
    const cB = new Color(colorB)
    const cC = new Color(colorC)
    const mix = new Color()
    const qTuple = quadrantColors ?? DEFAULT_QUADRANT_COLORS
    const qColors: [Color, Color, Color, Color] = [
      new Color(qTuple[0]),
      new Color(qTuple[1]),
      new Color(qTuple[2]),
      new Color(qTuple[3]),
    ]

    for (let i = 0; i < wispCount; i++) {
      const t = rand()
      const r = wispInner + (wispOuter - wispInner) * Math.pow(t, 0.72)
      // Slight polar bias — denser near the ecliptic with a few high drapes.
      const polar = Math.acos(1 - rand() * 2) * (0.55 + rand() * 0.55)
      spherical.set(r, polar, rand() * Math.PI * 2)
      vertex.setFromSpherical(spherical)
      const wx = origin[0] + vertex.x
      const wy = origin[1] + vertex.y * 0.55
      const wz = origin[2] + vertex.z
      offsets[i * 3] = wx
      offsets[i * 3 + 1] = wy
      offsets[i * 3 + 2] = wz

      scales[i] = wispMinScale + rand() * (wispMaxScale - wispMinScale)
      seeds[i] = rand()

      if (useQuadrants) {
        quadrantColorAt(
          wx - origin[0],
          wz - origin[2],
          (wy - origin[1]) / Math.max(r, 1e-3),
          qColors,
          mix,
        )
        mix.offsetHSL(0, (rand() - 0.5) * 0.04, (rand() - 0.5) * 0.03)
      } else {
        const pick = rand()
        if (pick < 0.4) mix.copy(cA)
        else if (pick < 0.75) mix.copy(cB)
        else mix.copy(cC)
        mix.offsetHSL(0, (rand() - 0.5) * 0.08, (rand() - 0.5) * 0.06)
      }
      colors[i * 3] = mix.r
      colors[i * 3 + 1] = mix.g
      colors[i * 3 + 2] = mix.b
    }

    geo.setAttribute('aOffset', new InstancedBufferAttribute(offsets, 3))
    geo.setAttribute('aScale', new InstancedBufferAttribute(scales, 1))
    geo.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 1))
    geo.setAttribute('aColor', new InstancedBufferAttribute(colors, 3))
    return geo
  }, [
    colorA,
    colorB,
    colorC,
    hasWisps,
    origin,
    quadrantColors,
    seed,
    useQuadrants,
    wispCount,
    wispInner,
    wispMaxScale,
    wispMinScale,
    wispOuter,
  ])

  const wispMat = useMemo(() => {
    if (!hasWisps) return null
    return new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: wispOpacity },
      },
      vertexShader: wispVS,
      fragmentShader: wispFS,
      blending: AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      transparent: true,
      side: DoubleSide,
    })
  }, [hasWisps, wispOpacity])

  // Dummy instance matrices — transforms live in shader attributes.
  useLayoutEffect(() => {
    const mesh = wispMesh.current
    if (!mesh || !hasWisps) return
    const dummy = new Object3D()
    for (let i = 0; i < wispCount; i++) {
      dummy.position.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.frustumCulled = false
  }, [hasWisps, wispCount, wispGeo])

  useLayoutEffect(
    () => () => {
      shellGeo.dispose()
    },
    [shellGeo],
  )
  useLayoutEffect(
    () => () => {
      shellMat.dispose()
    },
    [shellMat],
  )
  useLayoutEffect(
    () => () => {
      wispGeo?.dispose()
    },
    [wispGeo],
  )
  useLayoutEffect(
    () => () => {
      wispMat?.dispose()
    },
    [wispMat],
  )

  useFrame(({ camera, clock }) => {
    shellGroup.current.position.copy(camera.position)
    shellGroup.current.quaternion.identity()

    if (!pauseRef.current) {
      timeRef.current = clock.elapsedTime
    }
    const t = timeRef.current
    shellMat.uniforms.uTime.value = t
    if (wispMat) wispMat.uniforms.uTime.value = t

    const start = fadeStartRef.current
    const end = fadeEndRef.current
    let fade = 1
    if (start != null && end != null && end > start) {
      const dist = camera.position.distanceTo(originRef.current)
      fade = 1 - MathUtils.smoothstep(dist, start, end)
    }
    shellMat.uniforms.uIntensity.value = intensityRef.current * fade
    if (wispMat) wispMat.uniforms.uOpacity.value = opacityRef.current * fade
  })

  return (
    <>
      <group ref={shellGroup} renderOrder={shellRenderOrder}>
        <mesh
          geometry={shellGeo}
          material={shellMat}
          frustumCulled={false}
          renderOrder={shellRenderOrder}
        />
      </group>
      {hasWisps && wispGeo && wispMat ? (
        <instancedMesh
          ref={wispMesh}
          args={[wispGeo, wispMat, wispCount]}
          frustumCulled={false}
          renderOrder={wispRenderOrder}
        />
      ) : null}
    </>
  )
}
