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
import {
  DoubleSide,
  type Group,
  type Mesh,
  type MeshStandardMaterial,
} from 'three'
import { isNyxMapBody, NYX_APO_MAP_LABEL, NYX_TRANSIT_MAP_LABEL } from '@/lore/easterEggs'
import { STATION_NAMES } from '@/game/systemConfig'
import type { MapWaypointState } from '@/map/mapWaypoint'
import {
  sampleInclinedOrbit,
  type MapBodySnapshot,
  type MapSnapshot,
} from '@/map/systemMap'

type SystemMapProps = {
  snapshotRef: RefObject<MapSnapshot>
  /** Only listen for M while the player can open the map */
  active: boolean
  /** When true, M toggles the map; in flight, hold M to peek. */
  paused?: boolean
  /** Re-lock flight when closing the map after opening from pointer-lock. */
  onRequestResume?: () => void
  /**
   * Fired before pointer-lock exit / after close so App can avoid treating
   * map peek as a real pause.
   */
  onOpenChange?: (open: boolean) => void
  /** Body pick for the flight HUD waypoint marker. */
  waypointRef?: RefObject<MapWaypointState>
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
  const guidedMoons = snapshot.bodies
    .filter((b) => b.kind === 'moon' && typeof b.guideOrbit === 'number')
    .map((b) => b.guideOrbit!)
  const maxOrbit = Math.max(
    snapshot.beltOuter * 1.08,
    ...planetOrbits.map((r) => r * 1.12),
    ...guidedMoons.map((r) => r * 1.12),
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
  // Planets always get guides; moons only when they declare an explicit orbit
  // (e.g. Vesper satellite ring charts as a rail, not a world).
  const guided = [
    ...planets,
    ...snap.bodies.filter(
      (b) => b.kind === 'moon' && typeof b.guideOrbit === 'number',
    ),
  ]
  const orbits = guided.map((body) => {
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
  const guided = snap.bodies.filter(
    (b) => b.kind !== 'moon' || typeof b.guideOrbit === 'number',
  )
  return (
    guided
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
  selectedName,
  onSelect,
}: {
  name: string
  snapshotRef: RefObject<MapSnapshot>
  scaleRef: RefObject<number>
  selectedName: string | null
  onSelect: (name: string, kind: 'planet' | 'moon') => void
}) {
  const group = useRef<Group>(null!)
  const matRef = useRef<MeshStandardMaterial>(null!)
  const ringRef = useRef<Mesh>(null!)
  const seed = snapshotRef.current.bodies.find((x) => x.name === name)
  const [label, setLabel] = useState({
    text: name,
    moon: seed?.kind === 'moon',
    color: seed?.color ?? '#ffffff',
    size: seed?.size ?? 1,
  })
  const labelRef = useRef(label)
  labelRef.current = label
  const selected = selectedName === name

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
      matRef.current.emissiveIntensity = selected ? 0.35 : 0.08
    }
    if (ringRef.current) ringRef.current.visible = selected
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

  const pip = mapPipRadius(label.size, false, label.moon)
  const hitR = Math.max(pip * 1.85, label.moon ? 0.055 : 0.07)

  return (
    <group ref={group}>
      <mesh
        onClick={(e) => {
          e.stopPropagation()
          onSelect(name, label.moon ? 'moon' : 'planet')
        }}
        onPointerOver={() => {
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'auto'
        }}
      >
        <sphereGeometry args={[pip, 32, 24]} />
        <meshStandardMaterial
          ref={matRef}
          color={label.color}
          roughness={0.72}
          metalness={0.08}
          emissive={label.color}
          emissiveIntensity={0.08}
        />
      </mesh>
      {/* Larger pick target for tiny moon pips */}
      <mesh
        visible={false}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(name, label.moon ? 'moon' : 'planet')
        }}
      >
        <sphereGeometry args={[hitR, 12, 10]} />
        <meshBasicMaterial />
      </mesh>
      <mesh ref={ringRef} rotation-x={-Math.PI / 2} visible={false}>
        <ringGeometry args={[pip * 1.35, pip * 1.7, 40]} />
        <meshBasicMaterial
          color="#ffcc66"
          transparent
          opacity={0.85}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <MapLabel
        moon={label.moon}
        color={
          selected
            ? '#ffe6a8'
            : label.moon
              ? 'rgba(150, 170, 195, 0.75)'
              : '#e8eef6'
        }
      >
        {label.text}
      </MapLabel>
    </group>
  )
}

