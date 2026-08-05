import { Environment, Lightformer } from '@react-three/drei'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { useControls } from 'leva'
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
import { Group, Vector3, type Mesh } from 'three'
import { BanditShip } from '@/ship/BanditShip'
import type { LaserTarget } from '@/ship/ShipWeapons'
import gaseous from '@/assets/textures/planets/Gaseous2.webp'
import gaseousOuter from '@/assets/textures/planets/Gaseous4.webp'
import icy from '@/assets/textures/planets/Icy.webp'
import martian from '@/assets/textures/planets/Martian.webp'
import tropical from '@/assets/textures/planets/Tropical.webp'
import volcanic from '@/assets/textures/planets/Volcanic.webp'
import { BuffDrops, type BuffDropsHandle } from '@/loot/BuffDrops'
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
import { MapTracker } from '@/map/MapTracker'
import type { MapSnapshot } from '@/map/systemMap'
import {
  PlayerShip,
  type CollisionHazard,
  type HazardField,
  type OrbitalTelemetry,
} from '@/ship/PlayerShip'
import { AsteroidBelt } from '@/world/AsteroidBelt'
import { PlanetMoons } from '@/world/Moons'
import { Planet } from '@/world/Planet'
import { Starfield } from '@/world/Starfield'
import { StableGodRays } from '@/world/StableGodRays'
import { Sun } from '@/world/Sun'
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
  OUTER_GAS_ORBIT,
  OUTER_GAS_SIZE,
  PLANET_NAMES,
  STAR_NAME,
  SUN_SIZE,
} from '@/game/systemConfig'

const SpaceStation = lazy(() =>
  import('@/world/SpaceStation').then((m) => ({ default: m.SpaceStation })),
)

