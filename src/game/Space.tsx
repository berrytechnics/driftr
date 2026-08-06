import { Environment, Lightformer } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { folder, useControls } from 'leva'
import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from 'react'
import {
  Group,
  Object3D,
  Vector3,
  type DirectionalLight,
  type Mesh,
} from 'three'
import { BanditShip } from '@/ship/BanditShip'
import { PatrolShip } from '@/ship/PatrolShip'
import type { LaserTarget } from '@/ship/ShipWeapons'
import { sensorRangeForOwned } from '@/loot/shop'
import stationAresUrl from '@/assets/models/space_station.glb?url'
import stationKronosUrl from '@/assets/models/space__station.glb?url'
import gaseous from '@/assets/textures/planets/Gaseous2.webp'
import gaseousOuter from '@/assets/textures/planets/Gaseous4.webp'
import icy from '@/assets/textures/planets/Icy.webp'
import martian from '@/assets/textures/planets/Martian.webp'
import tropical from '@/assets/textures/planets/Tropical.webp'
import volcanic from '@/assets/textures/planets/Volcanic.webp'
import { BuffDrops, type BuffDropsHandle } from '@/loot/BuffDrops'
import {
  clearCargoBait,
  createEmptyCargoBait,
  writeCargoBait,
  type CargoBait,
  type PlayerCargoStatus,
} from '@/loot/cargoBait'
import type { CargoHold, MaterialKind } from '@/loot/economy'
import {
  MaterialDrops,
  type MaterialDropsHandle,
  type MaterialPickup,
} from '@/loot/MaterialDrops'
import { CombatTracker } from '@/combat/CombatTracker'
import {
  createEmptyBanditCombat,
  type BanditCombatState,
  type CombatHudState,
} from '@/combat/combatHud'
import type { HullSnapshot } from '@/game/persist'
import { MapTracker, type TrackedStation } from '@/map/MapTracker'
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
import type { TorpedoSeekTarget } from '@/ship/ShipTorpedoes'
import { AsteroidBelt } from '@/world/AsteroidBelt'
import { PlanetMoons } from '@/world/Moons'
import { Nebula } from '@/world/Nebula'
import { Planet } from '@/world/Planet'
import { Starfield } from '@/world/Starfield'
import { StableGodRays } from '@/world/StableGodRays'
import { Sun } from '@/world/Sun'
import { AshFlare } from '@/lore/AshFlare'
import { NyxBeacon } from '@/lore/NyxBeacon'
import {
  NyxDerelict,
  NYX_TRANSIT_DOCK_RANGE,
} from '@/lore/NyxDerelict'
import { NYX_NEAR_PAD, NYX_APOAPSIS } from '@/lore/easterEggs'
import type { MapLorePing } from '@/map/systemMap'
import type { AdminWarpRequest } from '@/dev/adminTypes'
import {
  BELT_INNER,
  BELT_ORBIT,
  BELT_OUTER,
  BELT_PLANET_SIZE,
  GAS_GIANT_SIZE,
  GAS_ORBIT,
  INNER_ORBIT,
  INNER_PLANET_SIZE,
  MERCURY_ORBIT,
  MERCURY_SIZE,
  MID_ORBIT,
  MID_PLANET_SIZE,
  MOON_NAMES,
  MOON_SIZES,
  OUTER_DWARF_ECC,
  OUTER_DWARF_ORBIT,
  OUTER_DWARF_SIZE,
  OUTER_GAS_ORBIT,
  OUTER_GAS_SIZE,
  PLANET_NAMES,
  STAR_NAME,
  STATION_NAMES,
  SUN_SIZE,
} from '@/game/systemConfig'
import {
  NYX_TRANSIT_HIT_RADIUS,
  STATION_HIT_RADIUS,
} from '@/world/hitRadii'

const SpaceStation = lazy(() =>
  import('@/world/SpaceStation').then((m) => ({ default: m.SpaceStation })),
)

/** Expire jettison bait if scavengers never claim it. */
function CargoBaitClock({
  baitRef,
  materialDrops,
  paused,
}: {
  baitRef: MutableRefObject<CargoBait>
  materialDrops: RefObject<MaterialDropsHandle | null>
  paused: boolean
}) {
  useFrame((_, delta) => {
    if (paused) return
    const bait = baitRef.current
    if (!bait.active) return
    bait.life -= Math.min(delta, 0.05)
    if (bait.life <= 0) {
      clearCargoBait(bait)
      materialDrops.current?.clearScavenge()
    }
  })
  return null
}

/**
 * Parallel sunlight that matches the visible sun near the camera.
 * Default DirectionalLight aims at world origin, but this system orbits an
 * offset star — so we re-aim at the camera each frame.
 */
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