function LiveStar({
  layout,
  selected,
  onSelect,
}: {
  layout: { starName: string; starColor: string; starSize: number }
  selected: boolean
  onSelect: (name: string) => void
}) {
  const glow = mapPipRadius(layout.starSize, true)
  return (
    <group position={[0, 0, 0]}>
      <mesh>
        <sphereGeometry args={[glow * 1.45, 16, 12]} />
        <meshBasicMaterial
          color={layout.starColor}
          transparent
          opacity={0.22}
        />
      </mesh>
      <mesh
        onClick={(e) => {
          e.stopPropagation()
          onSelect(layout.starName)
        }}
        onPointerOver={() => {
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'auto'
        }}
      >
        <sphereGeometry args={[glow, 24, 16]} />
        <meshBasicMaterial color={layout.starColor} />
      </mesh>
      {selected && (
        <mesh rotation-x={-Math.PI / 2}>
          <ringGeometry args={[glow * 1.35, glow * 1.7, 40]} />
          <meshBasicMaterial
            color="#ffcc66"
            transparent
            opacity={0.85}
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
      <MapLabel color={selected ? '#ffe6a8' : '#ffe6a8'}>
        {layout.starName}
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
    // Compass heading: 0 = world −Z, + = toward +X. Three.js +Y yaw is
    // CCW from above, so negate to match the heading convention.
    g.rotation.set(0, (-ship.heading * Math.PI) / 180, 0)
  })
  return (
    <group ref={group} visible={false}>
      {/* Cone default apex = +Y; −90° about X aims it along local −Z (nose). */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.055, 0.14, 3]} />
        <meshBasicMaterial color="#7ee787" />
      </mesh>
    </group>
  )
}

function LiveNpcs({
  snapshotRef,
  scaleRef,
  showPatrols,
}: {
  snapshotRef: RefObject<MapSnapshot>
  scaleRef: RefObject<number>
  /** Sol-only friendly pips — Html labels otherwise stick to the star origin. */
  showPatrols: boolean
}) {
  /** Pool meshes — update transforms each frame (no React lag). */
  const MAX = 8
  const banditRefs = useRef<(Group | null)[]>(Array(MAX).fill(null))
  const patrolRefs = useRef<(Group | null)[]>(Array(MAX).fill(null))
  const banditLabelRefs = useRef<(HTMLSpanElement | null)[]>(
    Array(MAX).fill(null),
  )
  const patrolLabelRefs = useRef<(HTMLSpanElement | null)[]>(
    Array(MAX).fill(null),
  )

  useFrame(() => {
    const snap = snapshotRef.current
    const s = scaleRef.current
    const bandits = snap.bandits
    const patrols = showPatrols ? snap.patrols : []
    for (let i = 0; i < MAX; i++) {
      const bg = banditRefs.current[i]
      const banditOn = i < bandits.length
      if (bg) {
        if (banditOn) {
          const b = bandits[i]
          bg.visible = true
          bg.position.set(b.x * s, b.y * s, b.z * s)
        } else {
          bg.visible = false
        }
      }
      const bLabel = banditLabelRefs.current[i]
      if (bLabel) bLabel.style.display = banditOn ? '' : 'none'

      const pg = patrolRefs.current[i]
      const patrolOn = i < patrols.length
      if (pg) {
        if (patrolOn) {
          const p = patrols[i]
          pg.visible = true
          pg.position.set(p.x * s, p.y * s, p.z * s)
        } else {
          pg.visible = false
        }
      }
      const pLabel = patrolLabelRefs.current[i]
      if (pLabel) pLabel.style.display = patrolOn ? '' : 'none'
    }
  })

  return (
    <group>
      {Array.from({ length: MAX }, (_, i) => (
        <group
          key={`b-${i}`}
          ref={(node) => {
            banditRefs.current[i] = node
          }}
          visible={false}
        >
          <mesh>
            <sphereGeometry args={[0.05, 10, 8]} />
            <meshBasicMaterial color="#ff2a3a" />
          </mesh>
          <MapLabel color="#ff8a94">
            <span
              ref={(node) => {
                banditLabelRefs.current[i] = node
              }}
              style={{ display: 'none' }}
            >
              Bandit
            </span>
          </MapLabel>
        </group>
      ))}
      {showPatrols
        ? Array.from({ length: MAX }, (_, i) => (
            <group
              key={`p-${i}`}
              ref={(node) => {
                patrolRefs.current[i] = node
              }}
              visible={false}
            >
              <mesh>
                <sphereGeometry args={[0.045, 10, 8]} />
                <meshBasicMaterial color="#4ec4ff" />
              </mesh>
              <MapLabel color="#9ad8ff">
                <span
                  ref={(node) => {
                    patrolLabelRefs.current[i] = node
                  }}
                  style={{ display: 'none' }}
                >
                  Patrol
                </span>
              </MapLabel>
            </group>
          ))
        : null}
    </group>
  )
}