export const Space = memo(function Space({
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
  initialHull,
}: {
  started: boolean
  paused: boolean
  docked: boolean
  onLockChange: (locked: boolean) => void
  onTelemetry: (telemetry: OrbitalTelemetry) => void
  onDockAvailable: (available: boolean) => void
  onMaterialPickup: (pickup: MaterialPickup) => void
  mapSnapshotRef: RefObject<MapSnapshot>
  mapShipRef: RefObject<Group | null>
  combatHudRef: RefObject<CombatHudState>
  initialHull?: HullSnapshot
}) {
  const sunMesh = useRef<Mesh>(null!)
  const mercuryPlanet = useRef<Group>(null)
  const innerPlanet = useRef<Group>(null)
  const midPlanet = useRef<Group>(null)
  const beltPlanet = useRef<Group>(null)
  const gasGiant = useRef<Group>(null)
  const outerGasGiant = useRef<Group>(null)
  const thalassaStation = useRef<Group>(null)
  const aresMoon = useRef<Group>(null)
  const boreasMoon = useRef<Group>(null)
  const thalassaMoon = useRef<Group>(null)
  const kronosMoonA = useRef<Group>(null)
  const kronosMoonB = useRef<Group>(null)
  const kronosMoonC = useRef<Group>(null)
  const ouranosMoonA = useRef<Group>(null)
  const ouranosMoonB = useRef<Group>(null)
  const asteroidHazards = useRef<HazardField | null>(null)
  const buffDrops = useRef<BuffDropsHandle | null>(null)
  const materialDrops = useRef<MaterialDropsHandle | null>(null)
  const playerLaserHitRef = useRef<LaserTarget | null>(null)
  const banditLaserHitRef = useRef<LaserTarget | null>(null)
  const banditHostileRef = useRef<CollisionHazard | null>(null)
  const banditMapRef = useRef<Group | null>(null)
  const banditCombatRef = useRef<BanditCombatState>(createEmptyBanditCombat())
  const playerLaserTargets = useMemo(() => [banditLaserHitRef], [])
  const playerHostiles = useMemo(() => [banditHostileRef], [])
  const onRockDestroyed = useCallback((worldPosition: Vector3) => {
    const x = worldPosition.x
    const y = worldPosition.y
    const z = worldPosition.z
    const buffed = buffDrops.current?.maybeSpawn(x, y, z) ?? false
    if (!buffed) materialDrops.current?.spawn(x, y, z)
  }, [])
  const [sunReady, setSunReady] = useState(false)
  const onSunReady = useCallback((mesh: Mesh | null) => {
    setSunReady(!!mesh)
  }, [])

  const planetHazards = useMemo<CollisionHazard[]>(
    () => [
      { object: mercuryPlanet, radius: MERCURY_SIZE },
      { object: innerPlanet, radius: INNER_PLANET_SIZE },
      { object: midPlanet, radius: MID_PLANET_SIZE },
      { object: beltPlanet, radius: BELT_PLANET_SIZE },
      { object: gasGiant, radius: GAS_GIANT_SIZE },
      { object: outerGasGiant, radius: OUTER_GAS_SIZE },
      // Station is dockable (non-lethal) — see PlayerShip dock offer
      // Moons
      { object: aresMoon, radius: 0.38 },
      { object: boreasMoon, radius: 0.48 },
      { object: thalassaMoon, radius: 0.55 },
      { object: kronosMoonA, radius: 0.55 },
      { object: kronosMoonB, radius: 0.85 },
      { object: kronosMoonC, radius: 1.15 },
      { object: ouranosMoonA, radius: 0.7 },
      { object: ouranosMoonB, radius: 1.05 },
    ],
    [],
  )
  const hazardFields = useMemo(() => [asteroidHazards], [])
  const mapBodies = useMemo(
    () => [
      {
        name: PLANET_NAMES.mercury,
        object: mercuryPlanet,
        size: MERCURY_SIZE,
        color: '#a85a3a',
      },
      {
        name: PLANET_NAMES.inner,
        object: innerPlanet,
        size: INNER_PLANET_SIZE,
        color: '#c45c3e',
      },
      {
        name: PLANET_NAMES.mid,
        object: midPlanet,
        size: MID_PLANET_SIZE,
        color: '#9ec9e8',
      },
      {
        name: PLANET_NAMES.belt,
        object: beltPlanet,
        size: BELT_PLANET_SIZE,
        color: '#3d9e6f',
      },
      {
        name: PLANET_NAMES.gas,
        object: gasGiant,
        size: GAS_GIANT_SIZE,
        color: '#d4a574',
      },
      {
        name: PLANET_NAMES.outerGas,
        object: outerGasGiant,
        size: OUTER_GAS_SIZE,
        color: '#6b8cae',
      },
      {
        name: MOON_NAMES.ares,
        object: aresMoon,
        size: 0.38,
        color: '#b0a090',
        kind: 'moon' as const,
      },
      {
        name: MOON_NAMES.boreas,
        object: boreasMoon,
        size: 0.48,
        color: '#d8e8f4',
        kind: 'moon' as const,
      },
      {
        name: MOON_NAMES.thalassa,
        object: thalassaMoon,
        size: 0.55,
        color: '#9a9588',
        kind: 'moon' as const,
      },
      {
        name: MOON_NAMES.kronosA,
        object: kronosMoonA,
        size: 0.55,
        color: '#c4b8a8',
        kind: 'moon' as const,
      },
      {
        name: MOON_NAMES.kronosB,
        object: kronosMoonB,
        size: 0.85,
        color: '#e8f0f6',
        kind: 'moon' as const,
      },
      {
        name: MOON_NAMES.kronosC,
        object: kronosMoonC,
        size: 1.15,
        color: '#d2a878',
        kind: 'moon' as const,
      },
      {
        name: MOON_NAMES.ouranosA,
        object: ouranosMoonA,
        size: 0.7,
        color: '#c8dcec',
        kind: 'moon' as const,
      },
      {
        name: MOON_NAMES.ouranosB,
        object: ouranosMoonB,
        size: 1.05,
        color: '#f0f4f8',
        kind: 'moon' as const,
      },
    ],
    [],
  )

  const {
    count,
    depth,
    radius,
    factor,
    saturation,
    fade,
    speed,
  } = useControls('Stars', {
    count: { value: 5000, min: 500, max: 20000, step: 100 },
    depth: { value: 80, min: 10, max: 200, step: 1 },
    radius: { value: 120, min: 20, max: 400, step: 5 },
    factor: { value: 5, min: 1, max: 12, step: 0.1 },
    saturation: { value: 0, min: 0, max: 1, step: 0.01 },
    fade: true,
    speed: { value: 0.4, min: 0, max: 4, step: 0.05 },
  })

  const {
    sunColor,
    sunIntensity,
    sunDistance,
    elevation,
    azimuth,
    flowSpeed,
    bloomIntensity,
    bloomThreshold,
    godRays,
  } = useControls('Sun', {
    sunColor: '#ffdfb9',
    sunIntensity: { value: 4.15, min: 0, max: 5, step: 0.05 },
    sunDistance: { value: 200, min: 40, max: 400, step: 5 },
    elevation: { value: 18, min: -60, max: 80, step: 1 },
    azimuth: { value: 35, min: 0, max: 360, step: 1 },
    flowSpeed: {
      value: 1,
      min: 0,
      max: 3,
      step: 0.05,
      label: 'Surface speed',
    },
    bloomIntensity: { value: 0.85, min: 0, max: 4, step: 0.05 },
    bloomThreshold: { value: 0.65, min: 0, max: 1, step: 0.01 },
    // Optional post god-rays — the sun already has shader rays/flares
    godRays: { value: false, label: 'Post god rays' },
  })
  const sunSize = SUN_SIZE

  const { scale, metalness, roughness, envMapIntensity } = useControls(
    'Spaceship',
    {
      scale: { value: 0.08, min: 0.01, max: 40, step: 0.01 },
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
  )

  // Gravity pulls planets around the sun — the ship is excluded (EVE-style flight)
  const { mu } = useControls('Gravity', {
    mu: {
      value: 8000,
      min: 500,
      max: 500000,
      step: 500,
      label: 'μ (GM)',
    },
  })

  const { beltCount, beltThickness, beltInclination } = useControls(
    'Asteroid belt',
    {
      beltCount: { value: 3500, min: 200, max: 4000, step: 50, label: 'Count' },
      beltThickness: {
        value: 51,
        min: 2,
        max: 60,
        step: 1,
        label: 'Thickness',
      },
      beltInclination: {
        value: 0,
        min: -0.4,
        max: 0.4,
        step: 0.01,
        label: 'Inclination',
      },
    },
  )
  const beltInner = BELT_INNER
  const beltOuter = BELT_OUTER

  const sunPosition = useMemo(() => {
    const phi = ((90 - elevation) * Math.PI) / 180
    const theta = (azimuth * Math.PI) / 180
    const pos = new Vector3().setFromSphericalCoords(sunDistance, phi, theta)
    return [pos.x, pos.y, pos.z] as [number, number, number]
  }, [azimuth, elevation, sunDistance])

  return (
    <>
      <color attach="background" args={['#000008']} />

      {/* Soft space fill — enough to read planet color without washing them out */}
      <ambientLight intensity={0.14} color="#7a8db0" />
      {/* Directional = sunlight at any distance (outer planets still lit) */}
      <directionalLight
        position={sunPosition}
        intensity={sunIntensity * 1.15}
        color={sunColor}
      />

      {/* Sparse lightformers — ship reflections without replacing the sky */}
      <Environment
        background={false}
        resolution={128}
        environmentIntensity={0.45}
      >
        <Lightformer
          form="circle"
          intensity={3.2}
          color={sunColor}
          scale={10}
          position={sunPosition}
        />
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
              size: 0.38,
              orbitAltitude: 2.6,
              orbitSpeed: 0.22,
              inclination: 0.14,
              phase: 1.1,
              map: martian,
              color: '#b0a090',
              spin: 0.05,
              moonRef: aresMoon,
            },
          ]}
        />
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
              size: 0.48,
              orbitAltitude: 3.2,
              orbitSpeed: 0.16,
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
            orbitAltitude={2.2}
            orbitSpeed={0.14}
            inclination={0.22}
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
              size: 0.55,
              orbitAltitude: 6.8,
              orbitSpeed: 0.11,
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
          inclination={beltInclination}
          paused={paused}
          hazardRef={asteroidHazards}
          onRockDestroyed={onRockDestroyed}
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
        <PlanetMoons
          planetRef={gasGiant}
          planetSize={GAS_GIANT_SIZE}
          paused={paused}
          moons={[
            {
              size: 0.55,
              orbitAltitude: 3.8,
              orbitSpeed: 0.28,
              inclination: 0.08,
              phase: 0.2,
              map: volcanic,
              color: '#c4b8a8',
              spin: 0.1,
              moonRef: kronosMoonA,
            },
            {
              size: 0.85,
              orbitAltitude: 7.2,
              orbitSpeed: 0.17,
              inclination: -0.12,
              phase: 2.1,
              map: icy,
              color: '#e8f0f6',
              spin: 0.07,
              moonRef: kronosMoonB,
            },
            {
              size: 1.15,
              orbitAltitude: 12,
              orbitSpeed: 0.1,
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
              size: 0.7,
              orbitAltitude: 4.5,
              orbitSpeed: 0.2,
              inclination: 0.16,
              phase: 1.4,
              map: icy,
              color: '#c8dcec',
              spin: 0.08,
              moonRef: ouranosMoonA,
            },
            {
              size: 1.05,
              orbitAltitude: 9.5,
              orbitSpeed: 0.12,
              inclination: -0.28,
              phase: 3.3,
              map: icy,
              color: '#f0f4f8',
              spin: 0.04,
              moonRef: ouranosMoonB,
            },
          ]}
        />
        <BuffDrops handleRef={buffDrops} paused={paused} />
        <MaterialDrops handleRef={materialDrops} paused={paused} />
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
          spawnAnchorRef={thalassaStation}
          spawnPlanetRef={beltPlanet}
          spawnClearance={8}
          docked={docked}
          paused={paused}
          onLockChange={onLockChange}
          onTelemetry={onTelemetry}
          onDockAvailable={onDockAvailable}
          initialHull={initialHull}
        />
        <BanditShip
          scale={scale}
          sunPosition={sunPosition}
          sunSize={sunSize}
          thalassaRef={beltPlanet}
          thalassaRadius={BELT_PLANET_SIZE}
          hermesRef={mercuryPlanet}
          hermesRadius={MERCURY_SIZE}
          stationRef={thalassaStation}
          occluders={planetHazards}
          targetRef={mapShipRef}
          playerLaserHitRef={playerLaserHitRef}
          banditLaserHitRef={banditLaserHitRef}
          hostileHazardRef={banditHostileRef}
          mapRef={banditMapRef}
          combatStateRef={banditCombatRef}
          paused={paused}
        />
      </Suspense>

      <CombatTracker
        banditRef={banditMapRef}
        banditCombatRef={banditCombatRef}
        hudRef={combatHudRef}
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
        banditRef={banditMapRef}
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
