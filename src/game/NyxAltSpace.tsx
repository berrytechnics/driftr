import { Environment, Lightformer } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { folder, useControls } from 'leva'
import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import {
  Group,
  Object3D,
  Vector3,
  type DirectionalLight,
  type Mesh,
} from 'three'
import cassiniUrl from '@/assets/models/Cassini_Huygens.glb?url'
import tugUrl from '@/assets/models/Ship_Tug.glb?url'
import arid from '@/assets/textures/planets/Arid.webp'
import ashen from '@/assets/textures/planets/Ashen.webp'
import frozen from '@/assets/textures/planets/Frozen.webp'
import rocky from '@/assets/textures/planets/Rocky.webp'
import type { CombatHudState } from '@/combat/combatHud'
import type { HullSnapshot } from '@/game/persist'
import type { AdminWarpRequest, GateArrivalRequest } from '@/dev/adminTypes'
import {
  ALT_BELT_INNER,
  ALT_BELT_OUTER,
  ALT_DYSON_INCLINATION,
  ALT_DYSON_ORBIT,
  ALT_INNER_ORBIT,
  ALT_INNER_SIZE,
  ALT_MID_ORBIT,
  ALT_MID_SIZE,
  ALT_NYX_NAME,
  ALT_NYX_ORBIT,
  ALT_NYX_SIZE,
  ALT_OUTER_ECC,
  ALT_OUTER_ORBIT,
  ALT_OUTER_SIZE,
  ALT_PLANET_NAMES,
  ALT_STAR_NAME,
  ALT_SUN_COLOR,
  ALT_SUN_INTENSITY,
  ALT_SUN_SIZE,
  STATION_NAMES,
} from '@/game/systemConfig'
import {
  ALT_CASSINI_MAP_LABEL,
  ALT_CASSINI_TOAST,
  ALT_DYSON_MAP_LABEL,
  ALT_GATE_MAP_LABEL,
  ALT_GATE_TOAST,
  ALT_TUG_TOAST,
} from '@/lore/easterEggs'
import { FloatingWreck } from '@/lore/FloatingWreck'
import {
  GATE_MAP_SIZE,
  MISPLANTED_GATE_OFFSET,
  MisplantedGate,
  PORTAL_EXIT_CLEARANCE,
  gatePortalExitWorld,
} from '@/lore/MisplantedGate'
import {
  DYSON_MAP_SIZE,
  VesperSatelliteRing,
  createSiphonDockRefs,
  listSiphonIndices,
  siphonPadName,
} from '@/lore/VesperSatelliteRing'
import type { PlayerCargoStatus } from '@/loot/cargoBait'
import type { MaterialKind } from '@/loot/economy'
import {
  MaterialDrops,
  type MaterialDropsHandle,
  type MaterialPickup,
} from '@/loot/MaterialDrops'
import { MapTracker, type TrackedBody, type TrackedStation } from '@/map/MapTracker'
import { MapWaypointTracker } from '@/map/MapWaypointTracker'
import type { MapWaypointState } from '@/map/mapWaypoint'
import type { MapSnapshot } from '@/map/systemMap'
import type { AttitudeHudState } from '@/ship/attitudeHud'
import {
  DOCK_APPROACH_PAD,
  PlayerShip,
  type CollisionHazard,
  type DockBerth,
  type HazardField,
  type OrbitalTelemetry,
} from '@/ship/PlayerShip'
import { AsteroidBelt } from '@/world/AsteroidBelt'
import { Nebula } from '@/world/Nebula'
import { Planet } from '@/world/Planet'
import { StableGodRays } from '@/world/StableGodRays'
import { Starfield } from '@/world/Starfield'
import { Sun } from '@/world/Sun'
import {
  FLOATING_WRECK_HIT_RADIUS,
  STATION_HIT_RADIUS,
} from '@/world/hitRadii'
import { STATION_MODEL_URLS } from '@/world/SpaceStation'

/** Self-centered approach shell for the free-floating tug. */
export const ALT_TUG_DOCK_RANGE = 42
const TUG_OFFSET: [number, number, number] = [380, 28, 90]
const CASSINI_OFFSET: [number, number, number] = [-240, -40, 200]

const SpaceStation = lazy(() =>
  import('@/world/SpaceStation').then((m) => ({ default: m.SpaceStation })),
)

