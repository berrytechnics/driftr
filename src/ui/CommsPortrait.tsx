import { Center, useGLTF, useTexture } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  SRGBColorSpace,
  Vector3,
  type Group,
  type Mesh,
} from 'three'
import alienUrl from '@/assets/models/alien.glb?url'
import ashen from '@/assets/textures/planets/Ashen.webp'
import gaseous from '@/assets/textures/planets/Gaseous2.webp'
import martian from '@/assets/textures/planets/Martian.webp'
import tropical from '@/assets/textures/planets/Tropical.webp'
import {
  ALT_BELT_INNER,
  ALT_BELT_OUTER,
  ALT_INNER_ORBIT,
  ALT_MID_ORBIT,
  ALT_NYX_ORBIT,
  ALT_OUTER_ECC,
  ALT_OUTER_ORBIT,
  BELT_INNER,
  BELT_ORBIT,
  BELT_OUTER,
  GAS_ORBIT,
  INNER_ORBIT,
  MERCURY_ORBIT,
  MID_ORBIT,
  OUTER_DWARF_ECC,
  OUTER_DWARF_ORBIT,
  OUTER_GAS_ORBIT,
  STATION_NAMES,
} from '@/game/systemConfig'
import { NYX_ASK_LABEL, replyForNyxAsk } from '@/lore/easterEggs'
import {
  NYX_ORBIT_INCLINATION,
  NYX_ORBIT_PHASE,
} from '@/lore/NyxDerelict'
import { placeEllipticalOrbit } from '@/world/gravity'

const font = "'Share Tech Mono', ui-monospace, monospace"

/** Mesh faces +X in file space; yaw so it looks at a +Z camera. */
const FACE_CAMERA_Y = Math.PI / 2
/** Bust sit height — ~1ft below origin so the head frames in the video window. */
const ALIEN_BASE_Y = -0.3

/** Host body albedo + tint for each orbital outpost — tiny webps, not full Planet sim. */
const WINDOW_BY_STATION: Record<
  string,
  { map: string; tint: string; haze: string; hazeOpacity: number; spin: number }
> = {
  [STATION_NAMES.thalassa]: {
    map: tropical,
    tint: '#ffffff',
    haze: '#6ec8ff',
    hazeOpacity: 0.14,
    spin: 0.035,
  },
  [STATION_NAMES.ares]: {
    map: martian,
    tint: '#ffd0b0',
    haze: '#e09060',
    hazeOpacity: 0.14,
    spin: 0.04,
  },
  [STATION_NAMES.kronos]: {
    map: gaseous,
    tint: '#ffe8c8',
    haze: '#c8a070',
    hazeOpacity: 0.14,
    spin: 0.055,
  },
  /** Stark ash world — not a body charted in this system. Empty cabin cam. */
  [STATION_NAMES.nyx]: {
    map: ashen,
    tint: '#c8c4bc',
    haze: '#8a8880',
    hazeOpacity: 0.06,
    spin: 0.018,
  },
}

function windowForStation(stationName: string) {
  return WINDOW_BY_STATION[stationName] ?? WINDOW_BY_STATION[STATION_NAMES.thalassa]
}

function CameraLookAt({
  x = 0,
  y = 0,
  z = 0,
}: {
  x?: number
  y?: number
  z?: number
}) {
  const { camera } = useThree()
  useEffect(() => {
    camera.lookAt(x, y, z)
  }, [camera, x, y, z])
  return null
}

/** Sparse backdrop stars — fixed points, far behind the window. */
function WindowStars({ cold = false }: { cold?: boolean }) {
  const positions = useMemo(() => {
    const n = cold ? 320 : 280
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 14 + Math.random() * 10
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      arr[i * 3 + 2] = r * Math.cos(phi) - 6
    }
    return arr
  }, [cold])

  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={cold ? 0.04 : 0.045}
        color={cold ? '#d0ccc0' : '#c8e0ff'}
        sizeAttenuation
        transparent
        opacity={cold ? 0.7 : 0.8}
        depthWrite={false}
      />
    </points>
  )
}

