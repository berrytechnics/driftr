import {
  MeshStandardMaterial,
  type IUniform,
  type WebGLProgramParametersWithUniforms,
} from 'three'

export type AsteroidRockUniforms = {
  uRockFreq: IUniform<number>
  uRockBump: IUniform<number>
  uRockContrast: IUniform<number>
}

export type AsteroidTextureParams = {
  rockFreq: number
  rockBump: number
  rockContrast: number
  roughness: number
  metalness: number
}

/** Tuned defaults from playtest Leva session. */
export const DEFAULT_ASTEROID_TEXTURE: AsteroidTextureParams = {
  rockFreq: 4.55,
  rockBump: 1.65,
  rockContrast: 0.3,
  roughness: 0.73,
  metalness: 0.26,
}

/**
 * Fragment-shader rock detail (grit + bump) on top of smooth mesh normals.
 * Uniforms live on material.userData.rockUniforms so Leva can tweak live.
 */
export function createAsteroidMaterial(
  initial: AsteroidTextureParams = DEFAULT_ASTEROID_TEXTURE,
) {
  const material = new MeshStandardMaterial({
    roughness: initial.roughness,
    metalness: initial.metalness,
    envMapIntensity: 0.16,
    flatShading: false,
  })

  const rockUniforms: AsteroidRockUniforms = {
    uRockFreq: { value: initial.rockFreq },
    uRockBump: { value: initial.rockBump },
    uRockContrast: { value: initial.rockContrast },
  }
  material.userData.rockUniforms = rockUniforms

  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uRockFreq = rockUniforms.uRockFreq
    shader.uniforms.uRockBump = rockUniforms.uRockBump
    shader.uniforms.uRockContrast = rockUniforms.uRockContrast

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vRockPos;
        `,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        vRockPos = position;
        `,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vRockPos;
        uniform float uRockFreq;
        uniform float uRockBump;
        uniform float uRockContrast;

        float rockHash(vec3 p) {
          p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }

        float rockNoise(vec3 x) {
          vec3 i = floor(x);
          vec3 f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(
              mix(rockHash(i), rockHash(i + vec3(1.0, 0.0, 0.0)), f.x),
              mix(rockHash(i + vec3(0.0, 1.0, 0.0)), rockHash(i + vec3(1.0, 1.0, 0.0)), f.x),
              f.y
            ),
            mix(
              mix(rockHash(i + vec3(0.0, 0.0, 1.0)), rockHash(i + vec3(1.0, 0.0, 1.0)), f.x),
              mix(rockHash(i + vec3(0.0, 1.0, 1.0)), rockHash(i + vec3(1.0, 1.0, 1.0)), f.x),
              f.y
            ),
            f.z
          );
        }

        float rockFbm(vec3 p) {
          float a = 0.5 * rockNoise(p);
          a += 0.25 * rockNoise(p * 2.13 + 3.1);
          a += 0.125 * rockNoise(p * 4.27 - 1.7);
          a += 0.0625 * rockNoise(p * 8.53 + 5.9);
          a += 0.04 * rockNoise(p * 17.1 - 2.4);
          a += 0.025 * rockNoise(p * 34.0 + 8.3);
          return a;
        }

        float rockRidged(vec3 p) {
          float n = rockFbm(p);
          return 1.0 - abs(n * 2.0 - 1.0);
        }

        float rockHeight(vec3 p) {
          return rockFbm(p) * 0.55 + rockRidged(p * 1.8) * 0.45;
        }
        `,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
        #include <normal_fragment_maps>
        {
          float h = rockHeight(vRockPos * uRockFreq);
          float dHdx = dFdx(h);
          float dHdy = dFdy(h);
          vec3 sigmaX = dFdx(vViewPosition.xyz);
          vec3 sigmaY = dFdy(vViewPosition.xyz);
          vec3 N = normalize(normal);
          vec3 R1 = cross(sigmaY, N);
          vec3 R2 = cross(N, sigmaX);
          float det = dot(sigmaX, R1);
          vec3 grad = sign(det) * (dHdx * R1 + dHdy * R2);
          normal = normalize(N - grad * uRockBump);
        }
        `,
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        #include <map_fragment>
        {
          vec3 rp = vRockPos * uRockFreq;
          float grit = rockFbm(rp);
          float ridges = rockRidged(rp * 2.4);
          float pits = rockRidged(rp * 5.1 + 2.0);
          float shade = mix(1.0 - uRockContrast, 1.0 + uRockContrast * 0.6, grit);
          shade *= mix(0.82, 1.12, ridges);
          shade *= mix(0.9, 1.05, pits);
          vec3 cool = vec3(0.78, 0.84, 0.9);
          vec3 warm = vec3(1.1, 1.02, 0.88);
          diffuseColor.rgb *= mix(cool, warm, saturate(grit * 1.25)) * shade;
        }
        `,
      )
  }

  material.customProgramCacheKey = () => 'asteroid-rock-fbm-v4'
  return material
}

export function applyAsteroidTextureParams(
  material: MeshStandardMaterial,
  params: AsteroidTextureParams,
) {
  const uniforms = material.userData.rockUniforms as
    | AsteroidRockUniforms
    | undefined
  if (uniforms) {
    uniforms.uRockFreq.value = params.rockFreq
    uniforms.uRockBump.value = params.rockBump
    uniforms.uRockContrast.value = params.rockContrast
  }
  material.roughness = params.roughness
  material.metalness = params.metalness
}