function LiveStations({
  snapshotRef,
  scaleRef,
  selectedName,
  onSelect,
}: {
  snapshotRef: RefObject<MapSnapshot>
  scaleRef: RefObject<number>
  selectedName: string | null
  onSelect: (name: string) => void
}) {
  const [stations, setStations] = useState<
    {
      name: string
      x: number
      y: number
      z: number
      hostX: number
      hostY: number
      hostZ: number
      hostSize: number
      hostRing: boolean
      showPip: boolean
    }[]
  >([])
  const frame = useRef(0)

  useFrame(() => {
    frame.current++
    if (frame.current % 2 !== 0) return
    const snap = snapshotRef.current
    const s = scaleRef.current
    setStations(
      (snap.stations ?? []).map((st) => ({
        name: st.name,
        x: st.x * s,
        y: st.y * s,
        z: st.z * s,
        hostX: st.hostX * s,
        hostY: st.hostY * s,
        hostZ: st.hostZ * s,
        hostSize: st.hostSize,
        hostRing: st.hostRing !== false,
        showPip: st.showPip !== false,
      })),
    )
  })

  return (
    <group>
      {stations.map((st) => {
        const pip = mapPipRadius(st.hostSize, false, false)
        const ringIn = pip * 1.35
        const ringMid = pip * 1.72
        const ringOut = pip * 1.95
        const selected = selectedName === st.name
        const hitR = Math.max(pip * 1.9, 0.08)
        return (
          <group key={st.name}>
            {/* Livable pads only — ghost Transit must not ring Nyx */}
            {st.hostRing && (
              <group position={[st.hostX, st.hostY, st.hostZ]}>
                <mesh rotation-x={-Math.PI / 2}>
                  <ringGeometry args={[ringIn, ringMid, 40]} />
                  <meshBasicMaterial
                    color={selected ? '#ffe6a8' : '#ffcc66'}
                    transparent
                    opacity={selected ? 1 : 0.9}
                    side={DoubleSide}
                    depthWrite={false}
                  />
                </mesh>
                <mesh rotation-x={-Math.PI / 2}>
                  <ringGeometry args={[ringMid, ringOut, 40]} />
                  <meshBasicMaterial
                    color={selected ? '#fff0c8' : '#ffe6a8'}
                    transparent
                    opacity={selected ? 0.7 : 0.45}
                    side={DoubleSide}
                    depthWrite={false}
                  />
                </mesh>
                <mesh
                  visible={false}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelect(st.name)
                  }}
                  onPointerOver={() => {
                    document.body.style.cursor = 'pointer'
                  }}
                  onPointerOut={() => {
                    document.body.style.cursor = 'auto'
                  }}
                >
                  <sphereGeometry args={[hitR, 12, 10]} />
                  <meshBasicMaterial />
                </mesh>
              </group>
            )}
            {st.showPip && (
              <group position={[st.x, st.y, st.z]}>
                <mesh
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelect(st.name)
                  }}
                  onPointerOver={() => {
                    document.body.style.cursor = 'pointer'
                  }}
                  onPointerOut={() => {
                    document.body.style.cursor = 'auto'
                  }}
                >
                  <sphereGeometry args={[selected ? 0.022 : 0.016, 10, 8]} />
                  <meshBasicMaterial color={selected ? '#fff0c8' : '#ffcc66'} />
                </mesh>
                <mesh
                  visible={false}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelect(st.name)
                  }}
                >
                  <sphereGeometry args={[0.06, 10, 8]} />
                  <meshBasicMaterial />
                </mesh>
                {selected && (
                  <MapLabel color="#ffe6a8">{st.name}</MapLabel>
                )}
              </group>
            )}
          </group>
        )
      })}
    </group>
  )
}