/** Station-relative view of the host world — sphere + haze, no orbit physics. */
function StationWindow({
  stationName,
  emptyCabin = false,
}: {
  stationName: string
  emptyCabin?: boolean
}) {
  const cfg = windowForStation(stationName)
  const map = useTexture(cfg.map)
  map.colorSpace = SRGBColorSpace
  const planet = useRef<Mesh>(null)

  useFrame((_, dt) => {
    if (planet.current) planet.current.rotation.y += dt * cfg.spin
  })

  return (
    <group
      position={emptyCabin ? [0.4, -0.95, -4.7] : [0.55, -0.85, -4.4]}
      rotation={emptyCabin ? [0.1, -0.28, 0.03] : [0.12, -0.35, 0.04]}
      scale={emptyCabin ? 1.08 : 1}
    >
      <mesh scale={1.055}>
        <sphereGeometry args={[2.35, 32, 32]} />
        <meshBasicMaterial
          color={cfg.haze}
          transparent
          opacity={cfg.hazeOpacity}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={planet}>
        <sphereGeometry args={[2.35, 48, 48]} />
        <meshStandardMaterial
          map={map}
          color={cfg.tint}
          roughness={emptyCabin ? 0.92 : 0.88}
          metalness={0.04}
        />
      </mesh>
    </group>
  )
}

/** Apoapsis of Nyx’s ellipse — Sol world units, before portrait scale. */
const TRANSIT_APO =
  OUTER_DWARF_ORBIT * (1 + OUTER_DWARF_ECC)
/** Fit far apo into the small ATC canvas while keeping relative spacing. */
const SOL_DIORAMA_SCALE = 7.4 / TRANSIT_APO

const _dioramaSun = new Vector3(0, 0, 0)
const _dioramaPos = new Vector3()
const _dioramaVel = new Vector3()

function orbitPoint(
  radius: number,
  phase: number,
  inclination = 0,
  eccentricity = 0,
  startFrac = 0,
) {
  placeEllipticalOrbit(
    _dioramaPos,
    _dioramaVel,
    _dioramaSun,
    radius,
    eccentricity,
    1,
    phase,
    inclination,
    startFrac,
  )
  return _dioramaPos.clone().multiplyScalar(SOL_DIORAMA_SCALE)
}

/**
 * Live window feed through Nyx Transit’s external cam — Sol system + belt,
 * looking sunward from the ghost apo pad (not the Ashen/Nyx body here).
 */
