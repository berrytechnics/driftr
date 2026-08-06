import { useFrame } from '@react-three/fiber'
import {
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactElement,
  type RefObject,
} from 'react'
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  Euler,
  Group,
  MathUtils,
  Matrix4,
  MeshStandardMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three'
import {
  ALT_DYSON_INCLINATION,
  ALT_DYSON_ORBIT,
} from '@/game/systemConfig'
import type { HazardField } from '@/ship/PlayerShip'
import {
  SIPHON_MISSING,
  SIPHON_SAT_COUNT,
  isSiphonLive,
  listSiphonIndices,
} from '@/lore/siphonPads'

/** Map pip sizing for the ring chart entry. */
export const DYSON_MAP_SIZE = 10

/**
 * Display scale so siphon pads read larger than the player ship while docked.
 * Colliders / attach clearance track this.
 */
export const SAT_DISPLAY_SCALE = 3.6

const BEACON_CORE = new Color('#e22630')
const BEACON_SOFT = new Color('#a01018')
const COL_FRAME = '#2a2438'
const COL_ABSORB = '#08060e'
const COL_VEIN = '#4a3a78'
const ACCENT = new Color('#6b5cff')

let softGlowMap: CanvasTexture | null = null

function getSoftGlowMap() {
  if (softGlowMap) return softGlowMap
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const cx = size * 0.5
  const img = ctx.createImageData(size, size)
  const data = img.data
  const invR = 1 / cx
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - cx) * invR
      const dy = (y + 0.5 - cx) * invR
      const r = Math.sqrt(dx * dx + dy * dy)
      const i = (y * size + x) * 4
      data[i] = data[i + 1] = data[i + 2] = 255
      if (r >= 1) {
        data[i + 3] = 0
        continue
      }
      const haze = Math.exp(-3.2 * r * r)
      const heart = Math.exp(-14 * r * r) * 0.4
      data[i + 3] = Math.round(Math.min(1, (haze * 0.75 + heart) * (1 - r * r)) * 255)
    }
  }
  ctx.putImageData(img, 0, 0)
  softGlowMap = new CanvasTexture(canvas)
  softGlowMap.needsUpdate = true
  return softGlowMap
}

const _sun = new Vector3()
const _local = new Vector3()
const _inv = new Matrix4()
const _from = new Vector3()
const _to = new Vector3()
const _ab = new Vector3()
const _ac = new Vector3()
const _euler = new Euler()
const _satRot = new Matrix4()
const _satPt = new Vector3()

type LocalSphere = { x: number; y: number; z: number; r: number }

type SatSpec = {
  i: number
  angle: number
  x: number
  z: number
  yawJitter: number
  pitchJitter: number
  rollJitter: number
  live: boolean
  blinkPhase: number
  blinkPeriod: number
  seed: number
}

type AbsorberMats = {
  frame: MeshStandardMaterial
  absorb: MeshStandardMaterial
  vein: MeshStandardMaterial
}

function createMats(): AbsorberMats {
  return {
    frame: new MeshStandardMaterial({
      color: COL_FRAME,
      metalness: 0.72,
      roughness: 0.42,
      emissive: ACCENT,
      emissiveIntensity: 0.04,
      envMapIntensity: 0.4,
    }),
    // Light-swallowing faces — almost no bounce, faint violet hunger
    absorb: new MeshStandardMaterial({
      color: COL_ABSORB,
      metalness: 0.08,
      roughness: 0.96,
      emissive: new Color('#1a0a28'),
      emissiveIntensity: 0.08,
      envMapIntensity: 0.05,
      side: DoubleSide,
    }),
    vein: new MeshStandardMaterial({
      color: COL_VEIN,
      metalness: 0.55,
      roughness: 0.5,
      emissive: ACCENT,
      emissiveIntensity: 0.12,
      envMapIntensity: 0.3,
    }),
  }
}

function buildSats(repaired: ReadonlySet<number>): SatSpec[] {
  const list: SatSpec[] = []
  const span = (Math.PI * 2) / SIPHON_SAT_COUNT
  for (let i = 0; i < SIPHON_SAT_COUNT; i++) {
    if (SIPHON_MISSING.has(i)) continue
    const angle = i * span
    const seed = MathUtils.seededRandom(i * 19.7 + 4.1)
    const seed2 = MathUtils.seededRandom(i * 7.3 + 1.1)
    list.push({
      i,
      angle,
      x: Math.cos(angle) * ALT_DYSON_ORBIT,
      z: Math.sin(angle) * ALT_DYSON_ORBIT,
      yawJitter: (seed - 0.5) * 0.18,
      pitchJitter: (seed - 0.5) * 0.12,
      rollJitter: (seed2 - 0.5) * 0.16,
      live: isSiphonLive(i, repaired),
      blinkPhase: seed2 * 2.8,
      blinkPeriod: 3.6 + seed * 2.2,
      seed,
    })
  }
  return list
}