function LiveLorePings({
  snapshotRef,
  scaleRef,
  selectedName,
  onSelectTransit,
}: {
  snapshotRef: RefObject<MapSnapshot>
  scaleRef: RefObject<number>
  selectedName: string | null
  onSelectTransit: () => void
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
      {pings.map((p) => {
        const isApoTransit = p.label === NYX_APO_MAP_LABEL
        const selected = isApoTransit && selectedName === STATION_NAMES.nyx
        return (
          <group key={p.key} position={[p.x, p.y, p.z]}>
            <mesh
              onClick={
                isApoTransit
                  ? (e) => {
                      e.stopPropagation()
                      onSelectTransit()
                    }
                  : undefined
              }
              onPointerOver={
                isApoTransit
                  ? () => {
                      document.body.style.cursor = 'pointer'
                    }
                  : undefined
              }
              onPointerOut={
                isApoTransit
                  ? () => {
                      document.body.style.cursor = 'auto'
                    }
                  : undefined
              }
            >
              <sphereGeometry args={[selected ? 0.05 : 0.04, 12, 10]} />
              <meshBasicMaterial color={selected ? '#e0d4ff' : '#beb0f0'} />
            </mesh>
            <mesh rotation-x={-Math.PI / 2}>
              <ringGeometry args={[0.055, 0.072, 24]} />
              <meshBasicMaterial
                color={selected ? '#d0c0f8' : '#a08cd2'}
                transparent
                opacity={0.85}
                side={DoubleSide}
                depthWrite={false}
              />
            </mesh>
            {isApoTransit && (
              <mesh
                visible={false}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectTransit()
                }}
              >
                <sphereGeometry args={[0.09, 10, 8]} />
                <meshBasicMaterial />
              </mesh>
            )}
            <MapLabel
              color={
                selected
                  ? '#f0e8ff'
                  : 'rgba(200, 185, 240, 0.95)'
              }
            >
              {p.label}
            </MapLabel>
          </group>
        )
      })}
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
  selectedName,
  onSelectBody,
}: {
  snapshotRef: RefObject<MapSnapshot>
  selectedName: string | null
  onSelectBody: (
    name: string,
    kind: 'star' | 'planet' | 'moon' | 'station',
  ) => void
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
  const selectTransit = () => onSelectBody(STATION_NAMES.nyx, 'station')
  const transitSelected = selectedName === STATION_NAMES.nyx

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

      <LiveStar
        layout={layout}
        selected={selectedName === layout.starName}
        onSelect={(name) => onSelectBody(name, 'star')}
      />

      {layout.bodyNames.map((name) => (
        <LiveBody
          key={name}
          name={name}
          snapshotRef={snapshotRef}
          scaleRef={scaleRef}
          selectedName={selectedName}
          onSelect={(n, kind) => onSelectBody(n, kind)}
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
          <mesh
            onClick={(e) => {
              e.stopPropagation()
              selectTransit()
            }}
            onPointerOver={() => {
              document.body.style.cursor = 'pointer'
            }}
            onPointerOut={() => {
              document.body.style.cursor = 'auto'
            }}
          >
            <sphereGeometry args={[0.045, 12, 10]} />
            <meshBasicMaterial
              color={transitSelected ? '#e0d4ff' : '#beb0f0'}
              transparent
              opacity={0.55}
            />
          </mesh>
          <mesh
            visible={false}
            onClick={(e) => {
              e.stopPropagation()
              selectTransit()
            }}
          >
            <sphereGeometry args={[0.1, 10, 8]} />
            <meshBasicMaterial />
          </mesh>
          <MapLabel
            color={
              transitSelected
                ? '#f0e8ff'
                : 'rgba(180, 170, 230, 0.9)'
            }
          >
            {NYX_TRANSIT_MAP_LABEL}
          </MapLabel>
        </group>
      )}

      <LiveShip snapshotRef={snapshotRef} scaleRef={scaleRef} />
      <LiveStations
        snapshotRef={snapshotRef}
        scaleRef={scaleRef}
        selectedName={selectedName}
        onSelect={(name) => onSelectBody(name, 'station')}
      />
      <LiveNpcs
        snapshotRef={snapshotRef}
        scaleRef={scaleRef}
        showPatrols={layout.starName === 'Sol'}
      />
      <LiveLorePings
        snapshotRef={snapshotRef}
        scaleRef={scaleRef}
        selectedName={selectedName}
        onSelectTransit={selectTransit}
      />

      <MapOrbitControls />
    </>
  )
}

