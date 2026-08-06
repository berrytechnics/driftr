import { Environment, Lightformer } from '@react-three/drei'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { folder, useControls } from 'leva'
import { memo, useCallback, useMemo, useRef, type RefObject } from 'react'
import { Group, Vector3, type Object3D } from 'three'
import type { CombatHudState } from '@/combat/combatHud'
import type { AdminWarpRequest, GateArrivalRequest } from '@/dev/adminTypes'
import type { HullSnapshot } from '@/game/persist'
import {
  VOID_BELT_INNER,
  VOID_BELT_OUTER,
  VOID_GATE_ORBIT_INCLINATION,
  VOID_GATE_ORBIT_SPEED,
  VOID_MOTHERSHIP_MAP_SIZE,
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
import { altGateMapLabel, VOID_MOTHERSHIP_MAP_LABEL } from '@/lore/easterEggs'
import { Mothership } from '@/lore/Mothership'
import {
  GATE_MAP_SIZE,
  MisplantedGate,
  PORTAL_EXIT_CLEARANCE,
  VOID_GATE_OFFSET,
  gatePortalExitWorld,
} from '@/lore/MisplantedGate'
import type { PlayerCargoStatus } from '@/loot/cargoBait'
import type { MaterialKind } from '@/loot/economy'
import {
  MaterialDrops,
  type MaterialDropsHandle,
  type MaterialPickup,
} from '@/loot/MaterialDrops'
import { MapTracker, type TrackedBody } from '@/map/MapTracker'
import { MapWaypointTracker } from '@/map/MapWaypointTracker'
import type { MapWaypointState } from '@/map/mapWaypoint'
import type { MapSnapshot } from '@/map/systemMap'
import type { AttitudeHudState } from '@/ship/attitudeHud'
import {
  PlayerShip,
  type HazardField,
  type OrbitalTelemetry,
} from '@/ship/PlayerShip'
import { AsteroidBelt } from '@/world/AsteroidBelt'
import { Nebula, DEFAULT_QUADRANT_COLORS } from '@/world/Nebula'
import { Starfield } from '@/world/Starfield'
import { Sun } from '@/world/Sun'

/** Black dwarf at the hollow remnant core — gate orbits this. */
const VOID_SUN_POSITION: [number, number, number] = [0, 0, 0]

/**
 * Supernova remnant pocket past the misplanted gate —
 * cooled black dwarf, empty cavity, dense outer nebula, and the matching ring.
 */
export const GateVoidSpace = memo(function GateVoidSpace({
  started,
  paused,
  docked,
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
}: {
  started: boolean
  paused: boolean
  docked: boolean
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
}) {
  const misplantedGate = useRef<Group>(null)
  const mothership = useRef<Group>(null)
  const gateHazards = useRef<HazardField | null>(null)
  const asteroidHazards = useRef<HazardField | null>(null)
  const mothershipHazards = useRef<HazardField | null>(null)
  const materialDrops = useRef<MaterialDropsHandle | null>(null)
  const mapCloakRef = useRef(false)
  const emptyBerths = useMemo(() => [], [])
  const emptyHazards = useMemo(() => [], [])
  const hazardFields = useMemo(
    () => [asteroidHazards, gateHazards, mothershipHazards],
    [],
  )

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
            value: 0.85,
            min: 0,
            max: 4,
            step: 0.05,
            label: 'Bloom',
          },
          bloomThreshold: {
            value: 0.48,
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
            value: 1.85,
            min: 0,
            max: 3,
            step: 0.02,
            label: 'Shell',
          },
          wispCount: {
            value: 560,
            min: 0,
            max: 900,
            step: 2,
            label: 'Wisps (per layer)',
          },
          wispOpacity: {
            value: 0.68,
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
    // Reload into the remnant — no pad to undock from; start at the throat.
    const exit = gatePortalExitWorld(sunPosition, VOID_GATE_OFFSET)
    return { seq: 1, ...exit }
  }, [gateArrival, adminWarpTarget, sunPosition])

  const mapBodies = useMemo<TrackedBody[]>(
    () => [
      {
        name: altGateMapLabel(gatePortalUsed),
        object: misplantedGate,
        size: GATE_MAP_SIZE,
        color: '#6b5cff',
        kind: 'moon',
      },
      {
        name: VOID_MOTHERSHIP_MAP_LABEL,
        object: mothership,
        size: VOID_MOTHERSHIP_MAP_SIZE,
        color: '#9a9588',
        kind: 'planet',
      },
    ],
    [gatePortalUsed],
  )

  const emptyBandits = useMemo(() => [], [])
  const emptyPatrols = useMemo(() => [], [])
  const emptyStations = useMemo(() => [], [])

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

      <Mothership
        sunPosition={sunPosition}
        paused={paused}
        shipRef={mothership}
        hazardRef={mothershipHazards}
      />

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
            spawnAnchorRef={misplantedGate}
            spawnClearance={PORTAL_EXIT_CLEARANCE}
            dockBerths={emptyBerths}
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
        stations={emptyStations}
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
      />
      {/* Depth layer — same azimuthal field, softer / slightly larger. */}
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
      </EffectComposer>
    </>
  )
})
