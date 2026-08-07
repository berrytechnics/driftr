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
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  FrontSide,
  Group,
  Line,
  LineBasicMaterial,
  MathUtils,
  Matrix4,
  MeshStandardMaterial,
  NearestFilter,
  PointLight,
  RepeatWrapping,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  type Object3D,
  type Texture,
} from 'three'
import type { HazardField } from '@/ship/PlayerShip'
import { VOID_GATE_ORBIT } from '@/game/systemConfig'
import {
  buildHullColliders,
  createMeshHazardField,
  type HullCollider,
} from '@/world/meshHazard'

/** Centerline of the truss ring (world units). */
export const GATE_RING_RADIUS = 42
/** Approximate “tube” depth for map sizing / placement. */
export const GATE_TUBE_RADIUS = 9
/** Map pip / guide size. */
export const GATE_MAP_SIZE = 48
/** Clear throat radius — portal sits inside the spoke torus. */
export const PORTAL_RADIUS = 12.5
/** Fly-through trigger — slightly inside the visible event horizon. */
export const PORTAL_ENTER_RADIUS = PORTAL_RADIUS * 0.85
/** Spawn standoff past the throat after a portal hop (world units). */
export const PORTAL_EXIT_CLEARANCE = 24
/**
 * Offset from Vesper’s sun where surveyors dropped the ring
 * (past Nyx toward V-3).
 */
export const MISPLANTED_GATE_OFFSET: [number, number, number] = [
  580, 70, -220,
]
/** Matching gate in the liminal void — phase-0 offset from Cinder. */
export const VOID_GATE_OFFSET: [number, number, number] = [
  VOID_GATE_ORBIT,
  42,
  0,
]
/** Grace after mount / hop so arrival doesn’t immediately re-fire. */
const PORTAL_ARM_DELAY = 2.4

/** World point just outside the throat for portal arrivals. */
export function gatePortalExitWorld(
  sunPosition: [number, number, number],
  offset: [number, number, number],
) {
  return {
    x: sunPosition[0] + offset[0],
    y: sunPosition[1] + offset[1] + PORTAL_EXIT_CLEARANCE,
    z: sunPosition[2] + offset[2],
  }
}

const MODULE_COUNT = 32
const MISSING_MODULES = new Set([4, 5, 6, 19, 20])

const INNER_R = 33
const OUTER_R = 51
const RING_DEPTH = 11
const _sun = new Vector3()
const _orbit = new Vector3()
const _orbitTilt = new Vector3(1, 0, 0)
const _player = new Vector3()
const _local = new Vector3()
const _inv = new Matrix4()

const COL_ACCENT = '#6b5cff'
const COL_GLOW = '#9a90ff'
const ACCENT = new Color(COL_ACCENT)

type MisplantedGateProps = {
  sunPosition: [number, number, number]
  offset: [number, number, number]
  playerRef: RefObject<Object3D | null>
  sightRange?: number
  alreadySeen?: boolean
  onFirstSight?: (toast: string) => void
  toast?: string
  paused?: boolean
  gateRef?: RefObject<Group | null>
  /** Tight surface colliders for the opaque truss (throat stays open). */
  hazardRef?: RefObject<HazardField | null>
  /** Entire collector ring live — brightens lattice and speeds the yaw. */
  powered?: boolean
  /** Fired once when the player flies the powered throat (portal hop). */
  onPortalEnter?: () => void
  /**
   * When set, `offset` is the phase-0 radius vector from `sunPosition` and the
   * gate drifts on a circular (optionally inclined) orbit.
   */
  orbitAngularSpeed?: number
  orbitInclination?: number
}

type ModuleSpec = {
  i: number
  angle: number
  mid: number
  cx: number
  cy: number
  ox: number
  oy: number
  ix: number
  iy: number
  hasPod: boolean
  hasAntenna: boolean
  hasClamp: boolean
}

type GateMaterials = {
  hull: MeshStandardMaterial
  panel: MeshStandardMaterial
  trim: MeshStandardMaterial
  /** Structural pipes, braces, lips — cool steel, not violet. */
  steel: MeshStandardMaterial
  textures: Texture[]
}

function paintNoise(
  ctx: CanvasRenderingContext2D,
  size: number,
  amount: number,
  tone: number,
) {
  const img = ctx.getImageData(0, 0, size, size)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    if (Math.random() > amount) continue
    const n = (Math.random() - 0.5) * tone
    d[i] = Math.max(0, Math.min(255, d[i] + n))
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n))
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n))
  }
  ctx.putImageData(img, 0, 0)
}