export function SystemMap({
  snapshotRef,
  active,
  paused = false,
  onRequestResume,
  onOpenChange,
  waypointRef,
}: SystemMapProps) {
  const [open, setOpen] = useState(false)
  const openRef = useRef(false)
  const openedFromLockRef = useRef(false)
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const [selectedName, setSelectedName] = useState<string | null>(
    () => waypointRef?.current.name ?? null,
  )

  const closeMap = useCallback(
    (resume: boolean) => {
      if (!openRef.current) return
      openRef.current = false
      setOpen(false)
      onOpenChange?.(false)
      if (resume && openedFromLockRef.current) {
        openedFromLockRef.current = false
        onRequestResume?.()
      } else {
        openedFromLockRef.current = false
      }
    },
    [onOpenChange, onRequestResume],
  )

  const openMap = useCallback(() => {
    if (openRef.current) return
    openedFromLockRef.current = !!document.pointerLockElement
    // Mark peek before unlock so App doesn't treat it as Esc-pause.
    onOpenChange?.(true)
    if (document.pointerLockElement) {
      document.exitPointerLock()
    }
    openRef.current = true
    setSelectedName(waypointRef?.current.name ?? null)
    setOpen(true)
  }, [onOpenChange, waypointRef])

  const onSelectBody = useCallback(
    (name: string, kind: 'star' | 'planet' | 'moon' | 'station') => {
      const wp = waypointRef?.current
      if (!wp) return
      if (wp.name === name) {
        wp.name = null
        wp.kind = null
        wp.show = false
        setSelectedName(null)
        return
      }
      wp.name = name
      wp.kind = kind
      setSelectedName(name)
    },
    [waypointRef],
  )

  useEffect(() => {
    if (!active) {
      if (openRef.current) onOpenChange?.(false)
      openRef.current = false
      setOpen(false)
      openedFromLockRef.current = false
      return
    }

    const onDown = (event: KeyboardEvent) => {
      if (event.code === 'KeyM') {
        if (event.repeat) return
        event.preventDefault()
        // Pause: toggle so trackpads work (no key held → no OS mute).
        // Flight: hold to peek (release closes via keyup).
        if (pausedRef.current) {
          if (openRef.current) closeMap(false)
          else openMap()
        } else {
          openMap()
        }
        return
      }
      if (event.code === 'Escape' && openRef.current) {
        // Close map; re-lock if we peeked from flight (don't force a pause).
        event.preventDefault()
        event.stopPropagation()
        closeMap(true)
      }
    }

    const onUp = (event: KeyboardEvent) => {
      if (event.code !== 'KeyM') return
      if (pausedRef.current) return
      event.preventDefault()
      closeMap(true)
    }

    window.addEventListener('keydown', onDown, true)
    window.addEventListener('keyup', onUp, true)
    return () => {
      window.removeEventListener('keydown', onDown, true)
      window.removeEventListener('keyup', onUp, true)
    }
  }, [active, closeMap, openMap, onOpenChange])

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
            {paused ? 'M toggle' : 'hold M'} · click body · drag orbit
            {selectedName ? ` · mark ${selectedName}` : ''}
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
            <MapScene
              snapshotRef={snapshotRef}
              selectedName={selectedName}
              onSelectBody={onSelectBody}
            />
          </Canvas>
        </div>
      </div>
    </div>
  )
}