function SolFromTransitWindow() {
  const { camera } = useThree()
  const camWorld = useMemo(
    () =>
      orbitPoint(
        OUTER_DWARF_ORBIT,
        NYX_ORBIT_PHASE,
        NYX_ORBIT_INCLINATION,
        OUTER_DWARF_ECC,
        1,
      ),
    [],
  )

  const bodies = useMemo(
    () => [
      {
        key: 'hermes',
        pos: orbitPoint(MERCURY_ORBIT, 4.2),
        size: 0.028,
        color: '#c4b090',
      },
      {
        key: 'ares',
        pos: orbitPoint(INNER_ORBIT, 0.4, 0.06),
        size: 0.038,
        color: '#d08050',
      },
      {
        key: 'boreas',
        pos: orbitPoint(MID_ORBIT, 2.8, -0.08),
        size: 0.042,
        color: '#d0e4f0',
      },
      {
        key: 'thalassa',
        pos: orbitPoint(BELT_ORBIT, 5.1, 0.05),
        size: 0.048,
        color: '#6eb8a8',
      },
      {
        key: 'kronos',
        pos: orbitPoint(GAS_ORBIT, 1.3, -0.04),
        size: 0.1,
        color: '#e0c090',
      },
      {
        key: 'ouranos',
        pos: orbitPoint(OUTER_GAS_ORBIT, 3.7, 0.1),
        size: 0.12,
        color: '#88b8d8',
      },
      {
        key: 'nyx',
        pos: orbitPoint(
          OUTER_DWARF_ORBIT,
          NYX_ORBIT_PHASE,
          NYX_ORBIT_INCLINATION,
          OUTER_DWARF_ECC,
          0.8,
        ),
        size: 0.022,
        color: '#c8b8d4',
      },
    ],
    [],
  )

  const belt = useMemo(() => {
    const n = 720
    const arr = new Float32Array(n * 3)
    const inner = BELT_INNER * SOL_DIORAMA_SCALE
    const outer = BELT_OUTER * SOL_DIORAMA_SCALE
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.04
      const r = inner + Math.random() * (outer - inner)
      const y = (Math.random() - 0.5) * 0.09
      arr[i * 3] = Math.cos(a) * r
      arr[i * 3 + 1] = y
      arr[i * 3 + 2] = Math.sin(a) * r
    }
    return arr
  }, [])

  const stars = useMemo(() => {
    const n = 380
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 11 + Math.random() * 8
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      arr[i * 3 + 2] = r * Math.cos(phi)
    }
    return arr
  }, [])

  useFrame(({ clock }) => {
    // Slight pad drift so the link reads live — stay sunward.
    const t = clock.elapsedTime
    const bob = Math.sin(t * 0.11) * 0.012
    camera.position.set(
      camWorld.x + bob * 0.4,
      camWorld.y + 0.18 + bob,
      camWorld.z + Math.cos(t * 0.09) * 0.01,
    )
    camera.lookAt(0, 0.05, 0)
  })

  return (
    <group>
      <points frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[stars, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.035}
          color="#c8e0ff"
          sizeAttenuation
          transparent
          opacity={0.75}
          depthWrite={false}
        />
      </points>

      <pointLight position={[0, 0, 0]} intensity={2.8} distance={14} decay={2} color="#fff1d0" />
      <ambientLight intensity={0.12} />

      {/* Sol */}
      <mesh>
        <sphereGeometry args={[0.26, 32, 32]} />
        <meshBasicMaterial color="#ffe8a8" />
      </mesh>
      <mesh scale={1.55}>
        <sphereGeometry args={[0.26, 24, 24]} />
        <meshBasicMaterial
          color="#ffc060"
          transparent
          opacity={0.22}
          depthWrite={false}
        />
      </mesh>

      {/* Asteroid belt band */}
      <points frustumCulled={false} rotation={[0.05, 0, 0]}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[belt, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.018}
          color="#c8b090"
          sizeAttenuation
          transparent
          opacity={0.85}
          depthWrite={false}
        />
      </points>

      {bodies.map((b) => (
        <mesh key={b.key} position={b.pos.toArray()}>
          <sphereGeometry args={[b.size, 16, 16]} />
          <meshStandardMaterial
            color={b.color}
            roughness={0.72}
            metalness={0.08}
            emissive={b.color}
            emissiveIntensity={0.08}
          />
        </mesh>
      ))}
    </group>
  )
}

/** Fit compact Vesper chart into the ATC canvas. */
const VESPER_DIORAMA_SCALE = 7.4 / ALT_OUTER_ORBIT

function altOrbitPoint(
  radius: number,
  phase: number,
  inclination = 0,
  eccentricity = 0,
  startFrac = 0,
) {
  placeEllipticalOrbit(
    _dioramaPos,
    _dioramaVel,
    _dioramaSun,
    radius,
    eccentricity,
    1,
    phase,
    inclination,
    startFrac,
  )
  return _dioramaPos.clone().multiplyScalar(VESPER_DIORAMA_SCALE)
}

/**
 * External cam from the cold tug — Vesper + catalog worlds, empty seat.
 * Camera sits near the free-floating hull offset used in alt space.
 */