export const Space = memo(function Space({
  started,
  paused,
  docked,
  dockStationName,
  beltResetSeed = 0,
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
  sensorsOwned = false,
  playerCargoRef,
  jettisonDump,
  onJettisonCargo,
  nyxDerelictSeen = false,
  onNyxDerelictSeen,
  nyxCorridorUnlockedRef,
  nyxTransitDockable = false,
  nyxApoMarkActive = false,
  nyxHyperionRumorHeard = false,
  adminWarpTarget = null,
}: {
  started: boolean
  paused: boolean
  docked: boolean
  /** Current hard-dock pad — keeps spawn on Nyx Transit after a sky swap. */
  dockStationName?: string
  beltResetSeed?: number
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
  sensorsOwned?: boolean
  playerCargoRef: RefObject<PlayerCargoStatus>
  jettisonDump: {
    seq: number
    x: number
    y: number
    z: number
    cargo: CargoHold
    ashOffering?: boolean
  } | null
  onJettisonCargo: (x: number, y: number, z: number) => void
  nyxDerelictSeen?: boolean
  onNyxDerelictSeen?: (toast: string) => void
  nyxCorridorUnlockedRef?: RefObject<boolean>
  /** Night shards > 0 — Nyx Transit becomes a DockBerth. */
  nyxTransitDockable?: boolean
  /** Sticky map mark at apo after Hyperion clue. */
  nyxApoMarkActive?: boolean
  /** Hyperion apo clue — gold Transit pip on the map. */
  nyxHyperionRumorHeard?: boolean
  /** Dev admin warp target — resolved against Sol sun position. */
  adminWarpTarget?: AdminWarpRequest | null
}) {
  const sunMesh = useRef<Mesh>(null!)
  const mercuryPlanet = useRef<Group>(null)
  const innerPlanet = useRef<Group>(null)
  const midPlanet = useRef<Group>(null)
  const beltPlanet = useRef<Group>(null)
  const gasGiant = useRef<Group>(null)
  const outerGasGiant = useRef<Group>(null)
  const outerDwarf = useRef<Group>(null)
  const thalassaStation = useRef<Group>(null)
  const aresStation = useRef<Group>(null)
  const kronosStation = useRef<Group>(null)
  const nyxTransitStation = useRef<Group>(null)
  const aresMoon = useRef<Group>(null)
  const boreasMoon = useRef<Group>(null)
  const thalassaMoon = useRef<Group>(null)
  const kronosMoonA = useRef<Group>(null)
  const kronosMoonB = useRef<Group>(null)
  const kronosMoonC = useRef<Group>(null)
  const ouranosMoonA = useRef<Group>(null)
  const ouranosMoonB = useRef<Group>(null)
  const asteroidHazards = useRef<HazardField | null>(null)
  /** True while advanced thruster burn is active — blanks NPC map contacts */
  const mapCloakRef = useRef(false)
  const nyxOrbitGlowRef = useRef(0)
  const lorePingsRef = useRef<MapLorePing[]>([])
  const [ashFlare, setAshFlare] = useState<{
    seq: number
    x: number
    y: number
    z: number
  } | null>(null)
  const sensorRangeRef = useRef(sensorRangeForOwned(sensorsOwned))
  sensorRangeRef.current = sensorRangeForOwned(sensorsOwned)
  const buffDrops = useRef<BuffDropsHandle | null>(null)
  const materialDrops = useRef<MaterialDropsHandle | null>(null)
  const cargoBaitRef = useRef<CargoBait>(createEmptyCargoBait())
  const lastJettisonSeq = useRef(0)
  const playerLaserHitRef = useRef<LaserTarget | null>(null)
  const banditLaserHitRef = useRef<LaserTarget | null>(null)
  const banditHostileRef = useRef<CollisionHazard | null>(null)
  const banditMapRef = useRef<Group | null>(null)
  const banditCombatRef = useRef<BanditCombatState>(createEmptyBanditCombat())
  const bandit2LaserHitRef = useRef<LaserTarget | null>(null)
  const bandit2HostileRef = useRef<CollisionHazard | null>(null)
  const bandit2MapRef = useRef<Group | null>(null)
  const bandit2CombatRef = useRef<BanditCombatState>(createEmptyBanditCombat())
  const playerLaserTargets = useMemo(
    () => [banditLaserHitRef, bandit2LaserHitRef],
    [],
  )
  const playerHostiles = useMemo(
    () => [banditHostileRef, bandit2HostileRef],
    [],
  )
  const banditMapRefs = useMemo(() => [banditMapRef, bandit2MapRef], [])
  const banditCombatRefs = useMemo(
    () => [banditCombatRef, bandit2CombatRef],
    [],
  )
  const bandit1Allies = useMemo(() => [bandit2MapRef], [])
  const bandit2Allies = useMemo(() => [banditMapRef], [])
  const dockBerths = useMemo<DockBerth[]>(() => {
    const berths: DockBerth[] = [
      {
        station: thalassaStation,
        planet: beltPlanet,
        name: STATION_NAMES.thalassa,
        planetDockRange: BELT_PLANET_SIZE + 13.2 + DOCK_APPROACH_PAD,
      },
      {
        station: aresStation,
        planet: innerPlanet,
        name: STATION_NAMES.ares,
        planetDockRange: INNER_PLANET_SIZE + 12 + DOCK_APPROACH_PAD,
      },
      {
        station: kronosStation,
        planet: gasGiant,
        name: STATION_NAMES.kronos,
        planetDockRange: GAS_GIANT_SIZE + 55 + DOCK_APPROACH_PAD,
      },
    ]
    if (nyxTransitDockable) {
      berths.push({
        station: nyxTransitStation,
        // Apo pad is its own approach center (not Nyx’s body)
        planet: nyxTransitStation,
        name: STATION_NAMES.nyx,
        planetDockRange: NYX_TRANSIT_DOCK_RANGE,
      })
    }
    return berths
  }, [nyxTransitDockable])
  const torpedoSeekTargets = useMemo<TorpedoSeekTarget[]>(
    () => [
      { object: banditMapRef, combat: banditCombatRef },
      { object: bandit2MapRef, combat: bandit2CombatRef },
    ],
    [],
  )
  const patrolMapRef = useRef<Group | null>(null)
  const patrolLaserHitRef = useRef<LaserTarget | null>(null)
  const patrolMapRefs = useMemo(() => [patrolMapRef], [])
  const patrolRivalRefs = useMemo(() => [patrolMapRef], [])
  const patrolRivalLaserRefs = useMemo(() => [patrolLaserHitRef], [])
  const banditLaserHitRefs = useMemo(
    () => [banditLaserHitRef, bandit2LaserHitRef],
    [],
  )
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
      const buffed = buffDrops.current?.maybeSpawn(x, y, z) ?? false
      if (!buffed) materialDrops.current?.spawn(x, y, z, kind)
    },
    [],
  )

  const onBaitClaimed = useCallback(() => {
    materialDrops.current?.clearScavenge()
  }, [])

  const lastBeltReset = useRef(0)
  useEffect(() => {
    if (beltResetSeed <= 0 || beltResetSeed === lastBeltReset.current) return
    lastBeltReset.current = beltResetSeed
    materialDrops.current?.clear()
    buffDrops.current?.clear()
  }, [beltResetSeed])

  useEffect(() => {
    if (!jettisonDump || jettisonDump.seq === lastJettisonSeq.current) return
    lastJettisonSeq.current = jettisonDump.seq
    if (jettisonDump.ashOffering) {
      setAshFlare({
        seq: jettisonDump.seq,
        x: jettisonDump.x,
        y: jettisonDump.y,
        z: jettisonDump.z,
      })
      return
    }
    writeCargoBait(
      cargoBaitRef.current,
      jettisonDump.seq,
      jettisonDump.x,
      jettisonDump.y,
      jettisonDump.z,
      jettisonDump.cargo,
    )
    materialDrops.current?.spawnDump(
      jettisonDump.x,
      jettisonDump.y,
      jettisonDump.z,
      jettisonDump.cargo,
    )
  }, [jettisonDump])

  const [sunReady, setSunReady] = useState(false)
  const onSunReady = useCallback((mesh: Mesh | null) => {
    setSunReady(!!mesh)
  }, [])

  const planetHazards = useMemo<CollisionHazard[]>(() => {
    const list: CollisionHazard[] = [
      {
        object: mercuryPlanet,
        radius: MERCURY_SIZE,
        name: PLANET_NAMES.mercury,
        kind: 'planet',
      },
      {
        object: innerPlanet,
        radius: INNER_PLANET_SIZE,
        name: PLANET_NAMES.inner,
        kind: 'planet',
      },
      {
        object: midPlanet,
        radius: MID_PLANET_SIZE,
        name: PLANET_NAMES.mid,
        kind: 'planet',
      },
      {
        object: beltPlanet,
        radius: BELT_PLANET_SIZE,
        name: PLANET_NAMES.belt,
        kind: 'planet',
      },
      {
        object: gasGiant,
        radius: GAS_GIANT_SIZE,
        name: PLANET_NAMES.gas,
        kind: 'planet',
      },
      {
        object: outerGasGiant,
        radius: OUTER_GAS_SIZE,
        name: PLANET_NAMES.outerGas,
        kind: 'planet',
      },
      {
        object: outerDwarf,
        radius: OUTER_DWARF_SIZE,
        name: PLANET_NAMES.outerDwarf,
        kind: 'planet',
        nearPad: NYX_NEAR_PAD,
      },
      {
        object: aresMoon,
        radius: MOON_SIZES.ares,
        name: MOON_NAMES.ares,
        kind: 'moon',
      },
      {
        object: boreasMoon,
        radius: MOON_SIZES.boreas,
        name: MOON_NAMES.boreas,
        kind: 'moon',
      },
      {
        object: thalassaMoon,
        radius: MOON_SIZES.thalassa,
        name: MOON_NAMES.thalassa,
        kind: 'moon',
      },
      {
        object: kronosMoonA,
        radius: MOON_SIZES.kronosA,
        name: MOON_NAMES.kronosA,
        kind: 'moon',
      },
      {
        object: kronosMoonB,
        radius: MOON_SIZES.kronosB,
        name: MOON_NAMES.kronosB,
        kind: 'moon',
      },
      {
        object: kronosMoonC,
        radius: MOON_SIZES.kronosC,
        name: MOON_NAMES.kronosC,
        kind: 'moon',
      },
      {
        object: ouranosMoonA,
        radius: MOON_SIZES.ouranosA,
        name: MOON_NAMES.ouranosA,
        kind: 'moon',
      },
      {
        object: ouranosMoonB,
        radius: MOON_SIZES.ouranosB,
        name: MOON_NAMES.ouranosB,
        kind: 'moon',
      },
      // Live pads — lethal if you clip the hull; dock via the approach shell
      { object: aresStation, radius: STATION_HIT_RADIUS.ares },
      { object: thalassaStation, radius: STATION_HIT_RADIUS.thalassa },
      { object: kronosStation, radius: STATION_HIT_RADIUS.kronos },
    ]
    // Keyed Nyx Transit only — ghost / offline apo pad stays ethereal
    if (nyxTransitDockable) {
      list.push({
        object: nyxTransitStation,
        radius: NYX_TRANSIT_HIT_RADIUS,
      })
    }
    return list
  }, [nyxTransitDockable])
  const hazardFields = useMemo(() => [asteroidHazards], [])
  const mapBodies = useMemo(
    () => [
      {
        name: PLANET_NAMES.mercury,
        object: mercuryPlanet,
        size: MERCURY_SIZE,
        color: '#a85a3a',
        inclination: 0.18,
      },
      {
        name: PLANET_NAMES.inner,
        object: innerPlanet,
        size: INNER_PLANET_SIZE,
        color: '#c45c3e',
        inclination: 0.12,
      },
      {
        name: PLANET_NAMES.mid,
        object: midPlanet,
        size: MID_PLANET_SIZE,
        color: '#9ec9e8',
        inclination: -0.08,
      },
      {
        name: PLANET_NAMES.belt,
        object: beltPlanet,
        size: BELT_PLANET_SIZE,
        color: '#3d9e6f',
        inclination: 0.05,
      },
      {
        name: PLANET_NAMES.gas,
        object: gasGiant,
        size: GAS_GIANT_SIZE,
        color: '#d4a574',
        inclination: -0.04,
      },
      {
        name: PLANET_NAMES.outerGas,
        object: outerGasGiant,
        size: OUTER_GAS_SIZE,
        color: '#6b8cae',
        inclination: 0.06,
      },
      {
        name: PLANET_NAMES.outerDwarf,
        object: outerDwarf,
        size: OUTER_DWARF_SIZE,
        color: '#7a6b8a',
        guideOrbit: OUTER_DWARF_ORBIT,
        eccentricity: OUTER_DWARF_ECC,
        periapsisPhase: 5.6,
        inclination: 0.22,
      },
      {
        name: MOON_NAMES.ares,
        object: aresMoon,
        size: MOON_SIZES.ares,
        color: '#b0a090',
        kind: 'moon' as const,
      },
      {
        name: MOON_NAMES.boreas,
        object: boreasMoon,
        size: MOON_SIZES.boreas,
        color: '#d8e8f4',
        kind: 'moon' as const,
      },
      {
        name: MOON_NAMES.thalassa,
        object: thalassaMoon,
        size: MOON_SIZES.thalassa,
        color: '#9a9588',
        kind: 'moon' as const,
      },
      {
        name: MOON_NAMES.kronosA,
        object: kronosMoonA,
        size: MOON_SIZES.kronosA,
        color: '#c4b8a8',
        kind: 'moon' as const,
      },
      {
        name: MOON_NAMES.kronosB,
        object: kronosMoonB,
        size: MOON_SIZES.kronosB,
        color: '#e8f0f6',
        kind: 'moon' as const,
      },
      {
        name: MOON_NAMES.kronosC,
        object: kronosMoonC,
        size: MOON_SIZES.kronosC,
        color: '#d2a878',
        kind: 'moon' as const,
      },
      {
        name: MOON_NAMES.ouranosA,
        object: ouranosMoonA,
        size: MOON_SIZES.ouranosA,
        color: '#c8dcec',
        kind: 'moon' as const,
      },
      {
        name: MOON_NAMES.ouranosB,
        object: ouranosMoonB,
        size: MOON_SIZES.ouranosB,
        color: '#f0f4f8',
        kind: 'moon' as const,
      },
    ],
    [],
  )

  const mapStations = useMemo(() => {
    const list: TrackedStation[] = [
      {
        name: STATION_NAMES.ares,
        object: aresStation,
        host: innerPlanet,
        hostSize: INNER_PLANET_SIZE,
      },
      {
        name: STATION_NAMES.thalassa,
        object: thalassaStation,
        host: beltPlanet,
        hostSize: BELT_PLANET_SIZE,
      },
      {
        name: STATION_NAMES.kronos,
        object: kronosStation,
        host: gasGiant,
        hostSize: GAS_GIANT_SIZE,
      },
    ]
    if (nyxApoMarkActive || nyxDerelictSeen || nyxTransitDockable) {
      list.push({
        name: STATION_NAMES.nyx,
        object: nyxTransitStation,
        host: outerDwarf,
        hostSize: OUTER_DWARF_SIZE,
        // Dead apo pad — never ring Nyx; gold pip only after Hyperion clue
        hostRing: false,
        showPip: nyxHyperionRumorHeard,
      })
    }
    return list
  }, [
    nyxApoMarkActive,
    nyxDerelictSeen,
    nyxTransitDockable,
    nyxHyperionRumorHeard,
  ])

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
  } = useControls(
    'Env',
    {
    lighting: folder(
      {
        ambient: {
          value: 0.14,
          min: 0,
          max: 1,
          step: 0.01,
          label: 'Ambient',
        },
        envFill: {
          value: 0.45,
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
        sunColor: { value: '#ffdfb9', label: 'Color' },
        sunIntensity: {
          value: 4.15,
          min: 0,
          max: 8,
          step: 0.05,
          label: 'Intensity',
        },
        sunDistance: {
          value: 520,
          min: 80,
          max: 1200,
          step: 5,
          label: 'Distance',
        },
        elevation: { value: 18, min: -60, max: 80, step: 1 },
        azimuth: { value: 35, min: 0, max: 360, step: 1 },
        flowSpeed: {
          value: 1,
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
          value: 0.85,
          min: 0,
          max: 4,
          step: 0.05,
          label: 'Bloom',
        },
        bloomThreshold: {
          value: 0.65,
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
        count: { value: 5000, min: 500, max: 12000, step: 100 },
        depth: { value: 80, min: 10, max: 200, step: 1 },
        radius: { value: 120, min: 20, max: 800, step: 5 },
        factor: { value: 5, min: 1, max: 12, step: 0.1 },
        saturation: { value: 0, min: 0, max: 1, step: 0.01 },
        fade: true,
        speed: { value: 0.4, min: 0, max: 4, step: 0.05 },
      },
      { collapsed: true },
    ),
    nebula: folder(
      {
        shellIntensity: {
          value: 0.38,
          min: 0,
          max: 1.2,
          step: 0.02,
          label: 'Shell',
        },
        wispCount: {
          value: 40,
          min: 0,
          max: 120,
          step: 1,
          label: 'Wisps',
        },
        wispOpacity: {
          value: 0.16,
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
          value: 8000,
          min: 500,
          max: 500000,
          step: 500,
          label: 'μ (GM)',
        },
      },
      { collapsed: true },
    ),
  },
    { order: 1 },
  )
  const sunSize = SUN_SIZE

  const { scale, metalness, roughness, envMapIntensity } = useControls(
    'Ship',
    {
      look: folder(
        {
          scale: { value: 0.08, min: 0.01, max: 2, step: 0.01 },
          metalness: { value: 0.38, min: 0, max: 1, step: 0.01 },
          roughness: { value: 0.42, min: 0, max: 1, step: 0.01 },
          envMapIntensity: {
            value: 0.55,
            min: 0,
            max: 2,
            step: 0.01,
            label: 'Reflection',
          },
        },
        { collapsed: true },
      ),
    },
    { order: 2 },
  )

  const {
    beltCount,
    beltThickness,
    beltInclination,
    beltSizeScale,
    glowNightShard,
    meshDetail,
    largeLumps,
    mediumLumps,
    fineLumps,
    rockFreq,
    rockBump,
    rockContrast,
    rockRoughness,
    rockMetalness,
  } = useControls('Belt', {
    layout: folder(
      {
        beltCount: {
          value: 7600,
          min: 200,
          max: 8000,
          step: 50,
          label: 'Count',
        },
        beltThickness: {
          value: 60,
          min: 2,
          max: 120,
          step: 1,
          label: 'Thickness',
        },
        beltSizeScale: {
          value: 0.75,
          min: 0.15,
          max: 4,
          step: 0.05,
          label: 'Rock size',
        },
        beltInclination: {
          value: 0.16,
          min: -0.4,
          max: 0.4,
          step: 0.01,
          label: 'Inclination',
        },
        glowNightShard: {
          value: false,
          label: 'Glow Nyx dust rock',
        },
      },
      { collapsed: false },
    ),
    shape: folder(
      {
        meshDetail: {
          value: 3,
          min: 1,
          max: 7,
          step: 1,
          label: 'Mesh detail',
        },
        largeLumps: {
          value: 0.3,
          min: 0,
          max: 0.55,
          step: 0.01,
          label: 'Large lumps',
        },
        mediumLumps: {
          value: 0.08,
          min: 0,
          max: 0.4,
          step: 0.01,
          label: 'Medium lumps',
        },
        fineLumps: {
          value: 0.07,
          min: 0,
          max: 0.25,
          step: 0.005,
          label: 'Fine lumps',
        },
      },
      { collapsed: true },
    ),
    texture: folder(
      {
        rockFreq: {
          value: 5.7,
          min: 0.2,
          max: 6,
          step: 0.05,
          label: 'Noise scale',
        },
        rockBump: {
          value: 2.55,
          min: 0,
          max: 3,
          step: 0.05,
          label: 'Bump',
        },
        rockContrast: {
          value: 0.45,
          min: 0,
          max: 0.9,
          step: 0.01,
          label: 'Contrast',
        },
        rockRoughness: {
          value: 0.96,
          min: 0.4,
          max: 1,
          step: 0.01,
          label: 'Roughness',
        },
        rockMetalness: {
          value: 0.06,
          min: 0,
          max: 0.5,
          step: 0.01,
          label: 'Metalness',
        },
      },
      { collapsed: true },
    ),
  },
    { order: 3 },
  )
  const asteroidShape = useMemo(
    () => ({ meshDetail, largeLumps, mediumLumps, fineLumps }),
    [meshDetail, largeLumps, mediumLumps, fineLumps],
  )
  const asteroidTexture = useMemo(
    () => ({
      rockFreq,
      rockBump,
      rockContrast,
      roughness: rockRoughness,
      metalness: rockMetalness,
    }),
    [rockFreq, rockBump, rockContrast, rockRoughness, rockMetalness],
  )

  const beltInner = BELT_INNER
  const beltOuter = BELT_OUTER

  const sunPosition = useMemo(() => {
    const phi = ((90 - elevation) * Math.PI) / 180
    const theta = (azimuth * Math.PI) / 180
    const pos = new Vector3().setFromSphericalCoords(sunDistance, phi, theta)
    return [pos.x, pos.y, pos.z] as [number, number, number]
  }, [azimuth, elevation, sunDistance])

  const adminWarpRequest = useMemo(() => {
    if (!adminWarpTarget) return null
    const orbit =
      adminWarpTarget.id === 'sun'
        ? SUN_SIZE + 80
        : adminWarpTarget.id === 'inner'
          ? MERCURY_ORBIT
          : adminWarpTarget.id === 'belt'
            ? (BELT_INNER + BELT_OUTER) * 0.5
            : adminWarpTarget.id === 'outer'
              ? GAS_ORBIT
              : NYX_APOAPSIS
    return {
      seq: adminWarpTarget.seq,
      x: sunPosition[0] + orbit,
      y: sunPosition[1],
      z: sunPosition[2],
    }
  }, [adminWarpTarget, sunPosition])

  return (
    <>
      <color attach="background" args={['#000008']} />

      {/* Soft space fill — enough to read planet color without washing them out */}
      <ambientLight intensity={ambient} color="#7a8db0" />
      {/* Directional = constant sunlight; aimed sun → camera (see SunLight) */}
      <SunLight
        sunPosition={sunPosition}
        intensity={sunIntensity * 1.15}
        color={sunColor}
      />

      {/* Cool fill only — a sun lightformer baked from world origin sits in the
          wrong sky direction once you leave the origin for planetary orbits */}
      <Environment
        background={false}
        resolution={128}
        environmentIntensity={envFill}
      >
        <Lightformer
          intensity={0.35}
          color="#6a82a8"
          scale={28}
          position={[-40, 25, 20]}
        />
        <Lightformer
          intensity={0.2}
          color="#2a3548"
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
      />

      <Suspense fallback={null}>
        {/* Innermost scorched rock — Mercury analogue */}
        <Planet
          planetRef={mercuryPlanet}
          sunPosition={sunPosition}
          sunSize={sunSize}
          orbitRadius={MERCURY_ORBIT}
          mu={mu}
          orbitSpeedScale={0.1}
          map={volcanic}
          size={MERCURY_SIZE}
          color="#d8c4b0"
          phase={4.2}
          inclination={0.18}
          spin={0.12}
          paused={paused}
        />
        <Planet
          planetRef={innerPlanet}
          sunPosition={sunPosition}
          sunSize={sunSize}
          orbitRadius={INNER_ORBIT}
          mu={mu}
          orbitSpeedScale={0.1}
          map={martian}
          size={INNER_PLANET_SIZE}
          color="#ffffff"
          phase={0.4}
          inclination={0.12}
          spin={0.08}
          paused={paused}
        />
        <PlanetMoons
          planetRef={innerPlanet}
          planetSize={INNER_PLANET_SIZE}
          paused={paused}
          moons={[
            {
              size: MOON_SIZES.ares,
              orbitAltitude: 15.6,
              orbitSpeed: 0.11,
              inclination: 0.14,
              phase: 1.1,
              map: martian,
              color: '#b0a090',
              spin: 0.05,
              moonRef: aresMoon,
            },
          ]}
        />
        {started && (
          <SpaceStation
            planetRef={innerPlanet}
            planetSize={INNER_PLANET_SIZE}
            modelUrl={stationAresUrl}
            orbitAltitude={12}
            orbitSpeed={0.08}
            inclination={0.12}
            phase={2.4}
            scale={0.26}
            paused={paused}
            stationRef={aresStation}
          />
        )}
        <Planet
          planetRef={midPlanet}
          sunPosition={sunPosition}
          sunSize={sunSize}
          orbitRadius={MID_ORBIT}
          mu={mu}
          orbitSpeedScale={0.1}
          map={icy}
          size={MID_PLANET_SIZE}
          color="#ffffff"
          phase={2.8}
          inclination={-0.08}
          spin={0.04}
          paused={paused}
        />
        <PlanetMoons
          planetRef={midPlanet}
          planetSize={MID_PLANET_SIZE}
          paused={paused}
          moons={[
            {
              size: MOON_SIZES.boreas,
              orbitAltitude: 19.2,
              orbitSpeed: 0.08,
              inclination: -0.2,
              phase: 0.4,
              map: icy,
              color: '#d8e8f4',
              spin: 0.04,
              moonRef: boreasMoon,
            },
          ]}
        />
        {/* Just inside the asteroid belt */}
        <Planet
          planetRef={beltPlanet}
          sunPosition={sunPosition}
          sunSize={sunSize}
          orbitRadius={BELT_ORBIT}
          mu={mu}
          orbitSpeedScale={0.1}
          map={tropical}
          size={BELT_PLANET_SIZE}
          color="#ffffff"
          phase={5.1}
          inclination={0.05}
          spin={0.06}
          paused={paused}
        />
        {started && (
          <SpaceStation
            planetRef={beltPlanet}
            planetSize={BELT_PLANET_SIZE}
            orbitAltitude={13.2}
            orbitSpeed={0.07}
            inclination={0.22}
            phase={Math.PI * 0.35}
            scale={0.28}
            paused={paused}
            stationRef={thalassaStation}
          />
        )}
        <PlanetMoons
          planetRef={beltPlanet}
          planetSize={BELT_PLANET_SIZE}
          paused={paused}
          moons={[
            {
              size: MOON_SIZES.thalassa,
              orbitAltitude: 40.8,
              orbitSpeed: 0.055,
              inclination: 0.35,
              phase: 2.6,
              map: martian,
              color: '#9a9588',
              spin: 0.06,
              moonRef: thalassaMoon,
            },
          ]}
        />
        <AsteroidBelt
          sunPosition={sunPosition}
          mu={mu}
          orbitSpeedScale={0.1}
          innerRadius={beltInner}
          outerRadius={beltOuter}
          count={beltCount}
          thickness={beltThickness}
          sizeScale={beltSizeScale}
          inclination={beltInclination}
          shape={asteroidShape}
          texture={asteroidTexture}
          glowNightShard={glowNightShard}
          paused={paused}
          hazardRef={asteroidHazards}
          onRockDestroyed={onRockDestroyed}
          resetSeed={beltResetSeed}
        />
        {/* Gas giant beyond the belt */}
        <Planet
          planetRef={gasGiant}
          sunPosition={sunPosition}
          sunSize={sunSize}
          orbitRadius={GAS_ORBIT}
          mu={mu}
          orbitSpeedScale={0.1}
          map={gaseous}
          size={GAS_GIANT_SIZE}
          color="#ffffff"
          phase={1.3}
          inclination={-0.04}
          spin={0.11}
          paused={paused}
        />
        {started && (
          <SpaceStation
            planetRef={gasGiant}
            planetSize={GAS_GIANT_SIZE}
            modelUrl={stationKronosUrl}
            orbitAltitude={55}
            orbitSpeed={0.045}
            inclination={-0.2}
            phase={4.8}
            scale={0.42}
            paused={paused}
            stationRef={kronosStation}
          />
        )}
        <PlanetMoons
          planetRef={gasGiant}
          planetSize={GAS_GIANT_SIZE}
          paused={paused}
          moons={[
            {
              size: MOON_SIZES.kronosA,
              orbitAltitude: 22.8,
              orbitSpeed: 0.14,
              inclination: 0.08,
              phase: 0.2,
              map: volcanic,
              color: '#c4b8a8',
              spin: 0.1,
              moonRef: kronosMoonA,
            },
            {
              size: MOON_SIZES.kronosB,
              orbitAltitude: 43.2,
              orbitSpeed: 0.085,
              inclination: -0.12,
              phase: 2.1,
              map: icy,
              color: '#e8f0f6',
              spin: 0.07,
              moonRef: kronosMoonB,
            },
            {
              size: MOON_SIZES.kronosC,
              orbitAltitude: 72,
              orbitSpeed: 0.05,
              inclination: 0.22,
              phase: 4.0,
              map: martian,
              color: '#d2a878',
              spin: 0.05,
              moonRef: kronosMoonC,
            },
          ]}
        />
        {/* Larger ice giant further out — still smaller than Sol */}
        <Planet
          planetRef={outerGasGiant}
          sunPosition={sunPosition}
          sunSize={sunSize}
          orbitRadius={OUTER_GAS_ORBIT}
          mu={mu}
          orbitSpeedScale={0.1}
          map={gaseousOuter}
          size={OUTER_GAS_SIZE}
          color="#ffffff"
          phase={3.7}
          inclination={0.06}
          spin={0.09}
          paused={paused}
        />
        <PlanetMoons
          planetRef={outerGasGiant}
          planetSize={OUTER_GAS_SIZE}
          paused={paused}
          moons={[
            {
              size: MOON_SIZES.ouranosA,
              orbitAltitude: 27,
              orbitSpeed: 0.1,
              inclination: 0.16,
              phase: 1.4,
              map: icy,
              color: '#c8dcec',
              spin: 0.08,
              moonRef: ouranosMoonA,
            },
            {
              size: MOON_SIZES.ouranosB,
              orbitAltitude: 57,
              orbitSpeed: 0.06,
              inclination: -0.28,
              phase: 3.3,
              map: icy,
              color: '#f0f4f8',
              spin: 0.04,
              moonRef: ouranosMoonB,
            },
          ]}
        />
        {/* Distant dwarf on a stretched ellipse beyond Ouranos */}
        <Planet
          planetRef={outerDwarf}
          sunPosition={sunPosition}
          sunSize={sunSize}
          orbitRadius={OUTER_DWARF_ORBIT}
          eccentricity={OUTER_DWARF_ECC}
          startRadiusFraction={0.8}
          mu={mu}
          orbitSpeedScale={0.1}
          map={icy}
          size={OUTER_DWARF_SIZE}
          color="#c8b8d4"
          phase={5.6}
          inclination={0.22}
          spin={0.03}
          paused={paused}
        />
        <NyxDerelict
          sunPosition={sunPosition}
          playerRef={mapShipRef}
          periapsisPhase={5.6}
          inclination={0.22}
          paused={paused}
          docked={docked}
          dockable={nyxTransitDockable}
          alreadySeen={nyxDerelictSeen}
          onFirstSight={onNyxDerelictSeen}
          stationRef={nyxTransitStation}
        />
        <NyxBeacon
          nyxRef={outerDwarf}
          sunPosition={sunPosition}
          playerRef={mapShipRef}
          lorePingsRef={lorePingsRef}
          paused={paused || docked}
          apoMarkActive={nyxApoMarkActive}
          periapsisPhase={5.6}
          inclination={0.22}
        />
        <BuffDrops
          handleRef={buffDrops}
          magnetTargetRef={mapShipRef}
          paused={paused}
        />
        <MaterialDrops
          handleRef={materialDrops}
          cargoBaitRef={cargoBaitRef}
          magnetTargetRef={mapShipRef}
          paused={paused}
        />
        <CargoBaitClock
          baitRef={cargoBaitRef}
          materialDrops={materialDrops}
          paused={paused}
        />
        <PlayerShip
          scale={scale}
          metalness={metalness}
          roughness={roughness}
          envMapIntensity={envMapIntensity}
          sunPosition={sunPosition}
          sunSize={sunSize}
          mu={mu}
          hazards={planetHazards}
          hostiles={playerHostiles}
          hazardFields={hazardFields}
          laserTargets={playerLaserTargets}
          laserHitRef={playerLaserHitRef}
          shipRef={mapShipRef}
          buffDropsRef={buffDrops}
          materialDropsRef={materialDrops}
          onMaterialPickup={onMaterialPickup}
          spawnAnchorRef={
            docked && dockStationName === STATION_NAMES.nyx
              ? nyxTransitStation
              : thalassaStation
          }
          spawnPlanetRef={
            docked && dockStationName === STATION_NAMES.nyx
              ? nyxTransitStation
              : beltPlanet
          }
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
          torpedoSeekTargets={torpedoSeekTargets}
          onTorpedoAmmoChange={onTorpedoAmmoChange}
          thrusterOwned={thrusterOwned}
          combatHudRef={combatHudRef}
          attitudeHudRef={attitudeHudRef}
          mapCloakRef={mapCloakRef}
          nyxOrbitGlowRef={nyxOrbitGlowRef}
          hasCargoRef={playerCargoRef}
          onJettisonCargo={onJettisonCargo}
        />
        <BanditShip
          scale={scale}
          sunPosition={sunPosition}
          sunSize={sunSize}
          thalassaRef={beltPlanet}
          thalassaRadius={BELT_PLANET_SIZE}
          hermesRef={mercuryPlanet}
          hermesRadius={MERCURY_SIZE}
          dockBerths={dockBerths}
          hazardFields={hazardFields}
          occluders={planetHazards}
          targetRef={mapShipRef}
          playerLaserHitRef={playerLaserHitRef}
          banditLaserHitRef={banditLaserHitRef}
          hostileHazardRef={banditHostileRef}
          mapRef={banditMapRef}
          combatStateRef={banditCombatRef}
          paused={paused}
          spawnSide={1}
          variant={0}
          allyRefs={bandit1Allies}
          rivalRefs={patrolRivalRefs}
          rivalLaserHitRefs={patrolRivalLaserRefs}
          playerCargoRef={playerCargoRef}
          cargoBaitRef={cargoBaitRef}
          onBaitClaimed={onBaitClaimed}
          sensorsOwned={sensorsOwned}
        />
        <BanditShip
          scale={scale}
          sunPosition={sunPosition}
          sunSize={sunSize}
          thalassaRef={beltPlanet}
          thalassaRadius={BELT_PLANET_SIZE}
          hermesRef={mercuryPlanet}
          hermesRadius={MERCURY_SIZE}
          dockBerths={dockBerths}
          hazardFields={hazardFields}
          occluders={planetHazards}
          targetRef={mapShipRef}
          playerLaserHitRef={playerLaserHitRef}
          banditLaserHitRef={bandit2LaserHitRef}
          hostileHazardRef={bandit2HostileRef}
          mapRef={bandit2MapRef}
          combatStateRef={bandit2CombatRef}
          paused={paused}
          spawnSide={-1}
          variant={1}
          allyRefs={bandit2Allies}
          rivalRefs={patrolRivalRefs}
          rivalLaserHitRefs={patrolRivalLaserRefs}
          playerCargoRef={playerCargoRef}
          cargoBaitRef={cargoBaitRef}
          onBaitClaimed={onBaitClaimed}
          sensorsOwned={sensorsOwned}
        />
        <PatrolShip
          scale={scale}
          sunPosition={sunPosition}
          sunSize={sunSize}
          thalassaRef={beltPlanet}
          thalassaRadius={BELT_PLANET_SIZE}
          stationRef={thalassaStation}
          mapRef={patrolMapRef}
          banditRefs={banditMapRefs}
          banditLaserHitRefs={banditLaserHitRefs}
          banditCombatRefs={banditCombatRefs}
          patrolLaserHitRef={patrolLaserHitRef}
          playerShipRef={mapShipRef}
          combatHudRef={combatHudRef}
          paused={paused}
          sensorsOwned={sensorsOwned}
        />
        <AshFlare event={ashFlare} />
      </Suspense>

      <CombatTracker
        banditRefs={banditMapRefs}
        banditCombatRefs={banditCombatRefs}
        hudRef={combatHudRef}
        active={!paused && !docked}
      />

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
        starName={STAR_NAME}
        beltInner={beltInner}
        beltOuter={beltOuter}
        bodies={mapBodies}
        shipRef={mapShipRef}
        banditRefs={banditMapRefs}
        patrolRefs={patrolMapRefs}
        stations={mapStations}
        hideNpcsRef={mapCloakRef}
        sensorRangeRef={sensorRangeRef}
        nyxOrbitGlowRef={nyxOrbitGlowRef}
        nyxCorridorUnlockedRef={nyxCorridorUnlockedRef}
        lorePingsRef={lorePingsRef}
      />

      <Nebula
        origin={sunPosition}
        shellIntensity={shellIntensity}
        colorA="#243658"
        colorB="#1a2840"
        colorC="#3a2a48"
        wispInner={MERCURY_ORBIT}
        wispOuter={GAS_ORBIT + 200}
        wispCount={wispCount}
        wispMinScale={90}
        wispMaxScale={220}
        wispOpacity={wispOpacity}
        seed={3}
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
          luminanceSmoothing={0.85}
          mipmapBlur
        />
        {godRays && sunReady ? <StableGodRays sun={sunMesh} /> : <></>}
      </EffectComposer>
    </>
  )
})