/** Canvas-built hull skins — panel seams, rivets, scuffs (no external assets). */
function createGateMaterials(): GateMaterials {
  const size = 512
  const color = document.createElement('canvas')
  color.width = size
  color.height = size
  const cctx = color.getContext('2d')!

  // Deep seam bed — darker so plate faces pop under sun light
  cctx.fillStyle = '#0c0a14'
  cctx.fillRect(0, 0, size, size)

  // Plate cells — wider value swing so lighting has something to catch
  const cols = 5
  const rows = 4
  const pad = 8
  const cellW = (size - pad * (cols + 1)) / cols
  const cellH = (size - pad * (rows + 1)) / rows
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = pad + x * (cellW + pad)
      const py = pad + y * (cellH + pad)
      const n = (x * 17 + y * 29) % 100
      // Face value ~55–110; cool violet with occasional ash lift
      const lift = 55 + (n % 40) + (n > 70 ? 18 : 0)
      const r = lift + (n > 70 ? 12 : 0)
      const g = lift * 0.82
      const b = lift + 28 + (n < 35 ? 18 : 0)
      cctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`
      cctx.fillRect(px, py, cellW, cellH)

      // Bevel highlight / shadow — stronger edge light
      cctx.strokeStyle = 'rgba(210,195,255,0.55)'
      cctx.lineWidth = 3
      cctx.beginPath()
      cctx.moveTo(px + 1, py + cellH - 1)
      cctx.lineTo(px + 1, py + 1)
      cctx.lineTo(px + cellW - 1, py + 1)
      cctx.stroke()
      cctx.strokeStyle = 'rgba(0,0,0,0.72)'
      cctx.beginPath()
      cctx.moveTo(px + cellW - 1, py + 1)
      cctx.lineTo(px + cellW - 1, py + cellH - 1)
      cctx.lineTo(px + 1, py + cellH - 1)
      cctx.stroke()

      // Micro hatch
      cctx.strokeStyle = 'rgba(160,140,230,0.22)'
      cctx.lineWidth = 1
      for (let h = 8; h < cellH - 6; h += 7) {
        cctx.beginPath()
        cctx.moveTo(px + 4, py + h)
        cctx.lineTo(px + cellW - 4, py + h)
        cctx.stroke()
      }

      // Rivets
      cctx.fillStyle = 'rgba(230,220,255,0.7)'
      const rivets = [
        [px + 5, py + 5],
        [px + cellW - 5, py + 5],
        [px + 5, py + cellH - 5],
        [px + cellW - 5, py + cellH - 5],
      ]
      for (const [rx, ry] of rivets) {
        cctx.beginPath()
        cctx.arc(rx, ry, 2.2, 0, Math.PI * 2)
        cctx.fill()
        cctx.fillStyle = 'rgba(0,0,0,0.45)'
        cctx.beginPath()
        cctx.arc(rx + 0.6, ry + 0.6, 1.1, 0, Math.PI * 2)
        cctx.fill()
        cctx.fillStyle = 'rgba(230,220,255,0.7)'
      }

      // Occasional shard-vein / ash stain
      if ((x + y * 3) % 7 === 0) {
        cctx.fillStyle = 'rgba(150,105,240,0.38)'
        cctx.fillRect(px + cellW * 0.2, py + cellH * 0.32, cellW * 0.55, 7)
      }
      if ((x * 5 + y) % 11 === 0) {
        cctx.strokeStyle = 'rgba(200,160,255,0.28)'
        cctx.lineWidth = 3
        cctx.beginPath()
        cctx.moveTo(px + 8, py + cellH * 0.7)
        cctx.lineTo(px + cellW - 10, py + cellH * 0.35)
        cctx.stroke()
      }
      if ((x + y) % 5 === 0) {
        cctx.fillStyle = 'rgba(30,20,55,0.5)'
        cctx.beginPath()
        cctx.ellipse(
          px + cellW * 0.65,
          py + cellH * 0.55,
          cellW * 0.22,
          cellH * 0.18,
          0.4,
          0,
          Math.PI * 2,
        )
        cctx.fill()
      }
    }
  }

  // Seam channels between plates
  cctx.strokeStyle = 'rgba(0,0,0,0.85)'
  cctx.lineWidth = pad
  for (let x = 0; x <= cols; x++) {
    const px = pad * 0.5 + x * (cellW + pad)
    cctx.beginPath()
    cctx.moveTo(px, 0)
    cctx.lineTo(px, size)
    cctx.stroke()
  }
  for (let y = 0; y <= rows; y++) {
    const py = pad * 0.5 + y * (cellH + pad)
    cctx.beginPath()
    cctx.moveTo(0, py)
    cctx.lineTo(size, py)
    cctx.stroke()
  }

  paintNoise(cctx, size, 0.55, 36)

  // Roughness: smoother plate faces, chalkier seams
  const rough = document.createElement('canvas')
  rough.width = size
  rough.height = size
  const rctx = rough.getContext('2d')!
  rctx.fillStyle = '#6e6e6e'
  rctx.fillRect(0, 0, size, size)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = pad + x * (cellW + pad)
      const py = pad + y * (cellH + pad)
      rctx.fillStyle = '#4a4a4a'
      rctx.fillRect(px + 2, py + 2, cellW - 4, cellH - 4)
    }
  }
  rctx.strokeStyle = '#e8e8e8'
  rctx.lineWidth = pad
  for (let x = 0; x <= cols; x++) {
    const px = pad * 0.5 + x * (cellW + pad)
    rctx.beginPath()
    rctx.moveTo(px, 0)
    rctx.lineTo(px, size)
    rctx.stroke()
  }
  for (let y = 0; y <= rows; y++) {
    const py = pad * 0.5 + y * (cellH + pad)
    rctx.beginPath()
    rctx.moveTo(0, py)
    rctx.lineTo(size, py)
    rctx.stroke()
  }
  paintNoise(rctx, size, 0.45, 40)

  // Bump — taller plate relief, deeper seams
  const bump = document.createElement('canvas')
  bump.width = size
  bump.height = size
  const bctx = bump.getContext('2d')!
  bctx.fillStyle = '#404040'
  bctx.fillRect(0, 0, size, size)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = pad + x * (cellW + pad)
      const py = pad + y * (cellH + pad)
      bctx.fillStyle = '#c8c8c8'
      bctx.fillRect(px + 2, py + 2, cellW - 4, cellH - 4)
      bctx.fillStyle = '#303030'
      bctx.fillRect(px, py, cellW, 3)
      bctx.fillRect(px, py, 3, cellH)
      bctx.fillStyle = '#f0f0f0'
      for (const [rx, ry] of [
        [px + 5, py + 5],
        [px + cellW - 5, py + 5],
        [px + 5, py + cellH - 5],
        [px + cellW - 5, py + cellH - 5],
      ] as const) {
        bctx.beginPath()
        bctx.arc(rx, ry, 2.6, 0, Math.PI * 2)
        bctx.fill()
      }
    }
  }

  const map = new CanvasTexture(color)
  map.colorSpace = SRGBColorSpace
  map.wrapS = map.wrapT = RepeatWrapping
  map.anisotropy = 4
  map.repeat.set(2.4, 2.4)

  const roughnessMap = new CanvasTexture(rough)
  roughnessMap.wrapS = roughnessMap.wrapT = RepeatWrapping
  roughnessMap.anisotropy = 4
  roughnessMap.repeat.set(2.4, 2.4)

  const bumpMap = new CanvasTexture(bump)
  bumpMap.wrapS = bumpMap.wrapT = RepeatWrapping
  bumpMap.magFilter = NearestFilter
  bumpMap.anisotropy = 4
  bumpMap.repeat.set(2.4, 2.4)

  const shared = {
    map,
    roughnessMap,
    bumpMap,
    bumpScale: 1.35,
    envMapIntensity: 0.75,
  }

  // Near-white tint so the painted map drives value / hue
  const hull = new MeshStandardMaterial({
    color: '#d4cae8',
    metalness: 0.48,
    roughness: 0.58,
    emissive: ACCENT,
    emissiveIntensity: 0.04,
    ...shared,
  })
  const panel = new MeshStandardMaterial({
    color: '#ddd4f0',
    metalness: 0.42,
    roughness: 0.62,
    emissive: ACCENT,
    emissiveIntensity: 0.05,
    ...shared,
  })
  const trimMap = map.clone()
  trimMap.repeat.set(3.8, 1.4)
  const trimRough = roughnessMap.clone()
  trimRough.repeat.set(3.8, 1.4)
  const trimBump = bumpMap.clone()
  trimBump.repeat.set(3.8, 1.4)
  const trim = new MeshStandardMaterial({
    color: '#c8bcd8',
    metalness: 0.55,
    roughness: 0.5,
    emissive: ACCENT,
    emissiveIntensity: 0.05,
    map: trimMap,
    roughnessMap: trimRough,
    bumpMap: trimBump,
    bumpScale: 1.05,
    envMapIntensity: 0.85,
  })

  // Brushed steel — mid greys so it still reads in a dim indigo sky
  const steelCanvas = document.createElement('canvas')
  steelCanvas.width = size
  steelCanvas.height = size
  const sctx = steelCanvas.getContext('2d')!
  sctx.fillStyle = '#5a5e66'
  sctx.fillRect(0, 0, size, size)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = pad + x * (cellW + pad)
      const py = pad + y * (cellH + pad)
      const n = (x * 17 + y * 29) % 100
      const v = 145 + (n % 55)
      sctx.fillStyle = `rgb(${v},${v + 2},${v + 5})`
      sctx.fillRect(px, py, cellW, cellH)
      sctx.strokeStyle = 'rgba(245,248,255,0.7)'
      sctx.lineWidth = 2
      sctx.beginPath()
      sctx.moveTo(px + 1, py + cellH - 1)
      sctx.lineTo(px + 1, py + 1)
      sctx.lineTo(px + cellW - 1, py + 1)
      sctx.stroke()
      sctx.strokeStyle = 'rgba(40,44,52,0.55)'
      sctx.beginPath()
      sctx.moveTo(px + cellW - 1, py + 1)
      sctx.lineTo(px + cellW - 1, py + cellH - 1)
      sctx.lineTo(px + 1, py + cellH - 1)
      sctx.stroke()
      // Fine brush lines
      sctx.strokeStyle = 'rgba(255,255,255,0.12)'
      sctx.lineWidth = 1
      for (let h = 6; h < cellH - 4; h += 5) {
        sctx.beginPath()
        sctx.moveTo(px + 3, py + h)
        sctx.lineTo(px + cellW - 3, py + h)
        sctx.stroke()
      }
    }
  }
  sctx.strokeStyle = 'rgba(70,74,82,0.95)'
  sctx.lineWidth = pad
  for (let x = 0; x <= cols; x++) {
    const px = pad * 0.5 + x * (cellW + pad)
    sctx.beginPath()
    sctx.moveTo(px, 0)
    sctx.lineTo(px, size)
    sctx.stroke()
  }
  for (let y = 0; y <= rows; y++) {
    const py = pad * 0.5 + y * (cellH + pad)
    sctx.beginPath()
    sctx.moveTo(0, py)
    sctx.lineTo(size, py)
    sctx.stroke()
  }
  paintNoise(sctx, size, 0.4, 22)

  // Steel-only roughness: smoother faces, slightly chalkier seams
  const steelRoughCanvas = document.createElement('canvas')
  steelRoughCanvas.width = size
  steelRoughCanvas.height = size
  const srctx = steelRoughCanvas.getContext('2d')!
  srctx.fillStyle = '#3a3a3a'
  srctx.fillRect(0, 0, size, size)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = pad + x * (cellW + pad)
      const py = pad + y * (cellH + pad)
      srctx.fillStyle = '#2a2a2a'
      srctx.fillRect(px + 2, py + 2, cellW - 4, cellH - 4)
    }
  }
  srctx.strokeStyle = '#9a9a9a'
  srctx.lineWidth = pad
  for (let x = 0; x <= cols; x++) {
    const px = pad * 0.5 + x * (cellW + pad)
    srctx.beginPath()
    srctx.moveTo(px, 0)
    srctx.lineTo(px, size)
    srctx.stroke()
  }
  for (let y = 0; y <= rows; y++) {
    const py = pad * 0.5 + y * (cellH + pad)
    srctx.beginPath()
    srctx.moveTo(0, py)
    srctx.lineTo(size, py)
    srctx.stroke()
  }

  const steelMap = new CanvasTexture(steelCanvas)
  steelMap.colorSpace = SRGBColorSpace
  steelMap.wrapS = steelMap.wrapT = RepeatWrapping
  steelMap.anisotropy = 4
  steelMap.repeat.set(3.2, 1.6)
  const steelRough = new CanvasTexture(steelRoughCanvas)
  steelRough.wrapS = steelRough.wrapT = RepeatWrapping
  steelRough.anisotropy = 4
  steelRough.repeat.set(3.2, 1.6)
  const steelBump = bumpMap.clone()
  steelBump.repeat.set(3.2, 1.6)
  const steel = new MeshStandardMaterial({
    color: '#e6e9ee',
    metalness: 0.78,
    roughness: 0.38,
    map: steelMap,
    roughnessMap: steelRough,
    bumpMap: steelBump,
    bumpScale: 0.85,
    envMapIntensity: 1.6,
    emissive: new Color('#2a3038'),
    emissiveIntensity: 0.06,
  })

  return {
    hull,
    panel,
    trim,
    steel,
    textures: [
      map,
      roughnessMap,
      bumpMap,
      trimMap,
      trimRough,
      trimBump,
      steelMap,
      steelRough,
      steelBump,
    ],
  }
}

function GlowMat({ opacity = 0.55 }: { opacity?: number }) {
  return (
    <meshBasicMaterial
      color={COL_GLOW}
      transparent
      opacity={opacity}
      depthWrite={false}
      toneMapped={false}
      blending={AdditiveBlending}
    />
  )
}

/** Inset armor tiles on a chord face — breaks the big smooth plane. */
function PlateGrid({
  width,
  depth,
  cols,
  rows,
  material,
  raised = 0.55,
}: {
  width: number
  depth: number
  cols: number
  rows: number
  material: MeshStandardMaterial
  raised?: number
}) {
  const gap = 0.14
  const cellW = (width - gap * (cols + 1)) / cols
  const cellD = (depth - gap * (rows + 1)) / rows
  const tiles: ReactElement[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = -width / 2 + gap + cellW / 2 + c * (cellW + gap)
      const z = -depth / 2 + gap + cellD / 2 + r * (cellD + gap)
      tiles.push(
        <mesh key={`${r}-${c}`} position={[x, raised, z]} material={material}>
          <boxGeometry args={[cellW, raised * 0.9, cellD]} />
        </mesh>,
      )
    }
  }
  return <group>{tiles}</group>
}

function RingModule({
  spec,
  mats,
}: {
  spec: ModuleSpec
  mats: GateMaterials
}) {
  const { angle, mid, cx, cy, ox, oy, ix, iy, hasPod, hasAntenna, hasClamp } =
    spec
  const span = (Math.PI * 2) / MODULE_COUNT
  const outerLen = OUTER_R * span * 0.92
  const innerLen = INNER_R * span * 0.92
  const radialLen = OUTER_R - INNER_R

  return (
    <group>
      {/* Outer chord shell + inset plates */}
      <group position={[ox, oy, 0]} rotation={[0, 0, angle + Math.PI / 2]}>
        <mesh material={mats.hull} position={[0, -0.15, 0]}>
          <boxGeometry args={[outerLen, 0.85, RING_DEPTH * 0.9]} />
        </mesh>
        <PlateGrid
          width={outerLen * 0.96}
          depth={RING_DEPTH * 0.82}
          cols={2}
          rows={3}
          material={mats.panel}
          raised={0.55}
        />
        {/* Pipe run along outer face */}
        <mesh
          position={[0, 1.15, RING_DEPTH * 0.28]}
          rotation={[0, Math.PI / 2, 0]}
          material={mats.steel}
        >
          <cylinderGeometry args={[0.22, 0.22, outerLen * 0.9, 6]} />
        </mesh>
        <mesh
          position={[0, 1.15, -RING_DEPTH * 0.28]}
          rotation={[0, Math.PI / 2, 0]}
          material={mats.steel}
        >
          <cylinderGeometry args={[0.18, 0.18, outerLen * 0.85, 6]} />
        </mesh>
      </group>

      {/* Outer edge lip */}
      <mesh
        position={[ox * 1.025, oy * 1.025, 0]}
        rotation={[0, 0, angle + Math.PI / 2]}
        material={mats.steel}
      >
        <boxGeometry args={[outerLen * 0.88, 0.5, RING_DEPTH * 1.08]} />
      </mesh>

      {/* Inner chord + plated rail */}
      <group position={[ix, iy, 0]} rotation={[0, 0, angle + Math.PI / 2]}>
        <mesh material={mats.hull} position={[0, 0.1, 0]}>
          <boxGeometry args={[innerLen, 0.7, RING_DEPTH * 0.72]} />
        </mesh>
        <PlateGrid
          width={innerLen * 0.94}
          depth={RING_DEPTH * 0.62}
          cols={2}
          rows={2}
          material={mats.panel}
          raised={0.4}
        />
        <mesh position={[0, 0.7, 0]}>
          <boxGeometry args={[innerLen * 0.72, 0.22, 0.3]} />
          <GlowMat opacity={0.6} />
        </mesh>
      </group>

      {/* Radial spars with flange plates */}
      <mesh
        position={[cx, cy, RING_DEPTH * 0.32]}
        rotation={[0, 0, angle]}
        material={mats.hull}
      >
        <boxGeometry args={[radialLen, 0.65, 0.65]} />
      </mesh>
      <mesh
        position={[cx, cy, -RING_DEPTH * 0.32]}
        rotation={[0, 0, angle]}
        material={mats.hull}
      >
        <boxGeometry args={[radialLen, 0.65, 0.65]} />
      </mesh>
      <mesh
        position={[cx, cy, RING_DEPTH * 0.32]}
        rotation={[0, 0, angle]}
        material={mats.steel}
      >
        <boxGeometry args={[radialLen * 0.35, 1.1, 1.1]} />
      </mesh>

      {/* Diagonal cross-brace */}
      <mesh
        position={[cx, cy, 0]}
        rotation={[0.55, 0, angle + mid * 0.15]}
        material={mats.steel}
      >
        <boxGeometry args={[radialLen * 1.05, 0.38, 0.38]} />
      </mesh>

      {/* Side webbings */}
      <mesh
        position={[cx, cy, RING_DEPTH * 0.5]}
        rotation={[0, 0, angle + Math.PI / 2]}
        material={mats.steel}
      >
        <boxGeometry args={[1.15, radialLen * 0.85, 0.32]} />
      </mesh>
      <mesh
        position={[cx, cy, -RING_DEPTH * 0.5]}
        rotation={[0, 0, angle + Math.PI / 2]}
        material={mats.hull}
      >
        <boxGeometry args={[1.0, radialLen * 0.75, 0.28]} />
      </mesh>

      {hasPod && (
        <group position={[ox * 1.09, oy * 1.09, RING_DEPTH * 0.12]}>
          <mesh rotation={[0, 0, angle]} material={mats.panel}>
            <boxGeometry args={[4.2, 3.4, 5.5]} />
          </mesh>
          {/* Surface detail panels on pod */}
          <mesh
            rotation={[0, 0, angle]}
            position={[0, 1.85, 0]}
            material={mats.steel}
          >
            <boxGeometry args={[3.4, 0.2, 4.4]} />
          </mesh>
          <mesh
            rotation={[0, 0, angle]}
            position={[0, 0, 2.9]}
            material={mats.trim}
          >
            <boxGeometry args={[3.6, 2.6, 0.25]} />
          </mesh>
          <mesh position={[0, 0, 3.4]} rotation={[Math.PI / 2, 0, 0]} material={mats.steel}>
            <cylinderGeometry args={[1.05, 1.25, 2.0, 6]} />
          </mesh>
          <mesh position={[0, 1.95, 0]}>
            <boxGeometry args={[1.5, 0.28, 1.5]} />
            <GlowMat opacity={0.4} />
          </mesh>
        </group>
      )}

      {hasAntenna && (
        <group position={[ox * 1.05, oy * 1.05, -RING_DEPTH * 0.55]}>
          <mesh rotation={[0.9, 0, angle]} material={mats.steel}>
            <cylinderGeometry args={[0.18, 0.22, 9, 5]} />
          </mesh>
          <mesh position={[0, 0, -4.5]}>
            <boxGeometry args={[1.8, 0.15, 1.8]} />
            <GlowMat opacity={0.32} />
          </mesh>
        </group>
      )}

      {hasClamp && (
        <group position={[ix * 0.92, iy * 0.92, 0]} rotation={[0, 0, angle]}>
          <mesh position={[0, 0, 3.8]} material={mats.trim}>
            <boxGeometry args={[2.8, 1.2, 2.2]} />
          </mesh>
          <mesh position={[0, 0, 5.4]} rotation={[0, 0, Math.PI / 5]} material={mats.steel}>
            <boxGeometry args={[0.45, 3.2, 0.45]} />
          </mesh>
          <mesh position={[0, 0, 5.4]} rotation={[0, 0, -Math.PI / 5]} material={mats.steel}>
            <boxGeometry args={[0.45, 3.2, 0.45]} />
          </mesh>
        </group>
      )}
    </group>
  )
}

function ScaffoldArm({ mats }: { mats: GateMaterials }) {
  return (
    <group
      position={[OUTER_R * 0.2, -OUTER_R * 0.95, RING_DEPTH]}
      rotation={[0.35, 0.2, 0.9]}
    >
      <mesh material={mats.steel}>
        <boxGeometry args={[28, 1.6, 1.6]} />
      </mesh>
      <mesh position={[12, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={mats.steel}>
        <boxGeometry args={[14, 1.2, 1.2]} />
      </mesh>
      <mesh position={[12, -6, 0]} material={mats.panel}>
        <boxGeometry args={[1, 10, 1]} />
      </mesh>
      <mesh position={[12, -11.5, 0]} material={mats.trim}>
        <boxGeometry args={[4, 1.5, 3]} />
      </mesh>
      <mesh position={[6, -3, 0]} rotation={[0, 0, 0.5]}>
        <cylinderGeometry args={[0.08, 0.08, 12, 4]} />
        <meshBasicMaterial color="#4a4560" />
      </mesh>
    </group>
  )
}

function DebrisChord({ mats }: { mats: GateMaterials }) {
  return (
    <group
      position={[OUTER_R * 0.55, -OUTER_R * 0.55, RING_DEPTH * 1.6]}
      rotation={[0.7, 1.1, 0.4]}
    >
      <mesh material={mats.panel}>
        <boxGeometry args={[16, 1.1, 8]} />
      </mesh>
      <PlateGrid
        width={15}
        depth={7.2}
        cols={3}
        rows={2}
        material={mats.hull}
        raised={0.45}
      />
      <mesh position={[0, 0.2, 0]} rotation={[0.4, 0.2, 0.3]} material={mats.steel}>
        <boxGeometry args={[12, 0.55, 0.55]} />
      </mesh>
      <mesh position={[5, 1, -2]} material={mats.steel}>
        <boxGeometry args={[3, 2, 2]} />
      </mesh>
    </group>
  )
}

const ARC_VIOLET = new Color('#9a90ff')
const ARC_HOT = new Color('#eef4ff')
const ARC_POOL = 8
const ARC_SEGS = 14
const _arcA = new Vector3()
const _arcB = new Vector3()
const _arcDir = new Vector3()
const _arcN1 = new Vector3()
const _arcN2 = new Vector3()
const _arcTmp = new Vector3()

type AnchorPair = { ax: number; ay: number; az: number; bx: number; by: number; bz: number }

/** Build plausible spark endpoints across the plated ring members. */
function buildArcAnchors(modules: ModuleSpec[]): AnchorPair[] {
  const pairs: AnchorPair[] = []
  const n = modules.length
  for (let i = 0; i < n; i++) {
    const a = modules[i]!
    const b = modules[(i + 1) % n]!
    const c = modules[(i + 2) % n]!
    // Skip the missing-module gap — indices jump by more than one slot
    const gap1 = (b.i - a.i + MODULE_COUNT) % MODULE_COUNT
    const gap2 = (c.i - a.i + MODULE_COUNT) % MODULE_COUNT

    // Same-module radial: outer shell ↔ inner rail
    pairs.push({
      ax: a.ox * 0.98,
      ay: a.oy * 0.98,
      az: RING_DEPTH * 0.28,
      bx: a.ix * 1.02,
      by: a.iy * 1.02,
      bz: -RING_DEPTH * 0.22,
    })
    pairs.push({
      ax: a.ox * 0.97,
      ay: a.oy * 0.97,
      az: -RING_DEPTH * 0.3,
      bx: a.ix * 1.01,
      by: a.iy * 1.01,
      bz: RING_DEPTH * 0.3,
    })
    // Front spar ↔ back spar (mid chord)
    pairs.push({
      ax: a.cx,
      ay: a.cy,
      az: RING_DEPTH * 0.34,
      bx: a.cx,
      by: a.cy,
      bz: -RING_DEPTH * 0.34,
    })

    if (gap1 === 1) {
      // Neighbor outer chords
      pairs.push({
        ax: a.ox,
        ay: a.oy,
        az: RING_DEPTH * 0.2,
        bx: b.ox,
        by: b.oy,
        bz: -RING_DEPTH * 0.15,
      })
      // Neighbor inners
      pairs.push({
        ax: a.ix,
        ay: a.iy,
        az: -RING_DEPTH * 0.18,
        bx: b.ix,
        by: b.iy,
        bz: RING_DEPTH * 0.22,
      })
      // Cross brace: outer of A → inner of B
      pairs.push({
        ax: a.ox * 0.96,
        ay: a.oy * 0.96,
        az: RING_DEPTH * 0.1,
        bx: b.ix * 1.04,
        by: b.iy * 1.04,
        bz: -RING_DEPTH * 0.1,
      })
    }
    if (gap2 === 2) {
      pairs.push({
        ax: a.cx,
        ay: a.cy,
        az: RING_DEPTH * 0.4,
        bx: c.cx,
        by: c.cy,
        bz: -RING_DEPTH * 0.35,
      })
    }
  }
  return pairs
}

function writeLightningBolt(
  positions: Float32Array,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  seed: number,
) {
  _arcA.set(ax, ay, az)
  _arcB.set(bx, by, bz)
  _arcDir.subVectors(_arcB, _arcA)
  const len = _arcDir.length()
  if (len < 1e-4) {
    for (let i = 0; i <= ARC_SEGS; i++) {
      positions[i * 3] = ax
      positions[i * 3 + 1] = ay
      positions[i * 3 + 2] = az
    }
    return
  }
  _arcDir.multiplyScalar(1 / len)
  // Two stable perpendiculars for jagged offsets
  if (Math.abs(_arcDir.y) < 0.9) _arcN1.set(0, 1, 0)
  else _arcN1.set(1, 0, 0)
  _arcN1.cross(_arcDir).normalize()
  _arcN2.crossVectors(_arcDir, _arcN1).normalize()

  const jag = Math.min(2.8, len * 0.18)
  positions[0] = ax
  positions[1] = ay
  positions[2] = az
  for (let i = 1; i < ARC_SEGS; i++) {
    const t = i / ARC_SEGS
    // Envelope peaking mid-bolt so ends sit on the strut
    const envelope = Math.sin(t * Math.PI)
    const r1 = MathUtils.seededRandom(seed + i * 19.1) * 2 - 1
    const r2 = MathUtils.seededRandom(seed + i * 7.7 + 3.3) * 2 - 1
    // Occasional hard kink (branch feel)
    const kink =
      MathUtils.seededRandom(seed + i * 3.1) > 0.78 ? 1.65 : 1
    _arcTmp
      .copy(_arcA)
      .addScaledVector(_arcDir, len * t)
      .addScaledVector(_arcN1, r1 * jag * envelope * kink)
      .addScaledVector(_arcN2, r2 * jag * envelope * kink)
    positions[i * 3] = _arcTmp.x
    positions[i * 3 + 1] = _arcTmp.y
    positions[i * 3 + 2] = _arcTmp.z
  }
  positions[ARC_SEGS * 3] = bx
  positions[ARC_SEGS * 3 + 1] = by
  positions[ARC_SEGS * 3 + 2] = bz
}

type ArcSlot = {
  core: Line
  glow: Line
  life: number
  maxLife: number
  hot: boolean
  nextAt: number
  seed: number
}

/**
 * Random strut-to-strut lightning while the gate is charged — violet base with
 * intermittent white-hot flashes. Re-targets and re-jags on a short cadence.
 */
function GateChargeArcs({
  modules,
  active,
  paused,
}: {
  modules: ModuleSpec[]
  active: boolean
  paused: boolean
}) {
  const group = useRef<Group>(null!)
  const slotsRef = useRef<ArcSlot[] | null>(null)
  const anchors = useMemo(() => buildArcAnchors(modules), [modules])
  const clock = useRef(0)

  useLayoutEffect(() => {
    const g = group.current
    if (!g) return
    const slots: ArcSlot[] = []
    for (let i = 0; i < ARC_POOL; i++) {
      const coreGeo = new BufferGeometry()
      const glowGeo = new BufferGeometry()
      const verts = new Float32Array((ARC_SEGS + 1) * 3)
      const glowVerts = new Float32Array((ARC_SEGS + 1) * 3)
      coreGeo.setAttribute('position', new BufferAttribute(verts, 3))
      glowGeo.setAttribute('position', new BufferAttribute(glowVerts, 3))
      const coreMat = new LineBasicMaterial({
        color: ARC_VIOLET,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      })
      const glowMat = new LineBasicMaterial({
        color: ARC_VIOLET,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      })
      const core = new Line(coreGeo, coreMat)
      const glow = new Line(glowGeo, glowMat)
      core.renderOrder = 4
      glow.renderOrder = 3
      core.frustumCulled = false
      glow.frustumCulled = false
      g.add(glow)
      g.add(core)
      slots.push({
        core,
        glow,
        life: 0,
        maxLife: 0.12,
        hot: false,
        nextAt: Math.random() * 1.1,
        seed: i * 97.3 + 11,
      })
    }
      slotsRef.current = slots
    return () => {
      for (const s of slots) {
        g.remove(s.core)
        g.remove(s.glow)
        s.core.geometry.dispose()
        s.glow.geometry.dispose()
        ;(s.core.material as LineBasicMaterial).dispose()
        ;(s.glow.material as LineBasicMaterial).dispose()
      }
      slotsRef.current = null
    }
  }, [])

  useFrame((_, dt) => {
    const slots = slotsRef.current
    const g = group.current
    if (!slots || !g) return
    g.visible = active
    if (!active || paused) {
      for (const s of slots) {
        ;(s.core.material as LineBasicMaterial).opacity = 0
        ;(s.glow.material as LineBasicMaterial).opacity = 0
      }
      return
    }

    clock.current += dt
    const t = clock.current

    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]!
      const coreMat = s.core.material as LineBasicMaterial
      const glowMat = s.glow.material as LineBasicMaterial

      if (s.life <= 0 && t >= s.nextAt) {
        // Spawn a new bolt
        const pair = anchors[(Math.random() * anchors.length) | 0]!
        s.seed = Math.random() * 1000
        s.hot = Math.random() > 0.78
        s.maxLife = 0.05 + Math.random() * (s.hot ? 0.14 : 0.22)
        s.life = s.maxLife
        // Next cast — denser crackle when hot flashes stack
        s.nextAt = t + 0.14 + Math.random() * (s.hot ? 0.4 : 0.85)

        const corePos = s.core.geometry.attributes.position as BufferAttribute
        const glowPos = s.glow.geometry.attributes.position as BufferAttribute
        writeLightningBolt(
          corePos.array as Float32Array,
          pair.ax,
          pair.ay,
          pair.az,
          pair.bx,
          pair.by,
          pair.bz,
          s.seed,
        )
        // Slightly fatter mid-offset duplicate for the soft halo
        writeLightningBolt(
          glowPos.array as Float32Array,
          pair.ax,
          pair.ay,
          pair.az,
          pair.bx,
          pair.by,
          pair.bz,
          s.seed + 41.7,
        )
        corePos.needsUpdate = true
        glowPos.needsUpdate = true
        s.core.geometry.computeBoundingSphere()
        s.glow.geometry.computeBoundingSphere()

        const tint = s.hot ? ARC_HOT : ARC_VIOLET
        coreMat.color.copy(tint)
        glowMat.color.copy(s.hot ? ARC_HOT : ACCENT)
      }

      if (s.life > 0) {
        s.life -= dt
        // Re-jag mid-strike so the bolt crawls instead of freezing as a wire
        if (Math.random() > 0.62) {
          const corePos = s.core.geometry.attributes.position as BufferAttribute
          const arr = corePos.array as Float32Array
          const ax = arr[0]!
          const ay = arr[1]!
          const az = arr[2]!
          const bx = arr[ARC_SEGS * 3]!
          const by = arr[ARC_SEGS * 3 + 1]!
          const bz = arr[ARC_SEGS * 3 + 2]!
          s.seed += 1.7
          writeLightningBolt(arr, ax, ay, az, bx, by, bz, s.seed)
          corePos.needsUpdate = true
          const glowPos = s.glow.geometry.attributes.position as BufferAttribute
          writeLightningBolt(
            glowPos.array as Float32Array,
            ax,
            ay,
            az,
            bx,
            by,
            bz,
            s.seed + 17,
          )
          glowPos.needsUpdate = true
        }

        const u = Math.max(0, s.life / s.maxLife)
        // Sharp rise, flickering hold, abrupt cut
        const flicker =
          0.65 +
          Math.sin(t * (s.hot ? 90 : 55) + s.seed) * 0.22 +
          (Math.random() > 0.85 ? 0.35 : 0)
        const envelope = Math.pow(u, 0.35) * flicker
        coreMat.opacity = Math.min(1, envelope * (s.hot ? 1 : 0.85))
        glowMat.opacity = Math.min(0.55, envelope * (s.hot ? 0.45 : 0.28))
      } else {
        coreMat.opacity = 0
        glowMat.opacity = 0
      }
    }
  })

  return <group ref={group} />
}

const horizonVS = /* glsl */ `
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vLocal;
void main() {
  vLocal = position;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vNormal = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const horizonFS = /* glsl */ `
uniform float uTime;
uniform float uGlitch;
uniform float uRipple;
uniform vec3 uRim;
uniform vec3 uHot;
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vLocal;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(vViewDir);
  float ndv = max(dot(n, v), 0.0);
  float fresnel = pow(1.0 - ndv, 2.8);

  // Void core — near-black with a hint of deep indigo
  vec3 col = vec3(0.01, 0.008, 0.02);

  // Photon ring — bright thin band near the limb
  float ring = smoothstep(0.42, 0.72, fresnel) * smoothstep(0.98, 0.78, fresnel);
  col += uRim * (fresnel * 1.15 + ring * 2.4);
  col += uHot * ring * 0.55;

  // Slow crawling distortion on the rim
  float a = atan(n.y, n.x);
  float swirl = 0.55 + 0.45 * sin(a * 7.0 - uTime * 1.6 + n.z * 5.0);
  col += uRim * fresnel * swirl * 0.4;

  // Damaged gate: occasional flicker (dim + stutter) and a short ripple band
  float g = clamp(uGlitch, 0.0, 1.0);
  float r = clamp(uRipple, 0.0, 1.0);
  if (g > 0.001) {
    float stutter = 0.55 + 0.45 * step(0.35, fract(uTime * 28.0 + g * 4.0));
    float dim = mix(1.0, 0.22 * stutter, g);
    col *= dim;
    // Tear in the photon ring — hotter slash when the hiccup peaks
    float tear = abs(sin(a * 3.0 + uTime * 11.0)) * fresnel;
    col += uHot * tear * g * 0.85;
    col += uRim * fresnel * g * 0.35 * stutter;
  }
  if (r > 0.001) {
    float lat = atan(vLocal.z, vLocal.x);
    float elev = asin(clamp(vLocal.y / max(length(vLocal), 1e-4), -1.0, 1.0));
    float wave = sin(elev * 14.0 - uTime * 18.0 + lat * 2.0);
    float band = smoothstep(0.15, 0.85, abs(wave)) * fresnel;
    col += mix(uRim, uHot, 0.55) * band * r * 1.4;
    // Brief alpha wobble so the horizon looks like it loses integrity
    fresnel = mix(fresnel, fresnel * (0.7 + 0.3 * wave), r * 0.5);
  }

  // Keep the silhouette solid; rim blooms harder — soften a little during glitch
  float alpha = mix(1.0, 0.92, fresnel);
  alpha = mix(alpha, alpha * (0.72 + 0.28 * (1.0 - g)), g * 0.65);
  gl_FragColor = vec4(col, alpha);
}
`

const hazeFS = /* glsl */ `
uniform vec3 uColor;
uniform float uGlitch;
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
  float fresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0), 2.2);
  float g = clamp(uGlitch, 0.0, 1.0);
  float a = fresnel * mix(0.28, 0.08, g);
  gl_FragColor = vec4(uColor * fresnel * mix(1.0, 0.35, g), a);
}
`

type HorizonInstability = {
  /** Seconds until the next hiccup can start. */
  nextAt: number
  /** Remaining duration of the active hiccup. */
  life: number
  /** Total duration of the active hiccup. */
  maxLife: number
  /** Peak flicker strength 0–1. */
  strength: number
  /** 0 = flicker only; 1 = full ripple on peak. */
  ripple: number
}

/**
 * Powered-only event horizon in the gate throat — dark sphere with a photon
 * rim. Occasional flicker/ripple hiccups read as a damaged, unstable aperture.
 * Throat stays flyable; MisplantedGate detects entry separately.
 * Remounts with powered so GPU programs rebuild cleanly after a power cycle.
 */
function GateEventHorizon({ paused }: { paused: boolean }) {
  const phase = useRef(0)
  const root = useRef<Group>(null!)
  const lightRef = useRef<PointLight>(null!)
  const instability = useRef<HorizonInstability>({
    nextAt: 2.2 + Math.random() * 2.5,
    life: 0,
    maxLife: 0.28,
    strength: 0.75,
    ripple: 0.55,
  })
  const mats = useMemo(() => {
    const horizon = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uGlitch: { value: 0 },
        uRipple: { value: 0 },
        uRim: { value: new Color(COL_GLOW) },
        uHot: { value: new Color('#f0e8ff') },
      },
      vertexShader: horizonVS,
      fragmentShader: horizonFS,
      transparent: true,
      depthWrite: true,
      side: FrontSide,
      toneMapped: false,
    })
    const haze = new ShaderMaterial({
      uniforms: {
        uColor: { value: new Color(COL_ACCENT) },
        uGlitch: { value: 0 },
      },
      vertexShader: horizonVS,
      fragmentShader: hazeFS,
      transparent: true,
      depthWrite: false,
      side: BackSide,
      blending: AdditiveBlending,
      toneMapped: false,
    })
    return { horizon, haze }
  }, [])

  useLayoutEffect(
    () => () => {
      mats.horizon.dispose()
      mats.haze.dispose()
    },
    [mats],
  )

  useFrame((_, dt) => {
    if (paused) return
    const step = Math.min(dt, 0.05)
    phase.current += step
    const t = phase.current
    mats.horizon.uniforms.uTime!.value = t

    const st = instability.current
    if (st.life <= 0) {
      st.nextAt -= step
      if (st.nextAt <= 0) {
        // Short unstable gasp — mostly flicker; many also carry a ripple
        st.maxLife = 0.16 + Math.random() * 0.28
        st.life = st.maxLife
        st.strength = 0.55 + Math.random() * 0.45
        st.ripple = Math.random() > 0.38 ? 0.55 + Math.random() * 0.45 : 0
        st.nextAt = 2.8 + Math.random() * 5.5
      }
    }

    let glitch = 0
    let ripple = 0
    if (st.life > 0) {
      st.life -= step
      const u = Math.max(0, st.life / st.maxLife)
      // Sharp punch in, flickering hold, softer trail out
      const punch = Math.pow(1.0 - u, 0.35)
      const trail = Math.pow(u, 1.6)
      const envelope = Math.max(punch * 0.85, trail) * st.strength
      const micro =
        0.72 +
        0.28 * Math.sin(t * 55.0) +
        (Math.random() > 0.82 ? 0.35 : 0)
      glitch = Math.min(1, envelope * micro)
      // Ripple rides the peak of the hiccup, then dies before the flicker ends
      const peak = Math.sin(u * Math.PI)
      ripple = st.ripple * peak * peak * glitch
    }

    mats.horizon.uniforms.uGlitch!.value = glitch
    mats.horizon.uniforms.uRipple!.value = ripple
    mats.haze.uniforms.uGlitch!.value = glitch

    const g = root.current
    if (g) {
      // Subtle squash — reads as the aperture losing integrity without moving
      // the flyable throat center.
      const s = 1 + ripple * 0.045 - glitch * 0.02
      g.scale.setScalar(s)
    }
    const light = lightRef.current
    if (light) {
      light.intensity = 2.2 * (1 - glitch * 0.75) + ripple * 1.1
    }
  })

  return (
    <group ref={root}>
      {/* Visual-only throat — must not block the portal fly-through. */}
      <mesh
        scale={1.22}
        material={mats.haze}
        userData={{ noCollision: true }}
      >
        <sphereGeometry args={[PORTAL_RADIUS, 48, 32]} />
      </mesh>
      <mesh material={mats.horizon} userData={{ noCollision: true }}>
        <sphereGeometry args={[PORTAL_RADIUS, 64, 48]} />
      </mesh>
      <pointLight
        ref={lightRef}
        color="#a090ff"
        intensity={2.2}
        distance={70}
        decay={2}
        position={[0, 0, 0]}
      />
    </group>
  )
}