function VesperFromTugWindow() {
  const { camera } = useThree()
  // Matches NyxAltSpace TUG_OFFSET scaled into the diorama.
  const camWorld = useMemo(
    () =>
      new Vector3(380, 28, 90).multiplyScalar(VESPER_DIORAMA_SCALE),
    [],
  )

  const bodies = useMemo(
    () => [
      {
        key: 'v1',
        pos: altOrbitPoint(ALT_INNER_ORBIT, 0.55, 0.06),
        size: 0.055,
        color: '#b8b49a',
      },
      {
        key: 'v2',
        pos: altOrbitPoint(ALT_MID_ORBIT, 4.1, -0.11),
        size: 0.07,
        color: '#a898a0',
      },
      {
        key: 'nyx',
        pos: altOrbitPoint(ALT_NYX_ORBIT, 1.4, 0.08),
        size: 0.042,
        color: '#c8c4bc',
      },
      {
        key: 'v3',
        pos: altOrbitPoint(ALT_OUTER_ORBIT, 3.7, 0.16, ALT_OUTER_ECC),
        size: 0.085,
        color: '#8a92a0',
      },
    ],
    [],
  )

  const belt = useMemo(() => {
    const n = 480
    const arr = new Float32Array(n * 3)
    const inner = ALT_BELT_INNER * VESPER_DIORAMA_SCALE
    const outer = ALT_BELT_OUTER * VESPER_DIORAMA_SCALE
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.05
      const r = inner + Math.random() * (outer - inner)
      const y = (Math.random() - 0.5) * 0.11
      arr[i * 3] = Math.cos(a) * r
      arr[i * 3 + 1] = y
      arr[i * 3 + 2] = Math.sin(a) * r
    }
    return arr
  }, [])

  const stars = useMemo(() => {
    const n = 360
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 11 + Math.random() * 8
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      arr[i * 3 + 2] = r * Math.cos(phi)
    }
    return arr
  }, [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const bob = Math.sin(t * 0.09) * 0.014
    camera.position.set(
      camWorld.x + bob * 0.35,
      camWorld.y + 0.12 + bob,
      camWorld.z + Math.cos(t * 0.07) * 0.012,
    )
    camera.lookAt(0, 0.04, 0)
  })

  return (
    <group>
      <points frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[stars, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.032}
          color="#c0b8d8"
          sizeAttenuation
          transparent
          opacity={0.72}
          depthWrite={false}
        />
      </points>

      <pointLight
        position={[0, 0, 0]}
        intensity={2.2}
        distance={14}
        decay={2}
        color="#a090ff"
      />
      <ambientLight intensity={0.14} color="#6a78a8" />

      {/* Vesper */}
      <mesh>
        <sphereGeometry args={[0.16, 32, 32]} />
        <meshBasicMaterial color="#8a7cff" />
      </mesh>
      <mesh scale={1.7}>
        <sphereGeometry args={[0.16, 24, 24]} />
        <meshBasicMaterial
          color="#5040a8"
          transparent
          opacity={0.28}
          depthWrite={false}
        />
      </mesh>

      <points frustumCulled={false} rotation={[0.08, 0, 0]}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[belt, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.02}
          color="#7a7090"
          sizeAttenuation
          transparent
          opacity={0.8}
          depthWrite={false}
        />
      </points>

      {bodies.map((b) => (
        <mesh key={b.key} position={b.pos.toArray()}>
          <sphereGeometry args={[b.size, 16, 16]} />
          <meshStandardMaterial
            color={b.color}
            roughness={0.78}
            metalness={0.06}
            emissive={b.color}
            emissiveIntensity={0.06}
          />
        </mesh>
      ))}
    </group>
  )
}

