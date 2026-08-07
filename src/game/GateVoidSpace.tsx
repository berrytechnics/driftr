import { Environment, Lightformer } from '@react-three/drei'
import { folder, useControls } from 'leva'
import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useMemo,
  useRef,
  type RefObject,
} from 'react'
import { Group, Vector3, type Object3D } from 'three'
import type { CombatHudState } from '@/combat/combatHud'
import type { AdminWarpRequest, GateArrivalRequest } from '@/dev/adminTypes'
import type { HullSnapshot } from '@/game/persist'
import { useGraphicsSettings } from '@/game/useGraphicsSettings'
import {
  STATION_NAMES,
  VOID_BELT_INNER,
  VOID_BELT_OUTER,
  VOID_GATE_ORBIT_INCLINATION,
  VOID_GATE_ORBIT_SPEED,
  VOID_MU,
  VOID_NEBULA_FADE_END,
  VOID_NEBULA_FADE_START,
  VOID_NEBULA_INNER,
  VOID_NEBULA_OUTER,
  VOID_STAR_NAME,
  VOID_SUN_COLOR,
  VOID_SUN_INTENSITY,
  VOID_SUN_SIZE,
} from '@/game/systemConfig'
import { altGateMapLabel } from '@/lore/easterEggs'
import {
  GATE_MAP_SIZE,
  MisplantedGate,
  PORTAL_EXIT_CLEARANCE,
  VOID_GATE_OFFSET,
  gatePortalExitWorld,
} from '@/lore/MisplantedGate'
import {
  VOID_STATION_NATIVE,
  VOID_STATION_URLS,
  VoidDerelictStation,
} from '@/lore/VoidDerelictStation'
import {
  voidRemnantById,
  voidRemnantMapLabel,
  type VoidRemnantId,
} from '@/lore/voidAncestors'
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
  PlayerShip,
  type DockBerth,
  type HazardField,
  type OrbitalTelemetry,
} from '@/ship/PlayerShip'
import { AsteroidBelt } from '@/world/AsteroidBelt'
import { Nebula, DEFAULT_QUADRANT_COLORS } from '@/world/Nebula'
import { Starfield } from '@/world/Starfield'
import { Sun } from '@/world/Sun'

const ScenePostFX = lazy(() =>
  import('@/game/ScenePostFX').then((m) => ({ default: m.ScenePostFX })),
)

/** Black dwarf at the hollow remnant core — gate orbits this. */
const VOID_SUN_POSITION: [number, number, number] = [0, 0, 0]

/**
 * Parked Freeport husk — 3× the prior remnant span.
 * Offset pushed past the rubble belt (outer 980) so half-length (~432) stays clear.
 */
const DRIFT_HULK_OFFSET: [number, number, number] = [1760, 110, -310]
const DRIFT_HULK_LENGTH = 864
const DRIFT_HULK_SPIN = 0.0175

const ORBITING_VOID_STATIONS = [
  {
    id: 'freeport' as const satisfies VoidRemnantId,
    url: VOID_STATION_URLS.freeport,
    native: VOID_STATION_NATIVE.freeport,
    length: 52,
    orbitRadius: 1280,
    orbitSpeed: 0.001,
    inclination: 0.18,
    phase: 0.4,
    mapSize: 8,
    dockRange: 55,
    attachClearance: 18,
    sightRange: 140,
    name: STATION_NAMES.voidFreeport,
  },
  {
    id: 'greenpeace' as const satisfies VoidRemnantId,
    url: VOID_STATION_URLS.greenpeace,
    native: VOID_STATION_NATIVE.greenpeace,
    length: 72,
    orbitRadius: 1620,
    orbitSpeed: 0.00075,
    inclination: -0.14,
    phase: 2.1,
    mapSize: 10,
    dockRange: 70,
    attachClearance: 22,
    sightRange: 160,
    name: STATION_NAMES.voidGreenpeace,
  },
  {
    id: 'orbitalComplex' as const satisfies VoidRemnantId,
    url: VOID_STATION_URLS.orbitalComplex,
    native: VOID_STATION_NATIVE.orbitalComplex,
    length: 48,
    orbitRadius: 1960,
    orbitSpeed: 0.0006,
    inclination: 0.28,
    phase: 4.0,
    mapSize: 7,
    dockRange: 55,
    attachClearance: 16,
    sightRange: 130,
    name: STATION_NAMES.voidOrbital,
  },
  {
    id: 'miningOutpost' as const satisfies VoidRemnantId,
    url: VOID_STATION_URLS.miningOutpost,
    native: VOID_STATION_NATIVE.miningOutpost,
    length: 88,
    orbitRadius: 2340,
    orbitSpeed: 0.0005,
    inclination: -0.22,
    phase: 5.3,
    mapSize: 12,
    dockRange: 80,
    attachClearance: 26,
    sightRange: 180,
    name: STATION_NAMES.voidMining,
  },
] as const