function beaconPulse(t: number, period: number, phase: number) {
  const u = ((t + phase) % period) / period
  const x = (u - 0.22) / 0.22
  return 0.14 + Math.exp(-x * x) * 0.86
}

function makeGlowSprite(color: Color, size: number, opacity: number) {
  const mat = new SpriteMaterial({
    map: getSoftGlowMap(),
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    toneMapped: true,
    blending: AdditiveBlending,
  })
  const sprite = new Sprite(mat)
  sprite.scale.setScalar(size)
  sprite.renderOrder = 1
  return sprite
}

function BeaconFlasher({
  phase,
  period,
  paused,
  intensity = 1,
}: {
  phase: number
  period: number
  paused: boolean
  intensity?: number
}) {
  const t0 = useRef(0)
  const sprites = useMemo(
    () => ({
      core: makeGlowSprite(BEACON_CORE, 7, 0),
      mid: makeGlowSprite(BEACON_SOFT, 36, 0),
      far: makeGlowSprite(BEACON_SOFT, 96, 0),
    }),
    [],
  )

  useLayoutEffect(
    () => () => {
      sprites.core.material.dispose()
      sprites.mid.material.dispose()
      sprites.far.material.dispose()
    },
    [sprites],
  )

  useFrame((_, dt) => {
    if (!paused) t0.current += dt
    const pulse = paused ? 0 : beaconPulse(t0.current, period, phase)
    const gain = intensity
    sprites.core.material.opacity = pulse * 0.11 * gain
    sprites.mid.material.opacity = pulse * 0.05 * gain
    sprites.far.material.opacity = pulse * 0.026 * gain
    sprites.core.visible = sprites.core.material.opacity > 0.006
    sprites.mid.visible = sprites.mid.material.opacity > 0.004
    sprites.far.visible = sprites.far.material.opacity > 0.003
    const breath = 0.96 + pulse * 0.08
    sprites.core.scale.setScalar(7 * breath)
    sprites.mid.scale.setScalar(36 * (0.97 + pulse * 0.07))
    sprites.far.scale.setScalar(96 * (0.98 + pulse * 0.05))
  })

  return (
    <group position={[0, 0, 3.2]}>
      <primitive object={sprites.far} />
      <primitive object={sprites.mid} />
      <primitive object={sprites.core} />
    </group>
  )
}

/**
 * Machine-alien solar siphon: twisted frame + bowl of light-swallowing plates
 * (−X). Resting pose puts +X (antenna) on the velocity vector; powered ring
 * yaws +90° so that antenna end faces the star.
 */