function AlienFeed() {
  const idle = useRef<Group>(null)
  const { scene } = useGLTF(alienUrl, true, true)
  const model = useMemo(() => {
    const cloned = scene.clone(true)
    cloned.traverse((child) => {
      const mesh = child as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = false
      mesh.receiveShadow = false
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => m.clone())
      } else if (mesh.material) {
        mesh.material = mesh.material.clone()
      }
    })
    return cloned
  }, [scene])

  useFrame(({ clock }) => {
    const g = idle.current
    if (!g) return
    const t = clock.elapsedTime
    // Subtle live-feed motion — keep amplitudes small so the bust stays framed
    g.position.y = ALIEN_BASE_Y + Math.sin(t * 1.05) * 0.006
    g.rotation.y = Math.sin(t * 0.38) * 0.035
    g.rotation.x = Math.sin(t * 0.55) * 0.012
    g.rotation.z = Math.sin(t * 0.28) * 0.006
    const breathe = 1 + Math.sin(t * 1.4) * 0.005
    g.scale.setScalar(breathe)
  })

  return (
    <group ref={idle} position={[0, ALIEN_BASE_Y, 0.15]}>
      {/* Orient first, then Center so the camera-facing AABB sits at origin */}
      <Center precise>
        <group rotation={[0, FACE_CAMERA_Y, 0]}>
          <primitive object={model} scale={1.25} />
        </group>
      </Center>
    </group>
  )
}

function LinkingFallback() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(0, 10, 18, 0.92)',
        color: 'rgba(160, 200, 230, 0.55)',
        fontSize: 11,
        letterSpacing: '0.18em',
        fontFamily: font,
      }}
    >
      LINKING…
    </div>
  )
}

type CommsPortraitProps = {
  stationName?: string
  /** Natural Nyx clue found — show Ask about Nyx. */
  nyxTopicUnlocked?: boolean
  /** Kronos ATC already granted the Hyperion lead. */
  nyxHyperionLead?: boolean
  /** Already heard Nyx’s outer-arc whisper. */
  nyxWhisperHeard?: boolean
  /** Saw the apo ghost pad — unlocks the clearer belt-dust follow-up at Kronos. */
  nyxDerelictSeen?: boolean
  /** Called the first time Kronos grants the Hyperion lead. */
  onKronosLead?: () => void
}