const DRIFT_HULK_MAP_LABEL = 'Drift hulk'
const DRIFT_HULK_MAP_SIZE = 28

/**
 * Supernova remnant pocket past the misplanted gate —
 * cooled black dwarf, empty cavity, dense outer nebula, and the matching ring.
 */
export const GateVoidSpace = memo(function GateVoidSpace({
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
  onPortalEnter,
  gateArrival = null,
  adminWarpTarget = null,
  gatePortalUsed = false,
  voidRemnantSeen,
  voidRemnantDocked,
  onVoidRemnantSeen,
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
  onPortalEnter?: () => void
  gateArrival?: GateArrivalRequest | null
  adminWarpTarget?: AdminWarpRequest | null
  gatePortalUsed?: boolean
  voidRemnantSeen: Readonly<Record<VoidRemnantId, boolean>>
  voidRemnantDocked: Readonly<Record<VoidRemnantId, boolean>>
  onVoidRemnantSeen: (id: VoidRemnantId, toast: string) => void
}) {
  const gfx = useGraphicsSettings()
  const misplantedGate = useRef<Group>(null)
  const driftHulkStation = useRef<Group>(null)
  const freeportStation = useRef<Group>(null)
  const greenpeaceStation = useRef<Group>(null)
  const orbitalComplexStation = useRef<Group>(null)
  const miningOutpostStation = useRef<Group>(null)
  const gateHazards = useRef<HazardField | null>(null)
  const asteroidHazards = useRef<HazardField | null>(null)
  const driftHulkHazards = useRef<HazardField | null>(null)
  const freeportHazards = useRef<HazardField | null>(null)
  const greenpeaceHazards = useRef<HazardField | null>(null)
  const orbitalComplexHazards = useRef<HazardField | null>(null)
  const miningOutpostHazards = useRef<HazardField | null>(null)
  const materialDrops = useRef<MaterialDropsHandle | null>(null)
  const mapCloakRef = useRef(false)
  const emptyHazards = useMemo(() => [], [])
  const hazardFields = useMemo(
    () => [
      asteroidHazards,
      gateHazards,
      driftHulkHazards,
      freeportHazards,
      greenpeaceHazards,
      orbitalComplexHazards,
      miningOutpostHazards,
    ],
    [],
  )

  const stationRefs = useMemo(
    () =>
      ({
        freeport: freeportStation,
        greenpeace: greenpeaceStation,
        orbitalComplex: orbitalComplexStation,
        miningOutpost: miningOutpostStation,
      }) as const,
    [],
  )
  const stationHazardRefs = useMemo(
    () =>
      ({
        freeport: freeportHazards,
        greenpeace: greenpeaceHazards,
        orbitalComplex: orbitalComplexHazards,
        miningOutpost: miningOutpostHazards,
      }) as const,
    [],
  )

  const dockBerths = useMemo<DockBerth[]>(
    () =>
      ORBITING_VOID_STATIONS.map((spec) => ({
        station: stationRefs[spec.id],
        planet: stationRefs[spec.id],
        name: spec.name,
        planetDockRange: spec.dockRange,
        attachClearance: spec.attachClearance,
      })),
    [stationRefs],
  )

  const dockedSpec = useMemo(
    () => ORBITING_VOID_STATIONS.find((s) => s.name === dockStationName),
    [dockStationName],
  )
  const dockedStationRef = dockedSpec
    ? stationRefs[dockedSpec.id]
    : misplantedGate
  const dockedAtRemnant = docked && !!dockedSpec

  const {
    ambient,
    envFill,
    bloomIntensity,
    bloomThreshold,
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
    sunIntensity,
    flowSpeed,
    mu,
  } = useControls(
    'Env · Void',
    {
      lighting: folder(
        {
          ambient: {
            value: 0.07,
            min: 0,
            max: 1,
            step: 0.01,
            label: 'Ambient',
          },
          envFill: {
            value: 0.85,
            min: 0,
            max: 2.5,
            step: 0.05,
            label: 'Env fill',
          },
        },
        { collapsed: true },
      ),
      cinder: folder(
        {
          sunIntensity: {
            value: VOID_SUN_INTENSITY,
            min: 0,
            max: 2,
            step: 0.02,
            label: 'Coal glow',
          },
          flowSpeed: {
            value: 0.18,
            min: 0,
            max: 2,
            step: 0.02,
            label: 'Ash crawl',
          },
          mu: {
            value: VOID_MU,
            min: 200,
            max: 20000,
            step: 100,
            label: 'μ (GM)',
          },
        },
        { collapsed: true },
      ),
      post: folder(
        {
          bloomIntensity: {
            value: 0.7,
            min: 0,
            max: 4,
            step: 0.05,
            label: 'Bloom',
          },
          bloomThreshold: {
            // Higher than Sol: void nebulae are bright/additive; lower values
            // bloom soft silhouette aliasing into white fringe while moving.
            value: 0.74,
            min: 0,
            max: 1,
            step: 0.01,
            label: 'Bloom threshold',
          },
        },
        { collapsed: true },
      ),
      stars: folder(
        {
          count: { value: 4200, min: 500, max: 12000, step: 100 },
          depth: { value: 95, min: 10, max: 200, step: 1 },
          radius: { value: 1600, min: 20, max: 2000, step: 5 },
          factor: { value: 2.8, min: 1, max: 12, step: 0.1 },
          saturation: { value: 0.18, min: 0, max: 1, step: 0.01 },
          fade: true,
          speed: { value: 0.12, min: 0, max: 4, step: 0.05 },
        },
        { collapsed: true },
      ),
      nebula: folder(
        {
          shellIntensity: {
            value: 1.55,
            min: 0,
            max: 3,
            step: 0.02,
            label: 'Shell',
          },
          wispCount: {
            value: 420,
            min: 0,
            max: 900,
            step: 2,
            label: 'Wisps (per layer)',
          },
          wispOpacity: {
            value: 0.52,
            min: 0.05,
            max: 1,
            step: 0.01,
            label: 'Wisp opacity',
          },
        },
        { collapsed: false },
      ),
    },
    { order: 1 },
  )

  const sunPosition = VOID_SUN_POSITION
  const sunSize = VOID_SUN_SIZE

  const spawnWarpRequest = useMemo(() => {
    if (gateArrival) {
      const exit = gatePortalExitWorld(sunPosition, VOID_GATE_OFFSET)
      return { seq: gateArrival.seq, ...exit }
    }
    if (adminWarpTarget?.id === 'gate') {
      return {
        seq: adminWarpTarget.seq,
        x: sunPosition[0] + VOID_GATE_OFFSET[0],
        y: sunPosition[1] + VOID_GATE_OFFSET[1] + PORTAL_EXIT_CLEARANCE,
        z: sunPosition[2] + VOID_GATE_OFFSET[2],
      }
    }
    // Non-gate admin warps leave placement alone (sun / belt cheats, etc.).
    if (adminWarpTarget) return null
    // Hard-dock restore — ride the remnant pad; no throat warp.
    if (dockedAtRemnant) return null
    // Undocked remnant session — start at the throat.
    const exit = gatePortalExitWorld(sunPosition, VOID_GATE_OFFSET)
    return { seq: 1, ...exit }
  }, [gateArrival, adminWarpTarget, sunPosition, dockedAtRemnant])

  const mapBodies = useMemo<TrackedBody[]>(
    () => [
      {
        name: altGateMapLabel(gatePortalUsed),
        object: misplantedGate,
        size: GATE_MAP_SIZE,
        color: '#6b5cff',
        kind: 'moon',
      },
    ],
    [gatePortalUsed],
  )

  /** Free-floating contacts — gold pips; designations unlock after hard-dock. */
  const mapStations = useMemo<TrackedStation[]>(
    () => [
      {
        name: DRIFT_HULK_MAP_LABEL,
        object: driftHulkStation,
        host: driftHulkStation,
        hostSize: DRIFT_HULK_MAP_SIZE,
        hostRing: false,
        alwaysShowLabel: true,
      },
      ...ORBITING_VOID_STATIONS.map((spec) => ({
        name: voidRemnantMapLabel(spec.id, !!voidRemnantDocked[spec.id]),
        object: stationRefs[spec.id],
        host: stationRefs[spec.id],
        hostSize: spec.mapSize,
        hostRing: false as const,
        alwaysShowLabel: true,
      })),
    ],
    [stationRefs, voidRemnantDocked],
  )

  const emptyBandits = useMemo(() => [], [])
  const emptyPatrols = useMemo(() => [], [])

  const onRockDestroyed = useCallback(
    (
      worldPosition: Vector3,
      kind: MaterialKind,
      flags?: { nightShard?: boolean },
    ) => {
      // Remnant field has no omen rocks — never mint night shards here.
      if (flags?.nightShard) return
      materialDrops.current?.spawn(
        worldPosition.x,
        worldPosition.y,
        worldPosition.z,
        kind,
      )
    },
    [],
  )

  return (
    <>
      <color attach="background" args={['#030108']} />
      <ambientLight intensity={ambient} color="#804870" />

      <Environment
        background={false}
        resolution={128}
        environmentIntensity={envFill}
      >
        <Lightformer
          intensity={1.15}
          color="#ff4f9a"
          scale={60}
          position={[-60, 10, 40]}
        />
        <Lightformer
          intensity={1.05}
          color="#20f0ff"
          scale={62}
          position={[55, -30, -35]}
        />
        <Lightformer
          intensity={0.9}
          color="#ffc238"
          scale={48}
          position={[15, 50, -25]}
        />
        <Lightformer
          intensity={0.75}
          color="#b84dff"
          scale={54}
          position={[-25, -45, 30]}
        />
        <Lightformer
          intensity={0.65}
          color="#6dff4a"
          scale={46}
          position={[40, 20, 50]}
        />
        <Lightformer
          intensity={0.45}
          color="#ff6a30"
          scale={70}
          position={[0, -40, 20]}
        />
      </Environment>

      <Sun
        position={sunPosition}
        size={sunSize}
        color={VOID_SUN_COLOR}
        intensity={sunIntensity}
        flowSpeed={flowSpeed}
        palette="tint"
      />

      <VoidDerelictStation
        modelUrl={VOID_STATION_URLS.freeport2}
        sunPosition={sunPosition}
        length={DRIFT_HULK_LENGTH}
        nativeLongest={VOID_STATION_NATIVE.freeport2}
        offset={DRIFT_HULK_OFFSET}
        spinSpeed={DRIFT_HULK_SPIN}
        paused={paused}
        stationRef={driftHulkStation}
        hazardRef={driftHulkHazards}
      />

      {ORBITING_VOID_STATIONS.map((spec) => (
        <VoidDerelictStation
          key={spec.id}
          modelUrl={spec.url}
          sunPosition={sunPosition}
          length={spec.length}
          nativeLongest={spec.native}
          orbitRadius={spec.orbitRadius}
          orbitSpeed={spec.orbitSpeed}
          inclination={spec.inclination}
          phase={spec.phase}
          paused={paused}
          docked={docked && dockStationName === spec.name}
          stationRef={stationRefs[spec.id]}
          hazardRef={stationHazardRefs[spec.id]}
          playerRef={mapShipRef as RefObject<Object3D | null>}
          sightRange={spec.sightRange}
          alreadySeen={!!voidRemnantSeen[spec.id]}
          toast={voidRemnantById(spec.id).toast}
          onFirstSight={(toast) => onVoidRemnantSeen(spec.id, toast)}
        />
      ))}

      {started && (
        <>
          <MisplantedGate
            sunPosition={sunPosition}
            offset={VOID_GATE_OFFSET}
            orbitAngularSpeed={VOID_GATE_ORBIT_SPEED}
            orbitInclination={VOID_GATE_ORBIT_INCLINATION}
            playerRef={mapShipRef as RefObject<Object3D | null>}
            paused={paused}
            gateRef={misplantedGate}
            hazardRef={gateHazards}
            powered
            onPortalEnter={onPortalEnter}
          />

          <AsteroidBelt
            sunPosition={sunPosition}
            mu={mu}
            orbitSpeedScale={0.055}
            innerRadius={VOID_BELT_INNER}
            outerRadius={VOID_BELT_OUTER}
            count={52}
            thickness={160}
            sizeScale={0.92}
            inclination={0.38}
            nightFraction={0}
            // A few dense rubble piles = former worlds; rest of the annulus stays thin.
            clumpCount={5}
            clumpSpread={48}
            looseRatio={0.28}
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
            hazards={emptyHazards}
            hostiles={[]}
            hazardFields={hazardFields}
            laserTargets={[]}
            shipRef={mapShipRef}
            onMaterialPickup={onMaterialPickup}
            materialDropsRef={materialDrops}
            spawnAnchorRef={dockedAtRemnant ? dockedStationRef : misplantedGate}
            spawnPlanetRef={dockedAtRemnant ? dockedStationRef : undefined}
            spawnClearance={
              dockedAtRemnant
                ? (dockedSpec?.attachClearance ?? PORTAL_EXIT_CLEARANCE)
                : PORTAL_EXIT_CLEARANCE
            }
            dockBerths={dockBerths}
            dockStationName={dockStationName}
            docked={docked}
            paused={paused}
            onLockChange={onLockChange}
            onTelemetry={onTelemetry}
            onDockAvailable={onDockAvailable}
            initialHull={initialHull}
            healRequest={healRequest}
            adminWarpRequest={spawnWarpRequest}
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
        </>
      )}

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
        sunColor={VOID_SUN_COLOR}
        starName={VOID_STAR_NAME}
        beltInner={VOID_BELT_INNER}
        beltOuter={VOID_BELT_OUTER}
        bodies={mapBodies}
        shipRef={mapShipRef}
        banditRefs={emptyBandits}
        patrolRefs={emptyPatrols}
        stations={mapStations}
        hideNpcsRef={mapCloakRef}
      />

      {/* One SNR veil — quadrants gradient magenta→cyan→gold→violet. */}
      <Nebula
        origin={sunPosition}
        shellIntensity={shellIntensity}
        quadrantColors={DEFAULT_QUADRANT_COLORS}
        wispInner={VOID_NEBULA_INNER}
        wispOuter={VOID_NEBULA_OUTER}
        wispCount={wispCount}
        wispMinScale={220}
        wispMaxScale={620}
        wispOpacity={wispOpacity}
        fadeStart={VOID_NEBULA_FADE_START}
        fadeEnd={VOID_NEBULA_FADE_END}
        seed={41}
        paused={paused}
        shellRenderOrder={-1100}
        wispRenderOrder={-50}
      />
      {/* Depth layer — same azimuthal field, softer / slightly larger.
          Distinct renderOrders: both wisp meshes sit at origin (shader
          offsets), so identical orders can flip and strobe under bloom. */}
      <Nebula
        origin={sunPosition}
        shellIntensity={shellIntensity * 0.35}
        quadrantColors={DEFAULT_QUADRANT_COLORS}
        wispInner={VOID_NEBULA_INNER + 60}
        wispOuter={VOID_NEBULA_OUTER + 160}
        wispCount={Math.round(wispCount * 0.55)}
        wispMinScale={280}
        wispMaxScale={720}
        wispOpacity={wispOpacity * 0.55}
        fadeStart={VOID_NEBULA_FADE_START}
        fadeEnd={VOID_NEBULA_FADE_END}
        seed={119}
        paused={paused}
        shellRenderOrder={-1101}
        wispRenderOrder={-55}
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

      {gfx.bloomScale > 0 && (
        <Suspense fallback={null}>
          <ScenePostFX
            multisampling={gfx.composerMultisampling}
            intensity={bloomIntensity * gfx.bloomScale}
            luminanceThreshold={bloomThreshold}
            luminanceSmoothing={0.96}
          />
        </Suspense>
      )}
    </>
  )
})
