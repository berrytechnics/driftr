import { Environment, Lightformer } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useMemo,
  useRef,
  type RefObject,
} from 'react'
import {
  Group,
  Object3D,
  Vector3,
  type DirectionalLight,
} from 'three'
import cassiniUrl from '@/assets/models/Cassini_Huygens.glb?url'
import tugUrl from '@/assets/models/Ship_Tug.glb?url'
import arid from '@/assets/textures/planets/Arid.webp'
import ashen from '@/assets/textures/planets/Ashen.webp'
import frozen from '@/assets/textures/planets/Frozen.webp'
import rocky from '@/assets/textures/planets/Rocky.webp'
import type { CombatHudState } from '@/combat/combatHud'
import type { HullSnapshot } from '@/game/persist'
import type { AdminWarpRequest } from '@/dev/adminTypes'
import {
  ALT_BELT_INNER,
  ALT_BELT_OUTER,
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
  ALT_TUG_TOAST,
} from '@/lore/easterEggs'
import { FloatingWreck } from '@/lore/FloatingWreck'
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
  adminWarpTarget?: AdminWarpRequest | null
}) {
  const innerPlanet = useRef<Group>(null)
  const midPlanet = useRef<Group>(null)
  const nyxPlanet = useRef<Group>(null)
  const outerPlanet = useRef<Group>(null)
  const nyxStation = useRef<Group>(null)
  const tugStation = useRef<Group>(null)
  const cassiniWreck = useRef<Group>(null)
  const mapCloakRef = useRef(false)
  const asteroidHazards = useRef<HazardField | null>(null)
  const materialDrops = useRef<MaterialDropsHandle | null>(null)
  const dockedAtTug = docked && dockStationName === STATION_NAMES.nyxTug

  const sunSize = ALT_SUN_SIZE
  const sunColor = ALT_SUN_COLOR
  const sunIntensity = ALT_SUN_INTENSITY
  const sunPosition = useMemo(
    () => [0, 40, -280] as [number, number, number],
    [],
  )
  const mu = 4000
  const hazardFields = useMemo(() => [asteroidHazards], [])

  const adminWarpRequest = useMemo(() => {
    if (!adminWarpTarget) return null
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
  }, [adminWarpTarget, sunPosition])

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

  const dockBerths = useMemo<DockBerth[]>(
    () => [
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
    ],
    [],
  )

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
    ],
    [],
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
      <ambientLight intensity={0.12} color="#6a78a8" />
      <SunLight
        sunPosition={sunPosition}
        intensity={sunIntensity * 1.15}
        color={sunColor}
      />

      <Environment background={false} resolution={128} environmentIntensity={0.4}>
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
        position={sunPosition}
        size={sunSize}
        color={sunColor}
        intensity={sunIntensity}
        flowSpeed={0.85}
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
        shellIntensity={0.48}
        colorA="#3a2a78"
        colorB="#1e3a68"
        colorC="#6a3858"
        wispInner={ALT_BELT_INNER - 20}
        wispOuter={ALT_BELT_OUTER + 80}
        wispCount={56}
        wispOpacity={0.24}
        paused={paused}
      />

      <Starfield
        radius={1400}
        depth={90}
        count={4200}
        factor={3.2}
        saturation={0.35}
        fade
        speed={0.35}
      />

      <EffectComposer enableNormalPass={false} multisampling={0}>
        <Bloom
          intensity={0.38}
          luminanceThreshold={0.72}
          luminanceSmoothing={0.9}
          mipmapBlur
        />
      </EffectComposer>
    </>
  )
})