/**
 * Misplanted Nyx Transit counterpart — plated survey truss with a flyable throat.
 */
export function MisplantedGate({
  sunPosition,
  offset,
  playerRef,
  sightRange = 140,
  alreadySeen = false,
  onFirstSight,
  toast,
  paused = false,
  gateRef,
  hazardRef,
  powered = false,
  onPortalEnter,
  orbitAngularSpeed = 0,
  orbitInclination = 0,
}: MisplantedGateProps) {
  const root = useRef<Group>(null!)
  const yaw = useRef(0)
  const orbitPhase = useRef(0)
  const seenRef = useRef(alreadySeen)
  seenRef.current = alreadySeen
  const poweredRef = useRef(powered)
  poweredRef.current = powered
  const onPortalEnterRef = useRef(onPortalEnter)
  onPortalEnterRef.current = onPortalEnter
  const orbitSpeedRef = useRef(orbitAngularSpeed)
  orbitSpeedRef.current = orbitAngularSpeed
  const orbitInclRef = useRef(orbitInclination)
  orbitInclRef.current = orbitInclination
  /** Counts down before throat entry can fire (arrival grace + post-fire). */
  const portalArm = useRef(PORTAL_ARM_DELAY)
  const portalFired = useRef(false)
  const hullRef = useRef<HullCollider[]>([])

  const mats = useMemo(() => createGateMaterials(), [])

  const modules = useMemo(() => {
    const list: ModuleSpec[] = []
    const span = (Math.PI * 2) / MODULE_COUNT
    for (let i = 0; i < MODULE_COUNT; i++) {
      if (MISSING_MODULES.has(i)) continue
      const angle = i * span
      const mid = angle + span * 0.5
      const seed = MathUtils.seededRandom(i * 17.13 + 3.7)
      list.push({
        i,
        angle: mid,
        mid: span,
        cx: Math.cos(mid) * GATE_RING_RADIUS,
        cy: Math.sin(mid) * GATE_RING_RADIUS,
        ox: Math.cos(mid) * OUTER_R,
        oy: Math.sin(mid) * OUTER_R,
        ix: Math.cos(mid) * INNER_R,
        iy: Math.sin(mid) * INNER_R,
        hasPod: seed > 0.62,
        hasAntenna: seed > 0.78 || i % 7 === 0,
        hasClamp: i % 5 === 0,
      })
    }
    return list
  }, [])

  const spokes = useMemo(() => {
    const angles: number[] = []
    for (let i = 0; i < 8; i++) {
      if (i === 2 || i === 5) continue
      angles.push((i / 8) * Math.PI * 2 + 0.12)
    }
    return angles
  }, [])

  useLayoutEffect(
    () => () => {
      mats.hull.dispose()
      mats.panel.dispose()
      mats.trim.dispose()
      mats.steel.dispose()
      for (const t of mats.textures) t.dispose()
    },
    [mats],
  )

  useLayoutEffect(() => {
    const group = root.current
    if (!group) return
    // Opaque truss only — portal veil / glows filtered out by isSolidHullMesh.
    hullRef.current = buildHullColliders(group)
  }, [mats, modules, spokes])

  useLayoutEffect(() => {
    if (!hazardRef) return
    hazardRef.current = createMeshHazardField({
      getRoot: () => root.current,
      getHull: () => hullRef.current,
    })
    return () => {
      hazardRef.current = null
    }
  }, [hazardRef])

  // Warm / cool the lattice when the siphon ring comes online.
  // Keep emissive modest so directional light still sculpts plating.
  useLayoutEffect(() => {
    mats.hull.emissiveIntensity = powered ? 0.14 : 0.04
    mats.panel.emissiveIntensity = powered ? 0.18 : 0.05
    mats.trim.emissiveIntensity = powered ? 0.16 : 0.05
    mats.steel.emissiveIntensity = powered ? 0.1 : 0.06
  }, [powered, mats])

  useLayoutEffect(() => {
    const g = root.current
    if (!g) return
    g.rotation.order = 'YXZ'
    g.rotation.x = 0.62
    g.rotation.z = -0.38
  }, [])

  useFrame((_, dt) => {
    const group = root.current
    if (!group) return

    _sun.set(...sunPosition)
    const orbitSpeed = orbitSpeedRef.current
    if (orbitSpeed !== 0) {
      if (!paused) orbitPhase.current += dt * orbitSpeed
      const phase0 = Math.atan2(offset[2], offset[0])
      const r = Math.hypot(offset[0], offset[2])
      const theta = phase0 + orbitPhase.current
      _orbit.set(Math.cos(theta) * r, offset[1], Math.sin(theta) * r)
      const incl = orbitInclRef.current
      if (incl !== 0) _orbit.applyAxisAngle(_orbitTilt, incl)
      group.position.copy(_sun).add(_orbit)
    } else {
      group.position.set(
        _sun.x + offset[0],
        _sun.y + offset[1],
        _sun.z + offset[2],
      )
    }

    if (!paused) {
      const spinRate = poweredRef.current ? 0.085 : 0.014
      yaw.current += dt * spinRate
      group.rotation.y = yaw.current
    }

    if (paused) return
    const player = playerRef.current
    if (!player) return

    player.getWorldPosition(_player)

    if (!seenRef.current && toast && onFirstSight) {
      if (group.position.distanceTo(_player) < sightRange) {
        seenRef.current = true
        onFirstSight(toast)
      }
    }

    // Powered throat — fly the event horizon to slip into the matching gate.
    if (!poweredRef.current || !onPortalEnterRef.current || portalFired.current) {
      return
    }
    if (portalArm.current > 0) {
      portalArm.current -= dt
      return
    }
    group.updateWorldMatrix(true, false)
    _inv.copy(group.matrixWorld).invert()
    _local.copy(_player).applyMatrix4(_inv)
    if (_local.lengthSq() < PORTAL_ENTER_RADIUS * PORTAL_ENTER_RADIUS) {
      portalFired.current = true
      portalArm.current = PORTAL_ARM_DELAY
      onPortalEnterRef.current()
    }
  })

  return (
    <group
      ref={(node) => {
        root.current = node!
        if (gateRef) gateRef.current = node
      }}
    >
      {modules.map((spec) => (
        <RingModule key={spec.i} spec={spec} mats={mats} />
      ))}

      {spokes.map((angle, i) => {
        const len = INNER_R * 0.55
        const midR = INNER_R - len * 0.45
        return (
          <mesh
            key={`spoke-${i}`}
            position={[Math.cos(angle) * midR, Math.sin(angle) * midR, 0]}
            rotation={[0, 0, angle]}
            material={mats.steel}
          >
            <boxGeometry args={[len, 0.85, 0.85]} />
          </mesh>
        )
      })}

      <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.steel}>
        <torusGeometry args={[INNER_R * 0.42, 0.45, 6, 20, Math.PI * 1.35]} />
      </mesh>

      {modules
        .filter((m) => m.i % 4 === 0)
        .map((m) => (
          <mesh
            key={`chev-${m.i}`}
            position={[m.ix * 0.9, m.iy * 0.9, 0]}
            rotation={[0, 0, m.angle]}
          >
            <boxGeometry args={[0.25, 2.2, 0.25]} />
            <GlowMat opacity={0.5} />
          </mesh>
        ))}

      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[INNER_R * 0.55, INNER_R * 0.98, 48]} />
        <meshBasicMaterial
          color={COL_ACCENT}
          transparent
          opacity={powered ? 0.16 : 0.045}
          depthWrite={false}
          side={DoubleSide}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <ScaffoldArm mats={mats} />
      <DebrisChord mats={mats} />

      {powered && <GateEventHorizon paused={paused} />}

      <GateChargeArcs
        modules={modules}
        active={powered}
        paused={paused}
      />

      <pointLight
        color="#8a78ff"
        intensity={powered ? 3.4 : 1.55}
        distance={powered ? 200 : 120}
        decay={2}
        position={[0, 0, 0]}
      />
    </group>
  )
}