function AlienAbsorber({
  mats,
  seed,
}: {
  mats: AbsorberMats
  seed: number
}) {
  const twist = 0.35 + seed * 0.45
  const plateCount = 8
  const plates: ReactElement[] = []
  for (let i = 0; i < plateCount; i++) {
    const a = (i / plateCount) * Math.PI * 2 + seed * 0.4
    const r = 3.4 + (MathUtils.seededRandom(seed * 40 + i) - 0.5) * 0.35
    const flare = 0.55 + MathUtils.seededRandom(seed * 11 + i * 3) * 0.25
    plates.push(
      <group
        key={`plate-${i}`}
        position={[
          -1.1,
          Math.sin(a) * r * 0.55,
          Math.cos(a) * r * 0.55,
        ]}
        rotation={[
          Math.sin(a) * flare,
          0.15 + seed * 0.1,
          Math.cos(a) * flare + twist * 0.2,
        ]}
      >
        {/* Irregular hex-ish absorb face */}
        <mesh material={mats.absorb} rotation={[0, Math.PI / 2, 0]}>
          <circleGeometry args={[1.55 + seed * 0.2, 6]} />
        </mesh>
        <mesh material={mats.vein} position={[-0.04, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <ringGeometry args={[1.15, 1.35, 6]} />
        </mesh>
        {/* Throat lip — suggests the plate drinks light */}
        <mesh
          material={mats.frame}
          position={[0.08, 0, 0]}
          rotation={[0, Math.PI / 2, 0]}
        >
          <torusGeometry args={[0.55, 0.07, 5, 10]} />
        </mesh>
      </group>,
    )
  }

  const rings: ReactElement[] = []
  for (let i = 0; i < 4; i++) {
    const t = i / 3
    rings.push(
      <mesh
        key={`ring-${i}`}
        position={[t * 4.2 - 0.4, 0, 0]}
        rotation={[Math.PI / 2, 0, t * twist * Math.PI]}
        material={mats.frame}
      >
        <torusGeometry args={[1.15 - t * 0.25, 0.09, 6, 14]} />
      </mesh>,
    )
  }

  const ribs: ReactElement[] = []
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + twist
    ribs.push(
      <mesh
        key={`rib-${i}`}
        position={[1.6, Math.sin(a) * 0.15, Math.cos(a) * 0.15]}
        rotation={[0, 0, a + 0.4]}
        material={mats.vein}
      >
        <boxGeometry args={[3.8, 0.12, 0.18]} />
      </mesh>,
    )
  }

  return (
    <group>
      {/* Spine / twisted machine cage */}
      <mesh material={mats.frame} position={[1.8, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.28, 0.4, 5.2, 7]} />
      </mesh>
      <mesh material={mats.vein} position={[1.8, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.12, 0.12, 5.4, 5]} />
      </mesh>
      {rings}
      {ribs}

      {/* Hub node — alien geometry, not a clean box */}
      <mesh material={mats.frame} position={[0.2, 0, 0]}>
        <icosahedronGeometry args={[0.95, 0]} />
      </mesh>
      <mesh material={mats.absorb} position={[-0.55, 0, 0]}>
        <octahedronGeometry args={[0.7, 0]} />
      </mesh>

      {/* Dish of light-swallowing plates (faces −X) */}
      <group position={[-0.2, 0, 0]}>{plates}</group>

      {/* Asymmetric antenna barbs */}
      <mesh
        position={[3.6, 1.1, -0.4]}
        rotation={[0.4, 0.2, 0.9]}
        material={mats.frame}
      >
        <boxGeometry args={[0.12, 2.4, 0.12]} />
      </mesh>
      <mesh
        position={[3.4, -0.9, 0.7]}
        rotation={[-0.5, -0.3, -0.7]}
        material={mats.frame}
      >
        <boxGeometry args={[0.1, 1.8, 0.1]} />
      </mesh>
      <mesh position={[4.2, 0.2, 0]} material={mats.vein}>
        <octahedronGeometry args={[0.35, 0]} />
      </mesh>
    </group>
  )
}

/**
 * Surface-hugging spheres in AlienAbsorber local space (matches mesh extents).
 * Plates sit under an extra −0.2 X parent group in the mesh tree.
 */
function absorberLocalColliders(seed: number): LocalSphere[] {
  const spheres: LocalSphere[] = []
  const push = (x: number, y: number, z: number, r: number) => {
    spheres.push({ x, y, z, r })
  }

  // Twisted cage — chain covers spine + ring major radii without a fat shell
  for (let s = 0; s <= 5; s++) {
    const t = s / 5
    push(-0.3 + t * 4.3, 0, 0, 1.12 - t * 0.22)
  }

  // Hub nodules
  push(0.2, 0, 0, 0.95)
  push(-0.55, 0, 0, 0.72)

  // Absorb plates (parent group at x = −0.2)
  const plateCount = 8
  for (let i = 0; i < plateCount; i++) {
    const a = (i / plateCount) * Math.PI * 2 + seed * 0.4
    const rad = 3.4 + (MathUtils.seededRandom(seed * 40 + i) - 0.5) * 0.35
    const faceR = 1.18 + seed * 0.12
    push(
      -1.3,
      Math.sin(a) * rad * 0.55,
      Math.cos(a) * rad * 0.55,
      faceR,
    )
  }

  // Antenna barbs + tip nodule
  push(3.6, 1.1, -0.4, 0.55)
  push(3.95, 1.85, -0.55, 0.32)
  push(3.4, -0.9, 0.7, 0.48)
  push(3.65, -1.45, 0.95, 0.28)
  push(4.2, 0.2, 0, 0.38)

  return spheres
}

/**
 * Resting hull yaw keeps +X (antenna) on the velocity vector.
 * When the ring powers, add SUNWARD_AIM so that same end faces the star.
 */
const SUNWARD_AIM = Math.PI / 2

function satHullYaw(sat: SatSpec, aimYaw: number) {
  return -sat.angle + Math.PI / 2 + sat.yawJitter + aimYaw
}

/** Spin-local colliders — each sat's absorber spheres, rotated to match the model. */
function buildColliders(
  sats: SatSpec[],
  aimYaw: number,
  displayScale: number,
): LocalSphere[] {
  const out: LocalSphere[] = []
  for (let i = 0; i < sats.length; i++) {
    const sat = sats[i]!
    _euler.set(sat.pitchJitter, satHullYaw(sat, aimYaw), sat.rollJitter, 'XYZ')
    _satRot.makeRotationFromEuler(_euler)
    const local = absorberLocalColliders(sat.seed)
    for (let j = 0; j < local.length; j++) {
      const s = local[j]!
      _satPt
        .set(s.x, s.y, s.z)
        .multiplyScalar(displayScale)
        .applyMatrix4(_satRot)
      out.push({
        x: _satPt.x + sat.x,
        y: _satPt.y,
        z: _satPt.z + sat.z,
        r: s.r * displayScale,
      })
    }
  }
  return out
}

function hitLocalSpheres(
  spheres: LocalSphere[],
  lx: number,
  ly: number,
  lz: number,
  pad: number,
) {
  for (let i = 0; i < spheres.length; i++) {
    const s = spheres[i]!
    const dx = lx - s.x
    const dy = ly - s.y
    const dz = lz - s.z
    const r = s.r + pad
    if (dx * dx + dy * dy + dz * dz <= r * r) return true
  }
  return false
}

function RingSatellite({
  mats,
  spec,
  paused,
  dockRef,
  aimYawRef,
  displayScale,
  beaconIntensity,
}: {
  mats: AbsorberMats
  spec: SatSpec
  paused: boolean
  dockRef?: RefObject<Group | null>
  aimYawRef: RefObject<number>
  displayScale: number
  beaconIntensity: number
}) {
  const hull = useRef<Group>(null!)

  useFrame(() => {
    const g = hull.current
    if (!g) return
    g.rotation.set(
      spec.pitchJitter,
      satHullYaw(spec, aimYawRef.current),
      spec.rollJitter,
    )
  })

  return (
    <group
      position={[spec.x, 0, spec.z]}
      ref={(node) => {
        if (dockRef) dockRef.current = node
      }}
    >
      {/* +X antenna leads along velocity; +SUNWARD_AIM turns it sunward */}
      <group
        ref={hull}
        rotation={[
          spec.pitchJitter,
          satHullYaw(spec, aimYawRef.current),
          spec.rollJitter,
        ]}
      >
        <group scale={displayScale}>
          <AlienAbsorber mats={mats} seed={spec.seed} />
        </group>
        {spec.live && (
          <group
            position={[
              4.2 * displayScale,
              0.2 * displayScale,
              0,
            ]}
          >
            <BeaconFlasher
              phase={spec.blinkPhase}
              period={spec.blinkPeriod}
              paused={paused}
              intensity={beaconIntensity}
            />
          </group>
        )}
      </group>
    </group>
  )
}

type VesperSatelliteRingProps = {
  sunPosition: [number, number, number]
  paused?: boolean
  orbitSpeed?: number
  inclination?: number
  /** Extra tilt yaw/roll on the ring plane (leva tune). */
  tiltYaw?: number
  tiltRoll?: number
  displayScale?: number
  beaconIntensity?: number
  mapRef?: RefObject<Group | null>
  hazardRef?: RefObject<HazardField | null>
  /** Indices of initially-dead siphons restored with Nyx dust. */
  repairedIds?: readonly number[]
  /** Full ring live — sats yaw antenna-end sunward (orbit unchanged). */
  powered?: boolean
  /**
   * Dock roots for every present siphon — same order as `listSiphonIndices()`.
   * Wired into PlayerShip DockBerth list by NyxAltSpace.
   */
  dockRefs?: RefObject<Group | null>[]
}

/**
 * Derelict alien collector ring — twisted siphon frames with light-swallowing
 * plate dishes, built to drink Vesper and feed the misplanted gate.
 */
export function VesperSatelliteRing({
  sunPosition,
  paused = false,
  orbitSpeed = 0.006,
  inclination = ALT_DYSON_INCLINATION,
  tiltYaw = 0.15,
  tiltRoll = -0.08,
  displayScale = SAT_DISPLAY_SCALE,
  beaconIntensity = 1,
  mapRef,
  hazardRef,
  repairedIds = [],
  powered = false,
  dockRefs,
}: VesperSatelliteRingProps) {
  const root = useRef<Group>(null!)
  const tilt = useRef<Group>(null!)
  const spin = useRef<Group>(null!)
  const yaw = useRef(0.35)
  const aimYaw = useRef(powered ? SUNWARD_AIM : 0)
  const collidersRef = useRef<LocalSphere[]>([])
  const satsRef = useRef<SatSpec[]>([])
  const displayScaleRef = useRef(displayScale)
  displayScaleRef.current = displayScale

  const mats = useMemo(() => createMats(), [])
  const repairedSet = useMemo(() => new Set(repairedIds), [repairedIds])
  const sats = useMemo(() => buildSats(repairedSet), [repairedSet])
  satsRef.current = sats
  const indexToDockSlot = useMemo(() => {
    const map = new Map<number, number>()
    listSiphonIndices().forEach((id, slot) => map.set(id, slot))
    return map
  }, [])

  useLayoutEffect(() => {
    collidersRef.current = buildColliders(
      sats,
      aimYaw.current,
      displayScale,
    )
  }, [sats, displayScale])

  useLayoutEffect(
    () => () => {
      mats.frame.dispose()
      mats.absorb.dispose()
      mats.vein.dispose()
    },
    [mats],
  )

  useLayoutEffect(() => {
    const g = tilt.current
    if (!g) return
    g.rotation.order = 'YXZ'
    g.rotation.x = inclination
    g.rotation.y = tiltYaw
    g.rotation.z = tiltRoll
  }, [inclination, tiltYaw, tiltRoll])

  useLayoutEffect(() => {
    if (!hazardRef) return
    hazardRef.current = {
      test(point, pad) {
        const group = spin.current
        if (!group) return false
        group.updateWorldMatrix(true, false)
        _inv.copy(group.matrixWorld).invert()
        _local.copy(point).applyMatrix4(_inv)
        return hitLocalSpheres(
          collidersRef.current,
          _local.x,
          _local.y,
          _local.z,
          pad,
        )
      },
      impact(point, pad, _direction) {
        const group = spin.current
        if (!group) return false
        group.updateWorldMatrix(true, false)
        _inv.copy(group.matrixWorld).invert()
        _local.copy(point).applyMatrix4(_inv)
        return hitLocalSpheres(
          collidersRef.current,
          _local.x,
          _local.y,
          _local.z,
          pad,
        )
      },
      occludes(from, to) {
        const group = spin.current
        if (!group) return false
        group.updateWorldMatrix(true, false)
        _inv.copy(group.matrixWorld).invert()
        _from.copy(from).applyMatrix4(_inv)
        _to.copy(to).applyMatrix4(_inv)
        _ab.subVectors(_to, _from)
        const abLen2 = _ab.lengthSq()
        if (abLen2 < 1e-8) return false
        const colliders = collidersRef.current
        for (let i = 0; i < colliders.length; i++) {
          const s = colliders[i]!
          _ac.set(s.x - _from.x, s.y - _from.y, s.z - _from.z)
          let t = _ac.dot(_ab) / abLen2
          if (t < 0 || t > 1) continue
          const px = _from.x + _ab.x * t - s.x
          const py = _from.y + _ab.y * t - s.y
          const pz = _from.z + _ab.z * t - s.z
          if (px * px + py * py + pz * pz <= s.r * s.r) return true
        }
        return false
      },
    }
    return () => {
      hazardRef.current = null
    }
  }, [hazardRef])

  useFrame((_, dt) => {
    const group = root.current
    const rotor = spin.current
    if (!group || !rotor) return
    _sun.set(...sunPosition)
    group.position.copy(_sun)
    if (!paused) {
      yaw.current += dt * orbitSpeed
      rotor.rotation.y = yaw.current

      const target = powered ? SUNWARD_AIM : 0
      const prev = aimYaw.current
      aimYaw.current = MathUtils.damp(prev, target, 1.35, dt)
      if (Math.abs(aimYaw.current - prev) > 1e-5) {
        collidersRef.current = buildColliders(
          satsRef.current,
          aimYaw.current,
          displayScaleRef.current,
        )
      }
    }
  })

  const mapSat = sats[0]!

  return (
    <group ref={root}>
      <group ref={tilt}>
        <group ref={spin}>
          {sats.map((spec) => {
            const slot = indexToDockSlot.get(spec.i)
            const dockRef =
              slot != null && dockRefs ? dockRefs[slot] : undefined
            return (
              <RingSatellite
                key={spec.i}
                mats={mats}
                spec={spec}
                paused={paused}
                dockRef={dockRef}
                aimYawRef={aimYaw}
                displayScale={displayScale}
                beaconIntensity={beaconIntensity}
              />
            )
          })}
          <group
            ref={(node) => {
              if (mapRef) mapRef.current = node
            }}
            position={[mapSat.x, 0, mapSat.z]}
          />
        </group>
      </group>
    </group>
  )
}

export {
  SIPHON_DOCK_RANGE,
  siphonPadName,
  listSiphonIndices,
  isSiphonPadName,
  parseSiphonPadIndex,
  isSiphonLive,
  isSiphonRingComplete,
  createSiphonDockRefs,
  SIPHON_INITIAL_DEAD,
} from '@/lore/siphonPads'
