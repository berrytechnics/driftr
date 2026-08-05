import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  ShaderMaterial,
  Spherical,
  Vector3,
  type Group,
} from 'three'

type StarfieldProps = {
  count: number
  depth: number
  radius: number
  factor: number
  saturation: number
  fade: boolean
  speed: number
}

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uTwinkle;
attribute float aSize;
varying vec3 vColor;
varying float vTwinkle;

void main() {
  vColor = color;
  // Group sits at the camera with identity rotation, so 'position' is already a
  // camera-relative world-axis offset. Transform with view rotation ONLY —
  // skipping modelView translation cancel that float-jitters at high speed.
  vec3 viewPosition = mat3(viewMatrix) * position;
  vec4 mvPosition = vec4(viewPosition, 1.0);

  float z = max(length(position), 1.0);
  float atten = clamp(90.0 / z, 0.45, 1.4);
  float pulse = 1.0 + uTwinkle * 0.12 * sin(uTime + aSize * 17.0);
  // Steady size (opacity still twinkles) — size pulse read as closer/further
  gl_PointSize = max(aSize * atten, 1.25);
  gl_Position = projectionMatrix * mvPosition;
  gl_Position.z = gl_Position.w;
  vTwinkle = pulse;
}
`

const fragmentShader = /* glsl */ `
uniform float uFade;
varying vec3 vColor;
varying float vTwinkle;

void main() {
  float opacity = 1.0;
  if (uFade > 0.5) {
    float d = distance(gl_PointCoord, vec2(0.5));
    opacity = 1.0 / (1.0 + exp(16.0 * (d - 0.25)));
  } else {
    float d = distance(gl_PointCoord, vec2(0.5));
    if (d > 0.5) discard;
    opacity = 1.0 - smoothstep(0.35, 0.5, d);
  }
  opacity *= mix(0.85, 1.0, vTwinkle);
  gl_FragColor = vec4(vColor, opacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

function createStarGeometry(
  count: number,
  radius: number,
  depth: number,
  factor: number,
  saturation: number,
) {
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const color = new Color()
  const spherical = new Spherical()
  const vertex = new Vector3()

  let r = radius + depth
  const increment = depth / count

  for (let i = 0; i < count; i++) {
    r -= increment * Math.random()
    spherical.set(r, Math.acos(1 - Math.random() * 2), Math.random() * Math.PI * 2)
    vertex.setFromSpherical(spherical)
    positions[i * 3] = vertex.x
    positions[i * 3 + 1] = vertex.y
    positions[i * 3 + 2] = vertex.z

    color.setHSL(i / count, saturation, 0.9)
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b

    sizes[i] = (0.5 + 0.5 * Math.random()) * factor
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  geometry.setAttribute('aSize', new BufferAttribute(sizes, 1))
  return geometry
}

/** Stars follow the camera so deep space stays filled while flying. */
export function Starfield({
  count,
  depth,
  radius,
  factor,
  saturation,
  fade,
  speed,
}: StarfieldProps) {
  const group = useRef<Group>(null!)

  const geometry = useMemo(
    () => createStarGeometry(count, radius, depth, factor, saturation),
    [count, depth, factor, radius, saturation],
  )

  const starMaterial = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uTwinkle: { value: speed },
          uFade: { value: fade ? 1 : 0 },
        },
        vertexShader,
        fragmentShader,
        blending: AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        transparent: true,
        vertexColors: true,
      }),
    [],
  )

  useLayoutEffect(() => {
    starMaterial.uniforms.uFade.value = fade ? 1 : 0
    starMaterial.uniforms.uTwinkle.value = speed
  }, [starMaterial, fade, speed])

  useLayoutEffect(() => () => {
    geometry.dispose()
  }, [geometry])

  useLayoutEffect(() => () => {
    starMaterial.dispose()
  }, [starMaterial])

  useFrame(({ camera, clock }) => {
    group.current.position.copy(camera.position)
    group.current.quaternion.identity()
    starMaterial.uniforms.uTime.value = clock.elapsedTime * speed
  })

  return (
    <group ref={group} renderOrder={-1000}>
      <points
        geometry={geometry}
        material={starMaterial}
        frustumCulled={false}
        renderOrder={-1000}
      />
    </group>
  )
}