/** Live ATC video window — alien bust over a station-window view of the host world. */
export function CommsPortrait({
  stationName = STATION_NAMES.thalassa,
  nyxTopicUnlocked = false,
  nyxHyperionLead = false,
  nyxWhisperHeard = false,
  nyxDerelictSeen = false,
  onKronosLead,
}: CommsPortraitProps) {
  const [reply, setReply] = useState<string | null>(null)
  const isTug = stationName === STATION_NAMES.nyxTug
  /** Nyx Transit — live external window cam, cabin empty, uncatalogued body. */
  const emptyCabin = stationName === STATION_NAMES.nyx || isTug
  /**
   * System overview feed, empty seat — Nyx Station (Sol chart) or cold tug
   * (current Vesper chart).
   */
  const systemFeed =
    stationName === STATION_NAMES.nyxAlt || isTug
  const showNyxAsk =
    nyxTopicUnlocked && !emptyCabin && !systemFeed

  useEffect(() => {
    setReply(null)
  }, [stationName])

  const askNyx = () => {
    const result = replyForNyxAsk(
      stationName,
      nyxHyperionLead,
      nyxWhisperHeard,
      nyxDerelictSeen,
    )
    setReply(result.text)
    if (result.givesLead) onKronosLead?.()
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 280,
        marginBottom: 18,
        border: emptyCabin
          ? '1px solid rgba(140, 130, 110, 0.38)'
          : '1px solid rgba(120, 190, 230, 0.35)',
        background: emptyCabin ? 'rgba(6, 6, 5, 0.88)' : 'rgba(0, 6, 12, 0.85)',
        boxShadow: emptyCabin
          ? 'inset 0 0 40px rgba(24, 20, 12, 0.4)'
          : 'inset 0 0 40px rgba(0, 40, 70, 0.35)',
        overflow: 'hidden',
        fontFamily: font,
      }}
    >
      <style>{`
        @keyframes commsLiveBlink {
          0%, 55% { opacity: 1; }
          60%, 100% { opacity: 0.25; }
        }
        @keyframes commsFlicker {
          0%, 92%, 100% { opacity: 0.09; }
          93% { opacity: 0.2; }
          95% { opacity: 0.04; }
          97% { opacity: 0.16; }
        }
        @keyframes commsScan {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(320%); }
        }
        .comms-ask-btn:hover {
          background: rgba(120, 210, 255, 0.32) !important;
          color: #f0f8ff !important;
          border-color: rgba(160, 230, 255, 0.95) !important;
          box-shadow: inset 0 0 0 1px rgba(180, 230, 255, 0.35),
            0 0 16px rgba(100, 190, 255, 0.35) !important;
        }
        @keyframes commsAskPulse {
          0%, 100% { box-shadow: inset 0 0 0 1px rgba(120, 210, 255, 0.25), 0 0 10px rgba(90, 180, 255, 0.2); }
          50% { box-shadow: inset 0 0 0 1px rgba(160, 230, 255, 0.45), 0 0 18px rgba(100, 200, 255, 0.4); }
        }
      `}</style>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '7px 10px',
          borderBottom: emptyCabin
            ? '1px solid rgba(140, 130, 110, 0.22)'
            : '1px solid rgba(120, 190, 230, 0.22)',
          fontSize: 10,
          letterSpacing: '0.16em',
          color: emptyCabin
            ? 'rgba(170, 160, 140, 0.7)'
            : 'rgba(160, 200, 230, 0.7)',
          background: emptyCabin
            ? 'rgba(12, 11, 9, 0.92)'
            : 'rgba(0, 12, 22, 0.9)',
        }}
      >
        <span>{emptyCabin ? 'WIN · EXT CAM' : 'COM · CH-7 ATC'}</span>
        <span
          style={{
            color: emptyCabin ? '#c8b890' : '#7ec8ff',
            animation: 'commsLiveBlink 1.8s step-end infinite',
          }}
        >
          ● LIVE
        </span>
      </div>

      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '4 / 3',
          background: emptyCabin ? '#050504' : '#02080e',
        }}
      >
        <Suspense fallback={<LinkingFallback />}>
          <Canvas
            dpr={[1, 1.35]}
            camera={{
              position: systemFeed ? [0, 0.2, 8] : [0, 0.05, 1.95],
              fov: systemFeed ? 38 : 30,
              near: 0.05,
              far: systemFeed ? 28 : 40,
            }}
            gl={{ antialias: true, alpha: false, powerPreference: 'low-power' }}
            style={{ width: '100%', height: '100%', display: 'block' }}
          >
            <color
              attach="background"
              args={[
                isTug
                  ? '#03020a'
                  : emptyCabin
                    ? '#030302'
                    : '#02060c',
              ]}
            />
            {systemFeed ? (
              isTug ? <VesperFromTugWindow /> : <SolFromTransitWindow />
            ) : (
              <>
                <CameraLookAt y={emptyCabin ? -0.1 : -0.04} />
                <ambientLight intensity={emptyCabin ? 0.22 : 0.28} />
                {/* Warm "Sol" key — lights the planet limb like an orbital window */}
                <directionalLight
                  position={emptyCabin ? [4.8, 2.0, -2.4] : [5, 2.5, -2]}
                  intensity={emptyCabin ? 2.1 : 2.4}
                  color={emptyCabin ? '#e8e4d8' : '#fff1d6'}
                />
                {!emptyCabin && (
                  <>
                    {/* Cool fill on the bust */}
                    <directionalLight
                      position={[-2.2, 1.6, 3.2]}
                      intensity={0.55}
                      color="#9ec8ef"
                    />
                    <directionalLight
                      position={[1.8, 2.4, 2.8]}
                      intensity={0.7}
                      color="#e8f2ff"
                    />
                    <spotLight
                      position={[0, 1.4, 2.2]}
                      angle={0.45}
                      penumbra={0.7}
                      intensity={0.4}
                      color="#a8d4ff"
                    />
                  </>
                )}
                {emptyCabin && (
                  <directionalLight
                    position={[-1.5, 0.8, 2]}
                    intensity={0.25}
                    color="#a8a090"
                  />
                )}
                <WindowStars cold={emptyCabin} />
                <StationWindow
                  stationName={stationName}
                  emptyCabin={emptyCabin}
                />
                {!emptyCabin && <AlienFeed />}
              </>
            )}
          </Canvas>
        </Suspense>

        {/* CRT scanlines + rare flicker for "on video" */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            opacity: 0.14,
            background:
              'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.5) 2px, rgba(0,0,0,0.5) 4px)',
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              height: '28%',
              background: emptyCabin
                ? 'linear-gradient(180deg, transparent, rgba(180, 160, 110, 0.06), transparent)'
                : 'linear-gradient(180deg, transparent, rgba(120, 200, 255, 0.08), transparent)',
              animation: 'commsScan 4.8s linear infinite',
            }}
          />
        </div>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: emptyCabin
              ? 'radial-gradient(ellipse 70% 65% at 50% 48%, transparent 35%, rgba(0,0,0,0.58) 100%)'
              : 'radial-gradient(ellipse 70% 65% at 50% 45%, transparent 40%, rgba(0,0,0,0.55) 100%)',
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: emptyCabin
              ? 'rgba(180, 160, 100, 0.035)'
              : 'rgba(120, 200, 255, 0.04)',
            animation: 'commsFlicker 6.5s step-end infinite',
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '6px 10px',
          borderTop: emptyCabin
            ? '1px solid rgba(140, 130, 110, 0.18)'
            : '1px solid rgba(120, 190, 230, 0.18)',
          fontSize: 9,
          letterSpacing: '0.14em',
          color: emptyCabin
            ? 'rgba(150, 140, 120, 0.45)'
            : 'rgba(160, 200, 230, 0.45)',
          background: emptyCabin
            ? 'rgba(10, 9, 7, 0.94)'
            : 'rgba(0, 10, 18, 0.92)',
        }}
      >
        <span>ENC · QPSK</span>
        <span>LAT 38ms</span>
      </div>

      {showNyxAsk && (
        <div
          style={{
            borderTop: '1px solid rgba(120, 210, 255, 0.4)',
            background:
              'linear-gradient(180deg, rgba(20, 48, 72, 0.95) 0%, rgba(0, 12, 22, 0.98) 100%)',
            padding: '10px 10px 12px',
          }}
        >
          <div
            style={{
              fontSize: 9,
              letterSpacing: '0.18em',
              color: 'rgba(140, 210, 255, 0.7)',
              marginBottom: 7,
              textTransform: 'uppercase',
            }}
          >
            Incoming query
          </div>
          <button
            type="button"
            className="comms-ask-btn"
            onClick={askNyx}
            style={{
              appearance: 'none',
              width: '100%',
              border: '1px solid rgba(140, 220, 255, 0.85)',
              background: 'rgba(90, 190, 255, 0.22)',
              color: '#e8f6ff',
              padding: '11px 12px',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              fontFamily: font,
              cursor: 'pointer',
              animation: 'commsAskPulse 2.4s ease-in-out infinite',
            }}
          >
            ▸ {NYX_ASK_LABEL}
          </button>
          {reply && (
            <p
              style={{
                margin: '10px 0 0',
                fontSize: 11,
                lineHeight: 1.45,
                letterSpacing: '0.04em',
                color: 'rgba(200, 220, 240, 0.88)',
                fontStyle: 'italic',
              }}
            >
              {reply}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

useGLTF.preload(alienUrl, true, true)
