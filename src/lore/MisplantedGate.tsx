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
  RepeatWrapping,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  type Object3D,
  type Texture,
} from 'three'
import type { HazardField } from '@/ship/PlayerShip'

/** Centerline of the truss ring (world units). */
export const GATE_RING_RADIUS = 42
/** Approximate “tube” depth for map sizing / placement. */
export const GATE_TUBE_RADIUS = 9
/** Map pip / guide size. */
export const GATE_MAP_SIZE = 48

const MODULE_COUNT = 32
const MISSING_MODULES = new Set([4, 5, 6, 19, 20])

const INNER_R = 33
const OUTER_R = 51
const RING_DEPTH = 11
const _sun = new Vector3()
const _player = new Vector3()

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
}

type LocalSphere = { x: number; y: number; z: number; r: number }

const _local = new Vector3()
const _inv = new Matrix4()
const _from = new Vector3()
const _to = new Vector3()
const _ab = new Vector3()
const _ac = new Vector3()

/** Colliders hug every opaque member — throat + translucent veil stay open. */
function buildGateColliders(): LocalSphere[] {
  const spheres: LocalSphere[] = []
  const span = (Math.PI * 2) / MODULE_COUNT

  const push = (x: number, y: number, z: number, r: number) => {
    spheres.push({ x, y, z, r })
  }

  /** Beads along a segment (inclusive ends). */
  const chain = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    r: number,
    steps: number,
  ) => {
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      push(
        ax + (bx - ax) * t,
        ay + (by - ay) * t,
        az + (bz - az) * t,
        r,
      )
    }
  }

  for (let i = 0; i < MODULE_COUNT; i++) {
    if (MISSING_MODULES.has(i)) continue
    const mid = i * span + span * 0.5
    const c = Math.cos(mid)
    const s = Math.sin(mid)
    const tx = -s
    const ty = c
    const outerLen = OUTER_R * span * 0.92
    const innerLen = INNER_R * span * 0.92
    const seed = MathUtils.seededRandom(i * 17.13 + 3.7)

    const ox = c * OUTER_R
    const oy = s * OUTER_R
    const ix = c * INNER_R
    const iy = s * INNER_R
    const mx = c * GATE_RING_RADIUS
    const my = s * GATE_RING_RADIUS

    // Outer armor shell + inset plates
    for (const zt of [-0.38, -0.12, 0.12, 0.38] as const) {
      for (const tt of [-0.35, 0, 0.35] as const) {
        push(
          ox + tx * outerLen * tt,
          oy + ty * outerLen * tt,
          RING_DEPTH * zt,
          1.42,
        )
      }
    }
    // Outer lip + pipe runs
    push(c * OUTER_R * 1.025, s * OUTER_R * 1.025, 0, 1.15)
    chain(
      ox + tx * outerLen * -0.4,
      oy + ty * outerLen * -0.4,
      RING_DEPTH * 0.28,
      ox + tx * outerLen * 0.4,
      oy + ty * outerLen * 0.4,
      RING_DEPTH * 0.28,
      0.55,
      2,
    )
    chain(
      ox + tx * outerLen * -0.4,
      oy + ty * outerLen * -0.4,
      -RING_DEPTH * 0.28,
      ox + tx * outerLen * 0.4,
      oy + ty * outerLen * 0.4,
      -RING_DEPTH * 0.28,
      0.5,
      2,
    )

    // Inner chord framing — denser so you can't slip through the rail
    for (const zt of [-0.34, -0.1, 0.1, 0.34] as const) {
      for (const tt of [-0.35, 0, 0.35] as const) {
        push(
          ix + tx * innerLen * tt,
          iy + ty * innerLen * tt,
          RING_DEPTH * zt,
          1.32,
        )
      }
    }

    // Radial spars (front / back) — beads along the strut
    chain(
      ix,
      iy,
      RING_DEPTH * 0.32,
      ox,
      oy,
      RING_DEPTH * 0.32,
      0.85,
      4,
    )
    chain(
      ix,
      iy,
      -RING_DEPTH * 0.32,
      ox,
      oy,
      -RING_DEPTH * 0.32,
      0.85,
      4,
    )
    // Mid flange on front spar
    push(mx, my, RING_DEPTH * 0.32, 1.15)

    // Diagonal cross-brace
    chain(
      ix * 0.95,
      iy * 0.95,
      -RING_DEPTH * 0.2,
      ox * 0.98,
      oy * 0.98,
      RING_DEPTH * 0.25,
      0.7,
      4,
    )

    // Side webbings (front / back faces of the bay)
    chain(
      ix,
      iy,
      RING_DEPTH * 0.5,
      ox,
      oy,
      RING_DEPTH * 0.5,
      0.7,
      3,
    )
    chain(
      ix,
      iy,
      -RING_DEPTH * 0.5,
      ox,
      oy,
      -RING_DEPTH * 0.5,
      0.65,
      3,
    )

    if (seed > 0.62) {
      push(c * OUTER_R * 1.09, s * OUTER_R * 1.09, RING_DEPTH * 0.12, 2.7)
      push(c * OUTER_R * 1.09, s * OUTER_R * 1.09, RING_DEPTH * 0.12 + 2.4, 1.5)
    }

    if (seed > 0.78 || i % 7 === 0) {
      // Antenna mast
      chain(
        c * OUTER_R * 1.05,
        s * OUTER_R * 1.05,
        -RING_DEPTH * 0.55,
        c * OUTER_R * 1.05,
        s * OUTER_R * 1.05,
        -RING_DEPTH * 0.55 - 7,
        0.55,
        3,
      )
    }

    if (i % 5 === 0) {
      push(c * INNER_R * 0.92, s * INNER_R * 0.92, 3.8, 1.6)
      push(c * INNER_R * 0.92, s * INNER_R * 0.92, 5.4, 1.35)
    }
  }

  // Incomplete hub spokes — beads along each spoke
  for (let i = 0; i < 8; i++) {
    if (i === 2 || i === 5) continue
    const angle = (i / 8) * Math.PI * 2 + 0.12
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    const len = INNER_R * 0.55
    const outerSpoke = INNER_R - 0.8
    const innerSpoke = INNER_R - len
    chain(
      c * outerSpoke,
      s * outerSpoke,
      0,
      c * innerSpoke,
      s * innerSpoke,
      0,
      0.8,
      3,
    )
  }

  // Stub hub collar (partial torus) — opaque framing near throat, not the veil
  {
    const hr = INNER_R * 0.42
    const arc = Math.PI * 1.35
    const steps = 14
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * arc
      push(Math.cos(a) * hr, Math.sin(a) * hr, 0, 0.85)
    }
  }

  // Scaffold arm
  chain(6, -OUTER_R * 0.9, RING_DEPTH + 1, 24, -OUTER_R * 0.95, RING_DEPTH + 3, 1.5, 5)
  chain(24, -OUTER_R * 0.95, RING_DEPTH + 3, 28, -OUTER_R * 1.1, RING_DEPTH + 5, 1.3, 3)
  push(28, -OUTER_R * 1.12, RING_DEPTH + 6, 2.3)

  // Debris chord
  push(OUTER_R * 0.55, -OUTER_R * 0.55, RING_DEPTH * 1.6, 4.0)
  push(OUTER_R * 0.62, -OUTER_R * 0.48, RING_DEPTH * 1.75, 2.4)
  push(OUTER_R * 0.48, -OUTER_R * 0.6, RING_DEPTH * 1.5, 2.1)

  return spheres
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

  // Base hull — charcoal with shard violet undertone
  cctx.fillStyle = '#1e1830'
  cctx.fillRect(0, 0, size, size)

  // Plate cells — subtle hue drift so starlight doesn’t flatten them to grey
  const cols = 5
  const rows = 4
  const pad = 6
  const cellW = (size - pad * (cols + 1)) / cols
  const cellH = (size - pad * (rows + 1)) / rows
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = pad + x * (cellW + pad)
      const py = pad + y * (cellH + pad)
      const n = (x * 17 + y * 29) % 100
      // Mostly cool violet hull, occasional deeper indigo / warmer ash-shard
      const r = 38 + (n % 14) + (n > 70 ? 10 : 0)
      const g = 32 + (n % 10)
      const b = 62 + (n % 22) + (n < 35 ? 12 : 0)
      cctx.fillStyle = `rgb(${r},${g},${b})`
      cctx.fillRect(px, py, cellW, cellH)

      // Bevel highlight / shadow
      cctx.strokeStyle = 'rgba(170,150,230,0.28)'
      cctx.lineWidth = 2
      cctx.beginPath()
      cctx.moveTo(px + 1, py + cellH - 1)
      cctx.lineTo(px + 1, py + 1)
      cctx.lineTo(px + cellW - 1, py + 1)
      cctx.stroke()
      cctx.strokeStyle = 'rgba(0,0,0,0.5)'
      cctx.beginPath()
      cctx.moveTo(px + cellW - 1, py + 1)
      cctx.lineTo(px + cellW - 1, py + cellH - 1)
      cctx.lineTo(px + 1, py + cellH - 1)
      cctx.stroke()

      // Micro hatch
      cctx.strokeStyle = 'rgba(120,100,200,0.14)'
      cctx.lineWidth = 1
      for (let h = 8; h < cellH - 6; h += 7) {
        cctx.beginPath()
        cctx.moveTo(px + 4, py + h)
        cctx.lineTo(px + cellW - 4, py + h)
        cctx.stroke()
      }

      // Rivets
      cctx.fillStyle = 'rgba(200,185,255,0.4)'
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
        cctx.fillStyle = 'rgba(0,0,0,0.35)'
        cctx.beginPath()
        cctx.arc(rx + 0.6, ry + 0.6, 1.1, 0, Math.PI * 2)
        cctx.fill()
        cctx.fillStyle = 'rgba(200,185,255,0.4)'
      }

      // Occasional shard-vein / ash stain
      if ((x + y * 3) % 7 === 0) {
        cctx.fillStyle = 'rgba(120,85,210,0.28)'
        cctx.fillRect(px + cellW * 0.2, py + cellH * 0.32, cellW * 0.55, 7)
      }
      if ((x * 5 + y) % 11 === 0) {
        cctx.strokeStyle = 'rgba(180,140,255,0.16)'
        cctx.lineWidth = 3
        cctx.beginPath()
        cctx.moveTo(px + 8, py + cellH * 0.7)
        cctx.lineTo(px + cellW - 10, py + cellH * 0.35)
        cctx.stroke()
      }
      if ((x + y) % 5 === 0) {
        cctx.fillStyle = 'rgba(55,40,95,0.35)'
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
  cctx.strokeStyle = 'rgba(0,0,0,0.55)'
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

  paintNoise(cctx, size, 0.45, 28)

  // Roughness: panels mid, seams rough, rivets smoother
  const rough = document.createElement('canvas')
  rough.width = size
  rough.height = size
  const rctx = rough.getContext('2d')!
  rctx.fillStyle = '#9a9a9a'
  rctx.fillRect(0, 0, size, size)
  rctx.strokeStyle = '#d0d0d0'
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
  paintNoise(rctx, size, 0.5, 40)

  // Bump from luminance of a height-like pass
  const bump = document.createElement('canvas')
  bump.width = size
  bump.height = size
  const bctx = bump.getContext('2d')!
  bctx.fillStyle = '#808080'
  bctx.fillRect(0, 0, size, size)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = pad + x * (cellW + pad)
      const py = pad + y * (cellH + pad)
      bctx.fillStyle = '#b0b0b0'
      bctx.fillRect(px + 2, py + 2, cellW - 4, cellH - 4)
      bctx.fillStyle = '#606060'
      bctx.fillRect(px, py, cellW, 2)
      bctx.fillRect(px, py, 2, cellH)
      bctx.fillStyle = '#d8d8d8'
      // rivet bumps
      for (const [rx, ry] of [
        [px + 5, py + 5],
        [px + cellW - 5, py + 5],
        [px + 5, py + cellH - 5],
        [px + cellW - 5, py + cellH - 5],
      ] as const) {
        bctx.beginPath()
        bctx.arc(rx, ry, 2.4, 0, Math.PI * 2)
        bctx.fill()
      }
    }
  }

  const map = new CanvasTexture(color)
  map.colorSpace = SRGBColorSpace
  map.wrapS = map.wrapT = RepeatWrapping
  map.anisotropy = 4
  map.repeat.set(2, 2)

  const roughnessMap = new CanvasTexture(rough)
  roughnessMap.wrapS = roughnessMap.wrapT = RepeatWrapping
  roughnessMap.anisotropy = 4
  roughnessMap.repeat.set(2, 2)

  const bumpMap = new CanvasTexture(bump)
  bumpMap.wrapS = bumpMap.wrapT = RepeatWrapping
  bumpMap.magFilter = NearestFilter
  bumpMap.anisotropy = 4
  bumpMap.repeat.set(2, 2)

  const shared = {
    map,
    roughnessMap,
    bumpMap,
    bumpScale: 0.55,
    // Lower env response so indigo starlight doesn’t bleach the shard tint
    envMapIntensity: 0.45,
  }

  const hull = new MeshStandardMaterial({
    color: '#9a8ec8',
    metalness: 0.58,
    roughness: 0.64,
    emissive: ACCENT,
    emissiveIntensity: 0.09,
    ...shared,
  })
  const panel = new MeshStandardMaterial({
    color: '#a898d8',
    metalness: 0.52,
    roughness: 0.68,
    emissive: ACCENT,
    emissiveIntensity: 0.12,
    ...shared,
  })
  // Slightly different tiling so trim does not mirror the big plates
  const trimMap = map.clone()
  trimMap.repeat.set(3.5, 1.2)
  const trimRough = roughnessMap.clone()
  trimRough.repeat.set(3.5, 1.2)
  const trimBump = bumpMap.clone()
  trimBump.repeat.set(3.5, 1.2)
  const trim = new MeshStandardMaterial({
    color: '#8e7ec0',
    metalness: 0.62,
    roughness: 0.55,
    emissive: ACCENT,
    emissiveIntensity: 0.11,
    map: trimMap,
    roughnessMap: trimRough,
    bumpMap: trimBump,
    bumpScale: 0.4,
    envMapIntensity: 0.5,
  })

  return {
    hull,
    panel,
    trim,
    textures: [map, roughnessMap, bumpMap, trimMap, trimRough, trimBump],
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
          material={mats.trim}
        >
          <cylinderGeometry args={[0.22, 0.22, outerLen * 0.9, 6]} />
        </mesh>
        <mesh
          position={[0, 1.15, -RING_DEPTH * 0.28]}
          rotation={[0, Math.PI / 2, 0]}
          material={mats.trim}
        >
          <cylinderGeometry args={[0.18, 0.18, outerLen * 0.85, 6]} />
        </mesh>
      </group>

      {/* Outer edge lip */}
      <mesh
        position={[ox * 1.025, oy * 1.025, 0]}
        rotation={[0, 0, angle + Math.PI / 2]}
        material={mats.trim}
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
        material={mats.trim}
      >
        <boxGeometry args={[radialLen * 0.35, 1.1, 1.1]} />
      </mesh>

      {/* Diagonal cross-brace */}
      <mesh
        position={[cx, cy, 0]}
        rotation={[0.55, 0, angle + mid * 0.15]}
        material={mats.trim}
      >
        <boxGeometry args={[radialLen * 1.05, 0.38, 0.38]} />
      </mesh>

      {/* Side webbings */}
      <mesh
        position={[cx, cy, RING_DEPTH * 0.5]}
        rotation={[0, 0, angle + Math.PI / 2]}
        material={mats.trim}
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
            material={mats.trim}
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
          <mesh position={[0, 0, 3.4]} rotation={[Math.PI / 2, 0, 0]} material={mats.trim}>
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
          <mesh rotation={[0.9, 0, angle]} material={mats.trim}>
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
          <mesh position={[0, 0, 5.4]} rotation={[0, 0, Math.PI / 5]} material={mats.hull}>
            <boxGeometry args={[0.45, 3.2, 0.45]} />
          </mesh>
          <mesh position={[0, 0, 5.4]} rotation={[0, 0, -Math.PI / 5]} material={mats.hull}>
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
      <mesh material={mats.trim}>
        <boxGeometry args={[28, 1.6, 1.6]} />
      </mesh>
      <mesh position={[12, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={mats.hull}>
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
      <mesh position={[0, 0.2, 0]} rotation={[0.4, 0.2, 0.3]} material={mats.trim}>
        <boxGeometry args={[12, 0.55, 0.55]} />
      </mesh>
      <mesh position={[5, 1, -2]} material={mats.trim}>
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

/** Clear throat radius — portal sits inside the spoke torus. */
const PORTAL_RADIUS = 12.5

const horizonVS = /* glsl */ `
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vNormal = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const horizonFS = /* glsl */ `
uniform float uTime;
uniform vec3 uRim;
uniform vec3 uHot;
varying vec3 vNormal;
varying vec3 vViewDir;
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

  // Keep the silhouette solid; rim blooms harder
  float alpha = mix(1.0, 0.92, fresnel);
  gl_FragColor = vec4(col, alpha);
}
`

const hazeFS = /* glsl */ `
uniform vec3 uColor;
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
  float fresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0), 2.2);
  float a = fresnel * 0.28;
  gl_FragColor = vec4(uColor * fresnel, a);
}
`

/**
 * Powered-only event horizon in the gate throat — dark sphere with a photon
 * rim. Visual only (throat stays flyable). Remounts with powered so GPU
 * programs rebuild cleanly after a power cycle.
 */
function GateEventHorizon({ paused }: { paused: boolean }) {
  const phase = useRef(0)
  const mats = useMemo(() => {
    const horizon = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
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
    mats.horizon.uniforms.uTime!.value = phase.current
  })

  return (
    <group>
      <mesh scale={1.22} material={mats.haze}>
        <sphereGeometry args={[PORTAL_RADIUS, 48, 32]} />
      </mesh>
      <mesh material={mats.horizon}>
        <sphereGeometry args={[PORTAL_RADIUS, 64, 48]} />
      </mesh>
      <pointLight
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
}: MisplantedGateProps) {
  const root = useRef<Group>(null!)
  const yaw = useRef(0)
  const seenRef = useRef(alreadySeen)
  seenRef.current = alreadySeen
  const poweredRef = useRef(powered)
  poweredRef.current = powered

  const mats = useMemo(() => createGateMaterials(), [])
  const colliders = useMemo(() => buildGateColliders(), [])

  useLayoutEffect(
    () => () => {
      mats.hull.dispose()
      mats.panel.dispose()
      mats.trim.dispose()
      for (const t of mats.textures) t.dispose()
    },
    [mats],
  )

  useLayoutEffect(() => {
    if (!hazardRef) return
    hazardRef.current = {
      test(point, pad) {
        const group = root.current
        if (!group) return false
        group.updateWorldMatrix(true, false)
        _inv.copy(group.matrixWorld).invert()
        _local.copy(point).applyMatrix4(_inv)
        return hitLocalSpheres(
          colliders,
          _local.x,
          _local.y,
          _local.z,
          pad,
        )
      },
      impact(point, pad) {
        const group = root.current
        if (!group) return false
        group.updateWorldMatrix(true, false)
        _inv.copy(group.matrixWorld).invert()
        _local.copy(point).applyMatrix4(_inv)
        return hitLocalSpheres(
          colliders,
          _local.x,
          _local.y,
          _local.z,
          pad,
        )
      },
      occludes(from, to) {
        const group = root.current
        if (!group) return false
        group.updateWorldMatrix(true, false)
        _inv.copy(group.matrixWorld).invert()
        _from.copy(from).applyMatrix4(_inv)
        _to.copy(to).applyMatrix4(_inv)
        _ab.subVectors(_to, _from)
        const abLen2 = _ab.lengthSq()
        if (abLen2 < 1e-8) return false
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
  }, [hazardRef, colliders])

  // Warm / cool the lattice when the siphon ring comes online.
  useLayoutEffect(() => {
    const boost = powered ? 0.38 : 0.09
    mats.hull.emissiveIntensity = boost
    mats.panel.emissiveIntensity = powered ? 0.48 : 0.12
    mats.trim.emissiveIntensity = powered ? 0.42 : 0.11
  }, [powered, mats])

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
    group.position.set(
      _sun.x + offset[0],
      _sun.y + offset[1],
      _sun.z + offset[2],
    )

    if (!paused) {
      const spinRate = poweredRef.current ? 0.085 : 0.014
      yaw.current += dt * spinRate
      group.rotation.y = yaw.current
    }

    if (paused) return
    const player = playerRef.current
    if (!player || seenRef.current || !toast || !onFirstSight) return
    player.getWorldPosition(_player)
    if (group.position.distanceTo(_player) < sightRange) {
      seenRef.current = true
      onFirstSight(toast)
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
            material={mats.trim}
          >
            <boxGeometry args={[len, 0.85, 0.85]} />
          </mesh>
        )
      })}

      <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.trim}>
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
