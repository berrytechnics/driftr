import { Center, useGLTF, useTexture } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  SRGBColorSpace,
  type Group,
  type Mesh,
} from 'three'
import alienUrl from '@/assets/models/alien.glb?url'
import gaseous from '@/assets/textures/planets/Gaseous2.webp'
import martian from '@/assets/textures/planets/Martian.webp'
import tropical from '@/assets/textures/planets/Tropical.webp'
import icy from '@/assets/textures/planets/Icy.webp'
import { STATION_NAMES } from '@/game/systemConfig'
import { NYX_ASK_LABEL, replyForNyxAsk } from '@/lore/easterEggs'

const font = "'Share Tech Mono', ui-monospace, monospace"

/** Mesh faces +X in file space; yaw so it looks at a +Z camera. */
const FACE_CAMERA_Y = Math.PI / 2
/** Bust sit height — ~1ft below origin so the head frames in the video window. */
const ALIEN_BASE_Y = -0.3

/** Host body albedo + tint for each orbital outpost — tiny webps, not full Planet sim. */
const WINDOW_BY_STATION: Record<
  string,
  { map: string; tint: string; haze: string; spin: number }
> = {
  [STATION_NAMES.thalassa]: {
    map: tropical,
    tint: '#ffffff',
    haze: '#6ec8ff',
    spin: 0.035,
  },
  [STATION_NAMES.ares]: {
    map: martian,
    tint: '#ffd0b0',
    haze: '#e09060',
    spin: 0.04,
  },
  [STATION_NAMES.kronos]: {
    map: gaseous,
    tint: '#ffe8c8',
    haze: '#c8a070',
    spin: 0.055,
  },
  [STATION_NAMES.nyx]: {
    map: icy,
    tint: '#d8c8e8',
    haze: '#a898c8',
    spin: 0.025,
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
function WindowStars() {
  const positions = useMemo(() => {
    const n = 280
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
  }, [])

  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.045}
        color="#c8e0ff"
        sizeAttenuation
        transparent
        opacity={0.8}
        depthWrite={false}
      />
    </points>
  )
}

/** Station-relative view of the host world — sphere + haze, no orbit physics. */
function StationWindow({ stationName }: { stationName: string }) {
  const cfg = windowForStation(stationName)
  const map = useTexture(cfg.map)
  map.colorSpace = SRGBColorSpace
  const planet = useRef<Mesh>(null)

  useFrame((_, dt) => {
    if (planet.current) planet.current.rotation.y += dt * cfg.spin
  })

  return (
    <group position={[0.55, -0.85, -4.4]} rotation={[0.12, -0.35, 0.04]}>
      {/* Soft limb / atmosphere */}
      <mesh scale={1.055}>
        <sphereGeometry args={[2.35, 32, 32]} />
        <meshBasicMaterial
          color={cfg.haze}
          transparent
          opacity={0.14}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={planet}>
        <sphereGeometry args={[2.35, 48, 48]} />
        <meshStandardMaterial
          map={map}
          color={cfg.tint}
          roughness={0.88}
          metalness={0.04}
        />
      </mesh>
    </group>
  )
}

function AlienFeed() {
  const idle = useRef<Group>(null)
  const { scene } = useGLTF(alienUrl)
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
  /** Called the first time Kronos grants the Hyperion lead. */
  onKronosLead?: () => void
}

/** Live ATC video window — alien bust over a station-window view of the host world. */
export function CommsPortrait({
  stationName = STATION_NAMES.thalassa,
  nyxTopicUnlocked = false,
  nyxHyperionLead = false,
  nyxWhisperHeard = false,
  onKronosLead,
}: CommsPortraitProps) {
  const [reply, setReply] = useState<string | null>(null)

  useEffect(() => {
    setReply(null)
  }, [stationName])

  const askNyx = () => {
    const result = replyForNyxAsk(
      stationName,
      nyxHyperionLead,
      nyxWhisperHeard,
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
        border: '1px solid rgba(120, 190, 230, 0.35)',
        background: 'rgba(0, 6, 12, 0.85)',
        boxShadow: 'inset 0 0 40px rgba(0, 40, 70, 0.35)',
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
          borderBottom: '1px solid rgba(120, 190, 230, 0.22)',
          fontSize: 10,
          letterSpacing: '0.16em',
          color: 'rgba(160, 200, 230, 0.7)',
          background: 'rgba(0, 12, 22, 0.9)',
        }}
      >
        <span>COM · CH-7 ATC</span>
        <span
          style={{
            color: '#7ec8ff',
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
          background: '#02080e',
        }}
      >
        <Suspense fallback={<LinkingFallback />}>
          <Canvas
            dpr={[1, 1.35]}
            camera={{ position: [0, 0.05, 1.95], fov: 30, near: 0.1, far: 40 }}
            gl={{ antialias: true, alpha: false, powerPreference: 'low-power' }}
            style={{ width: '100%', height: '100%', display: 'block' }}
          >
            <color attach="background" args={['#02060c']} />
            <CameraLookAt y={-0.04} />
            <ambientLight intensity={0.28} />
            {/* Warm "Sol" key — lights the planet limb like an orbital window */}
            <directionalLight
              position={[5, 2.5, -2]}
              intensity={2.4}
              color="#fff1d6"
            />
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
            <WindowStars />
            <StationWindow stationName={stationName} />
            <AlienFeed />
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
              background:
                'linear-gradient(180deg, transparent, rgba(120, 200, 255, 0.08), transparent)',
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
            background:
              'radial-gradient(ellipse 70% 65% at 50% 45%, transparent 40%, rgba(0,0,0,0.55) 100%)',
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: 'rgba(120, 200, 255, 0.04)',
            animation: 'commsFlicker 6.5s step-end infinite',
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '6px 10px',
          borderTop: '1px solid rgba(120, 190, 230, 0.18)',
          fontSize: 9,
          letterSpacing: '0.14em',
          color: 'rgba(160, 200, 230, 0.45)',
          background: 'rgba(0, 10, 18, 0.92)',
        }}
      >
        <span>ENC · QPSK</span>
        <span>LAT 38ms</span>
      </div>

      {nyxTopicUnlocked && (
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

useGLTF.preload(alienUrl)
