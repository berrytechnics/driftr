import { Html, Line, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { DoubleSide, type Group, type MeshStandardMaterial } from 'three'
import { isNyxMapBody, NYX_TRANSIT_MAP_LABEL } from '@/lore/easterEggs'
import {
  sampleInclinedOrbit,
  type MapBodySnapshot,
  type MapSnapshot,
} from '@/map/systemMap'

type SystemMapProps = {
  snapshotRef: RefObject<MapSnapshot>
  /** Only listen for M while the player can open the map */
  active: boolean
  /** Re-lock flight when closing the map after opening from pointer-lock. */
  onRequestResume?: () => void
}

/** Survives Canvas unmount while SystemMap stays mounted. */
type MapViewState = {
  position: [number, number, number]
  target: [number, number, number]
}

const DEFAULT_MAP_VIEW: MapViewState = {
  position: [0, 5.5, 9.5],
  target: [0, 0, 0],
}

/** Session memory — survives Canvas unmount when M toggles the map. */
const rememberedMapView: MapViewState = {
  position: [...DEFAULT_MAP_VIEW.position],
  target: [...DEFAULT_MAP_VIEW.target],
}

function writeMapView(
  view: MapViewState,
  position: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
) {
  view.position[0] = position.x
  view.position[1] = position.y
  view.position[2] = position.z
  view.target[0] = target.x
  view.target[1] = target.y
  view.target[2] = target.z
}

const FONT =
  '600 11px ui-monospace, SFMono-Regular, Menlo, monospace'
const FONT_MOON =
  '500 9px ui-monospace, SFMono-Regular, Menlo, monospace'

function mapPipRadius(size: number, isStar: boolean, isMoon = false) {
  if (isStar) return Math.min(0.09, 0.045 + size * 0.0035)
  if (isMoon) return Math.min(0.012, 0.006 + size * 0.0022)
  return Math.min(0.024, 0.008 + size * 0.0018)
}

function framingScale(snapshot: MapSnapshot) {
  const planets = snapshot.bodies.filter((b) => b.kind !== 'moon')
  const planetOrbits = planets.map((b) => {
    const current = Math.hypot(b.x, b.y, b.z)
    const a = b.guideOrbit ?? current
    const e = b.eccentricity ?? 0
    return e > 0 ? a * (1 + e) : a
  })
  const maxOrbit = Math.max(
    snapshot.beltOuter * 1.08,
    ...planetOrbits.map((r) => r * 1.12),
    120,
  )
  return 7.2 / maxOrbit
}

function MapLabel({
  children,
  moon,
  color,
}: {
  children: ReactNode
  moon?: boolean
  color: string
}) {
  return (
    <Html
      center
      style={{
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        font: moon ? FONT_MOON : FONT,
        color,
        textShadow: '0 0 4px rgba(0,0,12,0.9), 0 1px 2px rgba(0,0,0,0.85)',
        userSelect: 'none',
        transform: 'translateY(-12px)',
      }}
      zIndexRange={[40, 0]}
    >
      {children}
    </Html>
  )
}

function OrbitPath({
  body,
  scale,
  highlight,
  corridor,
}: {
  body: MapBodySnapshot
  scale: number
  highlight: number
  corridor: boolean
}) {
  const a = body.guideOrbit ?? Math.hypot(body.x, body.y, body.z)
  const e = body.eccentricity ?? 0
  const peri = body.periapsisPhase ?? 0
  const inc = body.inclination ?? 0
  const points = useMemo(() => {
    const raw = sampleInclinedOrbit(a, e, peri, inc, e > 0.02 ? 128 : 96)
    return raw.map(
      ([x, y, z]) =>
        [x * scale, y * scale, z * scale] as [number, number, number],
    )
  }, [a, e, peri, inc, scale])

  const glowT = Math.min(1, highlight / 1.2)
  const isNyx = isNyxMapBody(body.name)

  return (
    <>
      <Line
        points={points}
        color={
          isNyx && glowT > 0
            ? `rgb(${180 + glowT * 40}, ${200 + glowT * 30}, 255)`
            : 'rgb(120, 150, 190)'
        }
        lineWidth={isNyx && glowT > 0 ? 1.6 + glowT * 1.4 : 1}
        transparent
        opacity={isNyx && glowT > 0 ? 0.45 + glowT * 0.45 : 0.28}
      />
      {corridor && isNyx && (
        <Line
          points={points}
          color="rgb(170, 160, 220)"
          lineWidth={1.35}
          transparent
          opacity={0.42}
          dashed
          dashSize={0.18}
          gapSize={0.14}
        />
      )}
    </>
  )
}

function BeltRing({
  inner,
  outer,
  scale,
}: {
  inner: number
  outer: number
  scale: number
}) {
  return (
    <mesh rotation-x={-Math.PI / 2}>
      <ringGeometry args={[inner * scale, outer * scale, 96]} />
      <meshBasicMaterial
        color="#b4a082"
        transparent
        opacity={0.14}
        side={DoubleSide}
        depthWrite={false}
      />
    </mesh>
  )
}

function EclipticGrid({ radius }: { radius: number }) {
  return (
    <group>
      {[0.25, 0.5, 0.75, 1].map((t) => (
        <mesh key={t} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[radius * t - 0.008, radius * t + 0.008, 64]} />
          <meshBasicMaterial
            color="#7896be"
            transparent
            opacity={0.1}
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}

type OrbitLayout = {
  scale: number
  orbits: { body: MapBodySnapshot; highlight: number; corridor: boolean }[]
  beltInner: number
  beltOuter: number
  starName: string
  starColor: string
  starSize: number
  corridorLabel: { x: number; y: number; z: number } | null
  bodyNames: string[]
}

function buildOrbitLayout(snap: MapSnapshot): OrbitLayout {
  const scale = framingScale(snap)
  const planets = snap.bodies.filter((b) => b.kind !== 'moon')
  const orbits = planets.map((body) => {
    const guide =
      body.guideOrbit ?? Math.hypot(body.x, body.y, body.z)
    return {
      body: { ...body, guideOrbit: guide },
      highlight: isNyxMapBody(body.name) ? snap.nyxOrbitGlow : 0,
      corridor: !!snap.nyxCorridorUnlocked && isNyxMapBody(body.name),
    }
  })

  let corridorLabel: OrbitLayout['corridorLabel'] = null
  if (snap.nyxCorridorUnlocked) {
    const nyx = planets.find((b) => isNyxMapBody(b.name))
    if (nyx) {
      const a = nyx.guideOrbit ?? Math.hypot(nyx.x, nyx.y, nyx.z)
      const pts = sampleInclinedOrbit(
        a,
        nyx.eccentricity ?? 0,
        nyx.periapsisPhase ?? 0,
        nyx.inclination ?? 0,
        72,
      )
      const mid = pts[18] ?? pts[0]
      corridorLabel = {
        x: mid[0] * scale,
        y: mid[1] * scale,
        z: mid[2] * scale,
      }
    }
  }

  return {
    scale,
    orbits,
    beltInner: snap.beltInner,
    beltOuter: snap.beltOuter,
    starName: snap.starName,
    starColor: snap.starColor,
    starSize: snap.starSize,
    corridorLabel,
    bodyNames: snap.bodies.map((b) => b.name),
  }
}

function orbitSignature(snap: MapSnapshot) {
  const planets = snap.bodies.filter((b) => b.kind !== 'moon')
  return (
    planets
      .map(
        (b) =>
          `${b.name}:${(b.guideOrbit ?? 0).toFixed(0)}:${(b.eccentricity ?? 0).toFixed(2)}:${(b.periapsisPhase ?? 0).toFixed(2)}:${(b.inclination ?? 0).toFixed(2)}:${Math.round(Math.hypot(b.x, b.y, b.z))}`,
      )
      .join('|') +
    `|c${snap.nyxCorridorUnlocked ? 1 : 0}|g${Math.round(snap.nyxOrbitGlow * 5)}|n${snap.bodies.length}`
  )
}

function LiveBody({
  name,
  snapshotRef,
  scaleRef,
}: {
  name: string
  snapshotRef: RefObject<MapSnapshot>
  scaleRef: RefObject<number>
}) {
  const group = useRef<Group>(null!)
  const matRef = useRef<MeshStandardMaterial>(null!)
  const seed = snapshotRef.current.bodies.find((x) => x.name === name)
  const [label, setLabel] = useState({
    text: name,
    moon: seed?.kind === 'moon',
    color: seed?.color ?? '#ffffff',
    size: seed?.size ?? 1,
  })
  const labelRef = useRef(label)
  labelRef.current = label

  useFrame(() => {
    const body = snapshotRef.current.bodies.find((b) => b.name === name)
    const g = group.current
    if (!body || !g) {
      if (g) g.visible = false
      return
    }
    const s = scaleRef.current
    g.visible = true
    g.position.set(body.x * s, body.y * s, body.z * s)
    if (matRef.current) {
      matRef.current.color.set(body.color)
      matRef.current.emissive.set(body.color)
    }
    const moon = body.kind === 'moon'
    const prev = labelRef.current
    if (prev.text !== body.name || prev.moon !== moon || prev.size !== body.size) {
      setLabel({
        text: body.name,
        moon,
        color: body.color,
        size: body.size,
      })
    }
  })

  return (
    <group ref={group}>
      <mesh>
        <sphereGeometry
          args={[mapPipRadius(label.size, false, label.moon), 32, 24]}
        />
        <meshStandardMaterial
          ref={matRef}
          color={label.color}
          roughness={0.72}
          metalness={0.08}
          emissive={label.color}
          emissiveIntensity={0.08}
        />
      </mesh>
      <MapLabel
        moon={label.moon}
        color={label.moon ? 'rgba(150, 170, 195, 0.75)' : '#e8eef6'}
      >
        {label.text}
      </MapLabel>
    </group>
  )
}

function LiveShip({
  snapshotRef,
  scaleRef,
}: {
  snapshotRef: RefObject<MapSnapshot>
  scaleRef: RefObject<number>
}) {
  const group = useRef<Group>(null!)
  useFrame(() => {
    const ship = snapshotRef.current.ship
    const g = group.current
    if (!g) return
    if (!ship) {
      g.visible = false
      return
    }
    const s = scaleRef.current
    g.visible = true
    g.position.set(ship.x * s, ship.y * s, ship.z * s)
    g.rotation.set(0, (ship.heading * Math.PI) / 180, 0)
  })
  return (
    <group ref={group} visible={false}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.055, 0.14, 3]} />
        <meshBasicMaterial color="#7ee787" />
      </mesh>
    </group>
  )
}

function LiveNpcs({
  snapshotRef,
  scaleRef,
}: {
  snapshotRef: RefObject<MapSnapshot>
  scaleRef: RefObject<number>
}) {
  const [bandits, setBandits] = useState<
    { x: number; y: number; z: number }[]
  >([])
  const [patrols, setPatrols] = useState<
    { x: number; y: number; z: number }[]
  >([])
  const frame = useRef(0)

  useFrame(() => {
    frame.current++
    if (frame.current % 2 !== 0) return
    const snap = snapshotRef.current
    const s = scaleRef.current
    setBandits(
      snap.bandits.map((b) => ({ x: b.x * s, y: b.y * s, z: b.z * s })),
    )
    setPatrols(
      snap.patrols.map((p) => ({ x: p.x * s, y: p.y * s, z: p.z * s })),
    )
  })

  return (
    <group>
      {bandits.map((b, i) => (
        <group key={`b-${i}`} position={[b.x, b.y, b.z]}>
          <mesh>
            <sphereGeometry args={[0.05, 10, 8]} />
            <meshBasicMaterial color="#ff2a3a" />
          </mesh>
          <MapLabel color="#ff8a94">Bandit</MapLabel>
        </group>
      ))}
      {patrols.map((p, i) => (
        <group key={`p-${i}`} position={[p.x, p.y, p.z]}>
          <mesh>
            <sphereGeometry args={[0.045, 10, 8]} />
            <meshBasicMaterial color="#4ec4ff" />
          </mesh>
          <MapLabel color="#9ad8ff">Patrol</MapLabel>
        </group>
      ))}
    </group>
  )
}

function LiveStations({
  snapshotRef,
  scaleRef,
}: {
  snapshotRef: RefObject<MapSnapshot>
  scaleRef: RefObject<number>
}) {
  const [stations, setStations] = useState<
    { x: number; y: number; z: number }[]
  >([])
  const frame = useRef(0)

  useFrame(() => {
    frame.current++
    if (frame.current % 2 !== 0) return
    const snap = snapshotRef.current
    const s = scaleRef.current
    setStations(
      (snap.stations ?? []).map((st) => ({
        x: st.x * s,
        y: st.y * s,
        z: st.z * s,
      })),
    )
  })

  return (
    <group>
      {stations.map((st, i) => (
        <group key={`st-${i}`} position={[st.x, st.y, st.z]}>
          {/* Billboard-ish: face roughly camera-up orbit view + ecliptic */}
          <mesh rotation-x={-Math.PI / 2}>
            <ringGeometry args={[0.038, 0.05, 40]} />
            <meshBasicMaterial
              color="#ffcc66"
              transparent
              opacity={0.9}
              side={DoubleSide}
              depthWrite={false}
            />
          </mesh>
          <mesh rotation-x={-Math.PI / 2}>
            <ringGeometry args={[0.05, 0.056, 40]} />
            <meshBasicMaterial
              color="#ffe6a8"
              transparent
              opacity={0.45}
              side={DoubleSide}
              depthWrite={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function LiveLorePings({
  snapshotRef,
  scaleRef,
}: {
  snapshotRef: RefObject<MapSnapshot>
  scaleRef: RefObject<number>
}) {
  const [pings, setPings] = useState<
    { key: string; label: string; x: number; y: number; z: number }[]
  >([])
  const frame = useRef(0)

  useFrame(() => {
    frame.current++
    if (frame.current % 2 !== 0) return
    const snap = snapshotRef.current
    const s = scaleRef.current
    setPings(
      (snap.lorePings ?? []).map((p, i) => ({
        key: `${p.label}-${i}`,
        label: p.label,
        x: p.x * s,
        y: (p.y ?? 0) * s,
        z: p.z * s,
      })),
    )
  })

  return (
    <group>
      {pings.map((p) => (
        <group key={p.key} position={[p.x, p.y, p.z]}>
          <mesh>
            <sphereGeometry args={[0.04, 12, 10]} />
            <meshBasicMaterial color="#beb0f0" />
          </mesh>
          <mesh rotation-x={-Math.PI / 2}>
            <ringGeometry args={[0.055, 0.072, 24]} />
            <meshBasicMaterial
              color="#a08cd2"
              transparent
              opacity={0.85}
              side={DoubleSide}
              depthWrite={false}
            />
          </mesh>
          <MapLabel color="rgba(200, 185, 240, 0.95)">{p.label}</MapLabel>
        </group>
      ))}
    </group>
  )
}

function MapOrbitControls() {
  const controlsRef = useRef<{
    target: {
      x: number
      y: number
      z: number
      set: (x: number, y: number, z: number) => void
    }
    update: () => void
  } | null>(null)
  const { camera } = useThree()
  const restored = useRef(false)

  useFrame(() => {
    const controls = controlsRef.current
    if (!controls) return

    if (!restored.current) {
      camera.position.set(...rememberedMapView.position)
      controls.target.set(...rememberedMapView.target)
      controls.update()
      restored.current = true
      return
    }

    writeMapView(rememberedMapView, camera.position, controls.target)
  })

  useLayoutEffect(() => {
    return () => {
      const controls = controlsRef.current
      if (!controls) return
      writeMapView(rememberedMapView, camera.position, controls.target)
    }
  }, [camera])

  return (
    <OrbitControls
      ref={controlsRef as never}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={2.5}
      maxDistance={28}
      rotateSpeed={0.65}
      zoomSpeed={0.85}
      onEnd={() => {
        const controls = controlsRef.current
        if (!controls) return
        writeMapView(rememberedMapView, camera.position, controls.target)
      }}
    />
  )
}

function MapScene({
  snapshotRef,
}: {
  snapshotRef: RefObject<MapSnapshot>
}) {
  const scaleRef = useRef(framingScale(snapshotRef.current))
  const [layout, setLayout] = useState(() =>
    buildOrbitLayout(snapshotRef.current),
  )
  const lastSig = useRef(orbitSignature(snapshotRef.current))

  useFrame(() => {
    const snap = snapshotRef.current
    const sig = orbitSignature(snap)
    const scale = framingScale(snap)
    scaleRef.current = scale
    if (sig !== lastSig.current) {
      lastSig.current = sig
      setLayout(buildOrbitLayout(snap))
    }
  })

  const gridR = Math.max(layout.beltOuter * layout.scale * 1.05, 7.2)

  return (
    <>
      <color attach="background" args={['#03060c']} />
      <ambientLight intensity={0.22} />
      {/* Sol-centered light — day/night limb on planet & moon pips */}
      <pointLight
        position={[0, 0, 0]}
        intensity={3.2}
        distance={40}
        decay={1.2}
        color="#ffe6a8"
      />
      <hemisphereLight
        args={['#8aa0c0', '#0a0810', 0.35]}
      />

      <EclipticGrid radius={gridR} />
      <BeltRing
        inner={layout.beltInner}
        outer={layout.beltOuter}
        scale={layout.scale}
      />

      {layout.orbits.map(({ body, highlight, corridor }) => (
        <OrbitPath
          key={body.name}
          body={body}
          scale={layout.scale}
          highlight={highlight}
          corridor={corridor}
        />
      ))}

      <mesh position={[0, 0, 0]}>
        <sphereGeometry
          args={[mapPipRadius(layout.starSize, true) * 1.45, 16, 12]}
        />
        <meshBasicMaterial
          color={layout.starColor}
          transparent
          opacity={0.22}
        />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[mapPipRadius(layout.starSize, true), 24, 16]} />
        <meshBasicMaterial color={layout.starColor} />
        <MapLabel color="#ffe6a8">{layout.starName}</MapLabel>
      </mesh>

      {layout.bodyNames.map((name) => (
        <LiveBody
          key={name}
          name={name}
          snapshotRef={snapshotRef}
          scaleRef={scaleRef}
        />
      ))}

      {layout.corridorLabel && (
        <group
          position={[
            layout.corridorLabel.x,
            layout.corridorLabel.y,
            layout.corridorLabel.z,
          ]}
        >
          <MapLabel color="rgba(180, 170, 230, 0.9)">
            {NYX_TRANSIT_MAP_LABEL}
          </MapLabel>
        </group>
      )}

      <LiveShip snapshotRef={snapshotRef} scaleRef={scaleRef} />
      <LiveStations snapshotRef={snapshotRef} scaleRef={scaleRef} />
      <LiveNpcs snapshotRef={snapshotRef} scaleRef={scaleRef} />
      <LiveLorePings snapshotRef={snapshotRef} scaleRef={scaleRef} />

      <MapOrbitControls />
    </>
  )
}

export function SystemMap({
  snapshotRef,
  active,
  onRequestResume,
}: SystemMapProps) {
  const [open, setOpen] = useState(false)
  const openRef = useRef(false)
  const openedFromLockRef = useRef(false)

  const closeMap = useCallback(
    (resume: boolean) => {
      if (!openRef.current) return
      openRef.current = false
      setOpen(false)
      if (resume && openedFromLockRef.current) {
        openedFromLockRef.current = false
        onRequestResume?.()
      } else {
        openedFromLockRef.current = false
      }
    },
    [onRequestResume],
  )

  const openMap = useCallback(() => {
    if (openRef.current) return
    openedFromLockRef.current = !!document.pointerLockElement
    if (document.pointerLockElement) {
      document.exitPointerLock()
    }
    openRef.current = true
    setOpen(true)
  }, [])

  useEffect(() => {
    if (!active) {
      openRef.current = false
      setOpen(false)
      openedFromLockRef.current = false
      return
    }

    const onDown = (event: KeyboardEvent) => {
      if (event.code === 'KeyM' && !event.repeat) {
        event.preventDefault()
        if (openRef.current) closeMap(true)
        else openMap()
        return
      }
      if (event.code === 'Escape' && openRef.current) {
        // Close map before pause/resume handlers; leave flight paused.
        event.preventDefault()
        event.stopPropagation()
        closeMap(false)
      }
    }

    window.addEventListener('keydown', onDown, true)
    return () => window.removeEventListener('keydown', onDown, true)
  }, [active, closeMap, openMap])

  if (!active || !open) return null

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 25,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(0, 0, 10, 0.55)',
        pointerEvents: 'auto',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          width: 'min(calc(100vh - 40px), calc(100vw - 40px))',
          height: 'min(calc(100vh - 40px), calc(100vw - 40px))',
          padding: 'clamp(16px, 2vw, 28px)',
          boxSizing: 'border-box',
          border: '1px solid rgba(255, 204, 102, 0.28)',
          background:
            'radial-gradient(ellipse at center, rgba(12, 20, 36, 0.94) 0%, rgba(0, 0, 10, 0.96) 75%)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.55)',
          color: '#e8eef8',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 10,
            padding: '0 4px',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: 16,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#ffcc66',
            }}
          >
            System Map
          </div>
          <div style={{ fontSize: 12, color: 'rgba(201, 209, 217, 0.55)' }}>
            M close · drag orbit · scroll zoom
          </div>
        </div>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <Canvas
            camera={{
              position: [
                rememberedMapView.position[0],
                rememberedMapView.position[1],
                rememberedMapView.position[2],
              ],
              fov: 42,
              near: 0.1,
              far: 200,
            }}
            gl={{ antialias: true, alpha: false }}
            style={{ width: '100%', height: '100%', display: 'block' }}
          >
            <MapScene snapshotRef={snapshotRef} />
          </Canvas>
        </div>
      </div>
    </div>
  )
}
