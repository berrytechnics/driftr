import {
  MeshStandardMaterial,
  type IUniform,
  type WebGLProgramParametersWithUniforms,
} from 'three'

export type AsteroidRockUniforms = {
  uRockFreq: IUniform<number>
  uRockBump: IUniform<number>
  uRockContrast: IUniform<number>
  /** Surface emissive for violet/night instance colors (0 = off). */
  uNightSurfaceGlow: IUniform<number>
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
  rockFreq: 5.7,
  rockBump: 2.55,
  rockContrast: 0.45,
  roughness: 0.96,
  metalness: 0.06,
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
    // Keep env reflections tiny — warm lightformers + metalness = sun halo crawl
    envMapIntensity: 0.03,
    flatShading: false,
  })

  const rockUniforms: AsteroidRockUniforms = {
    uRockFreq: { value: initial.rockFreq },
    uRockBump: { value: initial.rockBump },
    uRockContrast: { value: initial.rockContrast },
    uNightSurfaceGlow: { value: 0 },
  }
  material.userData.rockUniforms = rockUniforms

  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uRockFreq = rockUniforms.uRockFreq
    shader.uniforms.uRockBump = rockUniforms.uRockBump
    shader.uniforms.uRockContrast = rockUniforms.uRockContrast
    shader.uniforms.uNightSurfaceGlow = rockUniforms.uNightSurfaceGlow

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vRockPos;
        varying float vRockLod;
        `,
      )
      .replace(
        '#include <project_vertex>',
        /* glsl */ `
        #include <project_vertex>
        {
          // Instance scale → world-ish feature size (unit mesh alone densifies
          // noise on small rocks). Distance LOD kills aliasing far away.
          float instScale = 1.0;
          #ifdef USE_INSTANCING
            instScale = length(vec3(
              instanceMatrix[0][0],
              instanceMatrix[1][0],
              instanceMatrix[2][0]
            ));
          #endif
          vRockPos = position * max(instScale, 0.35);
          float viewDist = length(mvPosition.xyz);
          // 1 close / large on screen → 0 far (derivative noise goes wild)
          vRockLod = smoothstep(140.0, 28.0, viewDist);
        }
        `,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vRockPos;
        varying float vRockLod;
        uniform float uRockFreq;
        uniform float uRockBump;
        uniform float uRockContrast;
        uniform float uNightSurfaceGlow;

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

        // LOD: drop high octaves far away so dFdx/dFdy bump stays stable
        float rockFbm(vec3 p, float lod) {
          float a = 0.5 * rockNoise(p);
          a += 0.25 * rockNoise(p * 2.13 + 3.1);
          if (lod > 0.2) a += 0.125 * rockNoise(p * 4.27 - 1.7) * lod;
          if (lod > 0.45) a += 0.0625 * rockNoise(p * 8.53 + 5.9) * lod;
          if (lod > 0.7) {
            a += 0.04 * rockNoise(p * 17.1 - 2.4) * lod;
            a += 0.025 * rockNoise(p * 34.0 + 8.3) * lod;
          }
          return a;
        }

        float rockRidged(vec3 p, float lod) {
          float n = rockFbm(p, lod);
          return 1.0 - abs(n * 2.0 - 1.0);
        }

        float rockHeight(vec3 p, float lod) {
          return rockFbm(p, lod) * 0.55 + rockRidged(p * 1.8, lod) * 0.45;
        }
        `,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
        #include <normal_fragment_maps>
        {
          float lod = vRockLod;
          // Soften bump vs Leva — strong dFdx normals make specular crawl with the camera
          float bump = uRockBump * lod * lod * 0.55;
          if (bump > 1e-4) {
            float h = rockHeight(vRockPos * uRockFreq, lod);
            float dHdx = dFdx(h);
            float dHdy = dFdy(h);
            vec3 sigmaX = dFdx(vViewPosition.xyz);
            vec3 sigmaY = dFdy(vViewPosition.xyz);
            vec3 N = normalize(normal);
            vec3 R1 = cross(sigmaY, N);
            vec3 R2 = cross(N, sigmaX);
            float det = dot(sigmaX, R1);
            vec3 grad = sign(det) * (dHdx * R1 + dHdy * R2);
            vec3 bumped = normalize(N - grad * bump);
            // Blend back toward geometric normal to kill ridge specular halos
            normal = normalize(mix(N, bumped, 0.55));
          }
        }
        `,
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        #include <map_fragment>
        {
          float lod = max(vRockLod, 0.15);
          vec3 rp = vRockPos * uRockFreq;
          // Surface mottling — darker clefts, dusty ridges; keep instance hue
          float grit = rockFbm(rp, lod);
          float ridges = rockRidged(rp * 2.4, lod);
          float pits = rockRidged(rp * 5.1 + 2.0, lod);
          float contrast = uRockContrast * mix(0.45, 1.15, lod);
          float shade = mix(1.0 - contrast * 0.85, 1.0 + contrast * 0.45, grit);
          shade *= mix(0.78, 1.14, ridges);
          shade *= mix(0.86, 1.06, pits);

          vec3 base = diffuseColor.rgb;
          float lum = dot(base, vec3(0.299, 0.587, 0.114));
          // Cool ash in pits, warm dust on ridges — breaks flat paint
          vec3 cool = mix(base, vec3(lum * 0.92), 0.45);
          vec3 warm = base * vec3(1.08, 1.02, 0.94);
          float coolMix = (1.0 - smoothstep(0.3, 0.7, grit)) * 0.5;
          float warmMix = smoothstep(0.4, 0.85, ridges) * 0.35;
          vec3 mottled = mix(base, cool, coolMix);
          mottled = mix(mottled, warm, warmMix);
          diffuseColor.rgb = mottled * shade;
        }
        `,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `
        #include <emissivemap_fragment>
        #if defined( USE_INSTANCING_COLOR ) || defined( USE_COLOR )
        if (uNightSurfaceGlow > 1e-4) {
          // Violet instance tint (night omens) — soft crust glow, keeps lit shading
          float coolBias = vColor.b - vColor.r;
          float nightAmt = smoothstep(0.04, 0.14, coolBias)
            * smoothstep(0.28, 0.48, vColor.b);
          // Cam-facing fill + rim so pits stay darker and form reads
          float ndv = max(dot(normalize(normal), vec3(0.0, 0.0, 1.0)), 0.0);
          float rim = pow(1.0 - ndv, 1.6);
          float mask = mix(0.28, 1.0, rim) * mix(0.65, 1.0, ndv);
          totalEmissiveRadiance += vColor.rgb * (uNightSurfaceGlow * nightAmt * mask * 0.42);
        }
        #endif
        `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
        #include <roughnessmap_fragment>
        // Break up remaining specular so sun glints don't travel as a sheet
        roughnessFactor = max(roughnessFactor, 0.88);
        `,
      )
  }

  material.customProgramCacheKey = () => 'asteroid-rock-fbm-v10-night-glow'
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

export function setAsteroidNightSurfaceGlow(
  material: MeshStandardMaterial,
  amount: number,
) {
  const uniforms = material.userData.rockUniforms as
    | AsteroidRockUniforms
    | undefined
  if (uniforms) uniforms.uNightSurfaceGlow.value = Math.max(0, amount)
}