function SunLight({
  sunPosition,
  intensity,
  color,
}: {
  sunPosition: [number, number, number]
  intensity: number
  color: string
}) {
  const lightRef = useRef<DirectionalLight>(null!)
  const targetRef = useRef<Object3D>(null!)

  useFrame(({ camera }) => {
    const light = lightRef.current
    const target = targetRef.current
    if (!light || !target) return
    light.position.set(sunPosition[0], sunPosition[1], sunPosition[2])
    target.position.copy(camera.position)
    light.target = target
    target.updateMatrixWorld()
  })

  return (
    <>
      <directionalLight ref={lightRef} intensity={intensity} color={color} />
      <object3D ref={targetRef} />
    </>
  )
}

/**
 * Alternate sky past Nyx Transit — small indigo Vesper, catalog worlds V-1–V-3,
 * Ashen Nyx with a live station, and a sparse field of night-touched asteroids.
 */
export const NyxAltSpace = memo(function NyxAltSpace({
  started,
  paused,
  docked,
  dockStationName,
  onLockChange,
  onTelemetry,
  onDockAvailable,
  onMaterialPickup,
  mapSnapshotRef,
  mapShipRef,
  combatHudRef,
  attitudeHudRef,
  waypointRef,
  initialHull,
  healRequest = null,
  maxHp,
  torpedoOwned = false,
  torpedoAmmo = 0,
  torpedoMaxAmmo,
  onTorpedoAmmoChange,
  thrusterOwned = false,
  playerCargoRef,
  onJettisonCargo,
  nyxTugSeen = false,
  onNyxTugSeen,
  nyxCassiniSeen = false,
  onNyxCassiniSeen,
  nyxGateSeen = false,
  onNyxGateSeen,
  vesperSiphonRepaired = [],
  gatePowered = false,
  onPortalEnter,
  gateArrival = null,
  adminWarpTarget = null,
}: {
  started: boolean
  paused: boolean
  docked: boolean
  dockStationName?: string
  onLockChange: (locked: boolean) => void
  onTelemetry: (telemetry: OrbitalTelemetry) => void
  onDockAvailable: (available: boolean, stationName?: string) => void
  onMaterialPickup: (pickup: MaterialPickup) => void
  mapSnapshotRef: RefObject<MapSnapshot>
  mapShipRef: RefObject<Group | null>
  combatHudRef: RefObject<CombatHudState>
  attitudeHudRef: RefObject<AttitudeHudState>
  waypointRef: RefObject<MapWaypointState>
  initialHull?: HullSnapshot
  healRequest?: { seq: number; hp: number; maxHp?: number } | null
  maxHp?: number
  torpedoOwned?: boolean
  torpedoAmmo?: number
  torpedoMaxAmmo?: number
  onTorpedoAmmoChange?: (ammo: number) => void
  thrusterOwned?: boolean
  playerCargoRef: RefObject<PlayerCargoStatus>
  onJettisonCargo: (x: number, y: number, z: number) => void
  nyxTugSeen?: boolean
  onNyxTugSeen?: (toast: string) => void
  nyxCassiniSeen?: boolean
  onNyxCassiniSeen?: (toast: string) => void
  nyxGateSeen?: boolean
  onNyxGateSeen?: (toast: string) => void
  vesperSiphonRepaired?: readonly number[]
  gatePowered?: boolean
  onPortalEnter?: () => void
  gateArrival?: GateArrivalRequest | null
  adminWarpTarget?: AdminWarpRequest | null
}) {
  const innerPlanet = useRef<Group>(null)
  const midPlanet = useRef<Group>(null)
  const nyxPlanet = useRef<Group>(null)
  const outerPlanet = useRef<Group>(null)
  const nyxStation = useRef<Group>(null)
  const tugStation = useRef<Group>(null)
  const cassiniWreck = useRef<Group>(null)
  const misplantedGate = useRef<Group>(null)
  const dysonRingMap = useRef<Group>(null)
  const siphonDockRefs = useMemo(() => createSiphonDockRefs(), [])
  const mapCloakRef = useRef(false)
  const asteroidHazards = useRef<HazardField | null>(null)
  const gateHazards = useRef<HazardField | null>(null)
  const dysonHazards = useRef<HazardField | null>(null)
  const materialDrops = useRef<MaterialDropsHandle | null>(null)
  const dockedAtTug = docked && dockStationName === STATION_NAMES.nyxTug
  const sunMesh = useRef<Mesh>(null!)
  const [sunReady, setSunReady] = useState(false)
  const onSunReady = useCallback((mesh: Mesh | null) => {
    setSunReady(!!mesh)
  }, [])

  const {
    ambient,
    envFill,
    sunColor,
    sunIntensity,
    sunDistance,
    elevation,
    azimuth,
    flowSpeed,
    bloomIntensity,
    bloomThreshold,
    godRays,
    count,
    depth,
    radius,
    factor,
    saturation,
    fade,
    speed,
    shellIntensity,
    wispCount,
    wispOpacity,
    mu,
    siphonOrbitSpeed,
    siphonInclination,
    siphonTiltYaw,
    siphonTiltRoll,
    siphonDisplayScale,
    siphonBeaconGain,
    siphonDockRange,
    siphonAttachClearance,
    siphonForcePowered,
  } = useControls('Env · Vesper', {
    lighting: folder(
      {
        ambient: {
          value: 0.12,
          min: 0,
          max: 1,
          step: 0.01,
          label: 'Ambient',
        },
        envFill: {
          value: 0.4,
          min: 0,
          max: 2,
          step: 0.05,
          label: 'Env fill',
        },
      },
      { collapsed: true },
    ),
    sun: folder(
      {
        sunColor: { value: ALT_SUN_COLOR, label: 'Color' },
        sunIntensity: {
          value: ALT_SUN_INTENSITY,
          min: 0,
          max: 8,
          step: 0.05,
          label: 'Intensity',
        },
        sunDistance: {
          value: 283,
          min: 80,
          max: 1200,
          step: 5,
          label: 'Distance',
        },
        elevation: { value: 8, min: -60, max: 80, step: 1 },
        azimuth: { value: 180, min: 0, max: 360, step: 1 },
        flowSpeed: {
          value: 0.85,
          min: 0,
          max: 3,
          step: 0.05,
          label: 'Surface speed',
        },
      },
      { collapsed: false },
    ),
    post: folder(
      {
        bloomIntensity: {
          value: 0.38,
          min: 0,
          max: 4,
          step: 0.05,
          label: 'Bloom',
        },
        bloomThreshold: {
          value: 0.72,
          min: 0,
          max: 1,
          step: 0.01,
          label: 'Bloom threshold',
        },
        godRays: { value: false, label: 'Post god rays' },
      },
      { collapsed: true },
    ),
    stars: folder(
      {
        count: { value: 4200, min: 500, max: 12000, step: 100 },
        depth: { value: 90, min: 10, max: 200, step: 1 },
        radius: { value: 1400, min: 20, max: 2000, step: 5 },
        factor: { value: 3.2, min: 1, max: 12, step: 0.1 },
        saturation: { value: 0.35, min: 0, max: 1, step: 0.01 },
        fade: true,
        speed: { value: 0.35, min: 0, max: 4, step: 0.05 },
      },
      { collapsed: true },
    ),
    nebula: folder(
      {
        shellIntensity: {
          value: 0.48,
          min: 0,
          max: 1.2,
          step: 0.02,
          label: 'Shell',
        },
        wispCount: {
          value: 56,
          min: 0,
          max: 120,
          step: 1,
          label: 'Wisps',
        },
        wispOpacity: {
          value: 0.24,
          min: 0,
          max: 0.6,
          step: 0.01,
          label: 'Wisp opacity',
        },
      },
      { collapsed: false },
    ),
    gravity: folder(
      {
        mu: {
          value: 4000,
          min: 500,
          max: 500000,
          step: 500,
          label: 'μ (GM)',
        },
      },
      { collapsed: true },
    ),
    siphon: folder(
      {
        siphonOrbitSpeed: {
          value: 0.006,
          min: 0,
          max: 0.05,
          step: 0.001,
          label: 'Orbit speed',
        },
        siphonInclination: {
          value: ALT_DYSON_INCLINATION,
          min: -1.2,
          max: 1.2,
          step: 0.01,
          label: 'Inclination',
        },
        siphonTiltYaw: {
          value: 0.15,
          min: -1,
          max: 1,
          step: 0.01,
          label: 'Tilt yaw',
        },
        siphonTiltRoll: {
          value: -0.08,
          min: -1,
          max: 1,
          step: 0.01,
          label: 'Tilt roll',
        },
        siphonDisplayScale: {
          value: 3.6,
          min: 1,
          max: 8,
          step: 0.1,
          label: 'Pad scale',
        },
        siphonBeaconGain: {
          value: 1,
          min: 0,
          max: 3,
          step: 0.05,
          label: 'Beacon gain',
        },
        siphonDockRange: {
          value: 48,
          min: 12,
          max: 120,
          step: 1,
          label: 'Dock range',
        },
        siphonAttachClearance: {
          value: 4.2,
          min: 1,
          max: 16,
          step: 0.1,
          label: 'Attach clearance',
        },
        siphonForcePowered: {
          value: false,
          label: 'Force gate + portal',
        },
      },
      { collapsed: false },
    ),
  },
    { order: 1 },
  )

  const sunSize = ALT_SUN_SIZE
  const sunPosition = useMemo(() => {
    const phi = ((90 - elevation) * Math.PI) / 180
    const theta = (azimuth * Math.PI) / 180
    const pos = new Vector3().setFromSphericalCoords(sunDistance, phi, theta)
    return [pos.x, pos.y, pos.z] as [number, number, number]
  }, [azimuth, elevation, sunDistance])
  const hazardFields = useMemo(
    () => [asteroidHazards, gateHazards, dysonHazards],
    [],
  )

  const adminWarpRequest = useMemo(() => {
    // Portal hop arrival takes priority over levan warps for this remount.
    if (gateArrival) {
      return {
        seq: gateArrival.seq,
        ...gatePortalExitWorld(sunPosition, MISPLANTED_GATE_OFFSET),
      }
    }
    if (!adminWarpTarget) return null
    if (adminWarpTarget.id === 'siphon') {
      return {
        seq: adminWarpTarget.seq,
        x: sunPosition[0] + ALT_DYSON_ORBIT - 70,
        y: sunPosition[1] + 90,
        z: sunPosition[2] + 40,
      }
    }
    if (adminWarpTarget.id === 'gate') {
      return {
        seq: adminWarpTarget.seq,
        x: sunPosition[0] + MISPLANTED_GATE_OFFSET[0],
        y: sunPosition[1] + MISPLANTED_GATE_OFFSET[1] + PORTAL_EXIT_CLEARANCE,
        z: sunPosition[2] + MISPLANTED_GATE_OFFSET[2],
      }
    }
    const orbit =
      adminWarpTarget.id === 'sun'
        ? ALT_SUN_SIZE + 40
        : adminWarpTarget.id === 'inner'
          ? ALT_INNER_ORBIT
          : adminWarpTarget.id === 'belt'
            ? (ALT_BELT_INNER + ALT_BELT_OUTER) * 0.5
            : adminWarpTarget.id === 'outer'
              ? ALT_OUTER_ORBIT
              : ALT_OUTER_ORBIT * (1 + ALT_OUTER_ECC)
    return {
      seq: adminWarpTarget.seq,
      x: sunPosition[0] + orbit,
      y: sunPosition[1],
      z: sunPosition[2],
    }
  }, [adminWarpTarget, gateArrival, sunPosition])

  const onRockDestroyed = useCallback(
    (
      worldPosition: Vector3,
      kind: MaterialKind,
      flags?: { nightShard?: boolean },
    ) => {
      const x = worldPosition.x
      const y = worldPosition.y
      const z = worldPosition.z
      if (flags?.nightShard) {
        materialDrops.current?.spawnNight(x, y, z)
        return
      }
      materialDrops.current?.spawn(x, y, z, kind)
    },
    [],
  )

  const dockBerths = useMemo<DockBerth[]>(() => {
    const siphonBerths: DockBerth[] = listSiphonIndices().map((index, slot) => ({
      station: siphonDockRefs[slot]!,
      planet: siphonDockRefs[slot]!,
      name: siphonPadName(index),
      planetDockRange: siphonDockRange,
      // Pad scaled up vs the ship — stand off beside the hull, frame both
      attachClearance: siphonAttachClearance,
      dockCamScale: 0.9,
      facePad: true,
    }))
    return [
      {
        station: nyxStation,
        planet: nyxPlanet,
        name: STATION_NAMES.nyxAlt,
        planetDockRange: ALT_NYX_SIZE + 12 + DOCK_APPROACH_PAD,
      },
      {
        station: tugStation,
        // Free-floating — approach centered on the hull, not Nyx
        planet: tugStation,
        name: STATION_NAMES.nyxTug,
        planetDockRange: ALT_TUG_DOCK_RANGE,
      },
      ...siphonBerths,
    ]
  }, [siphonDockRefs, siphonDockRange, siphonAttachClearance])

  const planetHazards = useMemo<CollisionHazard[]>(
    () => [
      {
        object: innerPlanet,
        radius: ALT_INNER_SIZE,
        name: ALT_PLANET_NAMES.inner,
        kind: 'planet',
      },
      {
        object: midPlanet,
        radius: ALT_MID_SIZE,
        name: ALT_PLANET_NAMES.mid,
        kind: 'planet',
      },
      {
        object: nyxPlanet,
        radius: ALT_NYX_SIZE,
        name: ALT_NYX_NAME,
        kind: 'planet',
      },
      {
        object: outerPlanet,
        radius: ALT_OUTER_SIZE,
        name: ALT_PLANET_NAMES.outer,
        kind: 'planet',
      },
      { object: nyxStation, radius: STATION_HIT_RADIUS.nyxAlt },
      { object: tugStation, radius: FLOATING_WRECK_HIT_RADIUS.tug },
      { object: cassiniWreck, radius: FLOATING_WRECK_HIT_RADIUS.cassini },
    ],
    [],
  )

  const mapBodies = useMemo<TrackedBody[]>(
    () => [
      {
        name: ALT_PLANET_NAMES.inner,
        object: innerPlanet,
        size: ALT_INNER_SIZE,
        color: '#8a8570',
        kind: 'planet',
        guideOrbit: ALT_INNER_ORBIT,
        inclination: 0.06,
      },
      {
        name: ALT_PLANET_NAMES.mid,
        object: midPlanet,
        size: ALT_MID_SIZE,
        color: '#7a6e78',
        kind: 'planet',
        guideOrbit: ALT_MID_ORBIT,
        inclination: -0.11,
      },
      {
        name: ALT_NYX_NAME,
        object: nyxPlanet,
        size: ALT_NYX_SIZE,
        color: '#9a968c',
        kind: 'planet',
        guideOrbit: ALT_NYX_ORBIT,
        inclination: 0.08,
      },
      {
        name: ALT_PLANET_NAMES.outer,
        object: outerPlanet,
        size: ALT_OUTER_SIZE,
        color: '#8a92a0',
        kind: 'planet',
        guideOrbit: ALT_OUTER_ORBIT,
        eccentricity: ALT_OUTER_ECC,
        periapsisPhase: 3.7,
        inclination: 0.16,
      },
      {
        name: ALT_CASSINI_MAP_LABEL,
        object: cassiniWreck,
        size: 4,
        color: '#8a8070',
        kind: 'moon',
      },
      {
        name: ALT_GATE_MAP_LABEL,
        object: misplantedGate,
        size: GATE_MAP_SIZE,
        color: '#6b5cff',
        kind: 'moon',
      },
      {
        name: ALT_DYSON_MAP_LABEL,
        object: dysonRingMap,
        size: DYSON_MAP_SIZE,
        color: '#5a5088',
        kind: 'moon',
        guideOrbit: ALT_DYSON_ORBIT,
        inclination: siphonInclination,
      },
    ],
    [siphonInclination],
  )

  const mapStations = useMemo<TrackedStation[]>(
    () => [
      {
        name: STATION_NAMES.nyxAlt,
        object: nyxStation,
        host: nyxPlanet,
        hostSize: ALT_NYX_SIZE,
      },
      {
        name: STATION_NAMES.nyxTug,
        object: tugStation,
        host: tugStation,
        hostSize: 6,
        hostRing: false,
      },
    ],
    [],
  )

  const emptyBandits = useMemo(() => [], [])
  const emptyPatrols = useMemo(() => [], [])

  return (
    <>
      <color attach="background" args={['#02010a']} />
      <ambientLight intensity={ambient} color="#6a78a8" />
      <SunLight
        sunPosition={sunPosition}
        intensity={sunIntensity * 1.15}
        color={sunColor}
      />

      <Environment
        background={false}
        resolution={128}
        environmentIntensity={envFill}
      >
        <Lightformer
          intensity={0.4}
          color="#7080c8"
          scale={28}
          position={[-40, 25, 20]}
        />
        <Lightformer
          intensity={0.22}
          color="#302848"
          scale={40}
          position={[30, -20, -35]}
        />
      </Environment>

      <Sun
        sunRef={sunMesh}
        onReady={onSunReady}
        position={sunPosition}
        size={sunSize}
        color={sunColor}
        intensity={sunIntensity}
        flowSpeed={flowSpeed}
        palette="tint"
      />

      <Suspense fallback={null}>
        {/* V-1 — arid rock under a wrong, washed light */}
        <Planet
          planetRef={innerPlanet}
          sunPosition={sunPosition}
          sunSize={sunSize}
          orbitRadius={ALT_INNER_ORBIT}
          mu={mu}
          orbitSpeedScale={0.09}
          map={arid}
          size={ALT_INNER_SIZE}
          color="#b8b49a"
          phase={0.55}
          inclination={0.06}
          spin={0.07}
          paused={paused}
        />
        {/* V-2 — familiar basalt, bruised toward violet */}
        <Planet
          planetRef={midPlanet}
          sunPosition={sunPosition}
          sunSize={sunSize}
          orbitRadius={ALT_MID_ORBIT}
          mu={mu}
          orbitSpeedScale={0.08}
          map={rocky}
          size={ALT_MID_SIZE}
          color="#a898a0"
          phase={4.1}
          inclination={-0.11}
          spin={0.05}
          paused={paused}
        />
        <Planet
          planetRef={nyxPlanet}
          sunPosition={sunPosition}
          sunSize={sunSize}
          orbitRadius={ALT_NYX_ORBIT}
          mu={mu}
          orbitSpeedScale={0.12}
          map={ashen}
          size={ALT_NYX_SIZE}
          color="#c8c4bc"
          phase={1.4}
          inclination={0.08}
          spin={0.04}
          paused={paused}
        />
        {started && (
          <SpaceStation
            planetRef={nyxPlanet}
            planetSize={ALT_NYX_SIZE}
            modelUrl={STATION_MODEL_URLS.kronos}
            orbitAltitude={11}
            orbitSpeed={0.07}
            inclination={0.14}
            phase={2.1}
            scale={0.3}
            paused={paused}
            stationRef={nyxStation}
          />
        )}
        {started && (
          <>
            <FloatingWreck
              modelUrl={tugUrl}
              scale={0.72}
              sunPosition={sunPosition}
              offset={TUG_OFFSET}
              tumbleSpeed={0.035}
              playerRef={mapShipRef}
              sightRange={95}
              alreadySeen={nyxTugSeen}
              onFirstSight={onNyxTugSeen}
              toast={ALT_TUG_TOAST}
              paused={paused}
              docked={dockedAtTug}
              stationRef={tugStation}
            />
            <FloatingWreck
              modelUrl={cassiniUrl}
              scale={0.1}
              sunPosition={sunPosition}
              offset={CASSINI_OFFSET}
              tumbleSpeed={0.09}
              playerRef={mapShipRef}
              sightRange={70}
              alreadySeen={nyxCassiniSeen}
              onFirstSight={onNyxCassiniSeen}
              toast={ALT_CASSINI_TOAST}
              paused={paused}
              stationRef={cassiniWreck}
            />
            <MisplantedGate
              sunPosition={sunPosition}
              offset={MISPLANTED_GATE_OFFSET}
              playerRef={mapShipRef}
              sightRange={160}
              alreadySeen={nyxGateSeen}
              onFirstSight={onNyxGateSeen}
              toast={ALT_GATE_TOAST}
              paused={paused}
              gateRef={misplantedGate}
              hazardRef={gateHazards}
              powered={gatePowered || siphonForcePowered}
              onPortalEnter={
                gatePowered || siphonForcePowered ? onPortalEnter : undefined
              }
            />
            <VesperSatelliteRing
              sunPosition={sunPosition}
              paused={paused}
              orbitSpeed={siphonOrbitSpeed}
              inclination={siphonInclination}
              tiltYaw={siphonTiltYaw}
              tiltRoll={siphonTiltRoll}
              displayScale={siphonDisplayScale}
              beaconIntensity={siphonBeaconGain}
              mapRef={dysonRingMap}
              hazardRef={dysonHazards}
              repairedIds={vesperSiphonRepaired}
              powered={gatePowered || siphonForcePowered}
              dockRefs={siphonDockRefs}
            />
          </>
        )}
        {/* V-3 — frozen, past the rock field; year never quite circular */}
        <Planet
          planetRef={outerPlanet}
          sunPosition={sunPosition}
          sunSize={sunSize}
          orbitRadius={ALT_OUTER_ORBIT}
          eccentricity={ALT_OUTER_ECC}
          mu={mu}
          orbitSpeedScale={0.065}
          map={frozen}
          size={ALT_OUTER_SIZE}
          color="#c8d0dc"
          phase={3.7}
          inclination={0.16}
          spin={0.025}
          paused={paused}
        />

        <AsteroidBelt
          sunPosition={sunPosition}
          mu={mu}
          orbitSpeedScale={0.045}
          innerRadius={ALT_BELT_INNER}
          outerRadius={ALT_BELT_OUTER}
          count={140}
          thickness={90}
          sizeScale={0.48}
          inclination={0.1}
          nightFraction={0.1}
          glowAllNightRocks
          clumpCount={11}
          clumpSpread={32}
          looseRatio={0.38}
          paused={paused}
          hazardRef={asteroidHazards}
          onRockDestroyed={onRockDestroyed}
        />

        <MaterialDrops
          handleRef={materialDrops}
          magnetTargetRef={mapShipRef}
          paused={paused}
        />

        <PlayerShip
          scale={0.08}
          metalness={0.38}
          roughness={0.42}
          envMapIntensity={0.55}
          sunPosition={sunPosition}
          sunSize={sunSize}
          mu={mu}
          hazards={planetHazards}
          hostiles={[]}
          hazardFields={hazardFields}
          laserTargets={[]}
          shipRef={mapShipRef}
          materialDropsRef={materialDrops}
          onMaterialPickup={onMaterialPickup}
          spawnAnchorRef={dockedAtTug ? tugStation : nyxStation}
          spawnPlanetRef={dockedAtTug ? tugStation : nyxPlanet}
          spawnClearance={8}
          dockBerths={dockBerths}
          dockStationName={dockStationName}
          docked={docked}
          paused={paused}
          onLockChange={onLockChange}
          onTelemetry={onTelemetry}
          onDockAvailable={onDockAvailable}
          initialHull={initialHull}
          healRequest={healRequest}
          adminWarpRequest={adminWarpRequest}
          maxHp={maxHp}
          torpedoOwned={torpedoOwned}
          torpedoAmmo={torpedoAmmo}
          torpedoMaxAmmo={torpedoMaxAmmo}
          torpedoSeekTargets={[]}
          onTorpedoAmmoChange={onTorpedoAmmoChange}
          thrusterOwned={thrusterOwned}
          combatHudRef={combatHudRef}
          attitudeHudRef={attitudeHudRef}
          mapCloakRef={mapCloakRef}
          hasCargoRef={playerCargoRef}
          onJettisonCargo={onJettisonCargo}
        />
      </Suspense>

      <MapWaypointTracker
        waypointRef={waypointRef}
        snapshotRef={mapSnapshotRef}
        sunPosition={sunPosition}
        active={!paused && !docked}
      />

      <MapTracker
        snapshotRef={mapSnapshotRef}
        sunPosition={sunPosition}
        sunSize={sunSize}
        sunColor={sunColor}
        starName={ALT_STAR_NAME}
        beltInner={ALT_BELT_INNER}
        beltOuter={ALT_BELT_OUTER}
        bodies={mapBodies}
        shipRef={mapShipRef}
        banditRefs={emptyBandits}
        patrolRefs={emptyPatrols}
        stations={mapStations}
        hideNpcsRef={mapCloakRef}
      />

      <Nebula
        origin={sunPosition}
        shellIntensity={shellIntensity}
        colorA="#3a2a78"
        colorB="#1e3a68"
        colorC="#6a3858"
        wispInner={ALT_BELT_INNER - 20}
        wispOuter={ALT_BELT_OUTER + 80}
        wispCount={wispCount}
        wispOpacity={wispOpacity}
        paused={paused}
      />

      <Starfield
        radius={radius}
        depth={depth}
        count={count}
        factor={factor}
        saturation={saturation}
        fade={fade}
        speed={speed}
      />

      <EffectComposer enableNormalPass={false} multisampling={0}>
        <Bloom
          intensity={bloomIntensity}
          luminanceThreshold={bloomThreshold}
          luminanceSmoothing={0.9}
          mipmapBlur
        />
        {godRays && sunReady ? <StableGodRays sun={sunMesh} /> : <></>}
      </EffectComposer>
    </>
  )
})
