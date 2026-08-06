import { Environment, Lightformer } from '@react-three/drei'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { folder, useControls } from 'leva'
import { memo, useMemo, useRef, type RefObject } from 'react'
import { Group, type Object3D } from 'three'
import type { CombatHudState } from '@/combat/combatHud'
import type { AdminWarpRequest, GateArrivalRequest } from '@/dev/adminTypes'
import type { HullSnapshot } from '@/game/persist'
import { VOID_STAR_NAME } from '@/game/systemConfig'
import { ALT_GATE_MAP_LABEL } from '@/lore/easterEggs'
import {
  GATE_MAP_SIZE,
  MisplantedGate,
  PORTAL_EXIT_CLEARANCE,
  VOID_GATE_OFFSET,
  gatePortalExitWorld,
} from '@/lore/MisplantedGate'
import type { PlayerCargoStatus } from '@/loot/cargoBait'
import type { MaterialPickup } from '@/loot/MaterialDrops'
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
import { Nebula } from '@/world/Nebula'
import { Starfield } from '@/world/Starfield'

/** Far virtual attractor so the HUD altitude read stays nonsense / non-colliding. */
const VOID_SUN_POSITION: [number, number, number] = [0, 0, -8000]
const VOID_SUN_SIZE = 1

/**
 * Liminal pocket past the misplanted gate — distant nebulae and stars,
 * nothing local but the matching powered ring.
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
}) {
  const misplantedGate = useRef<Group>(null)
  const gateHazards = useRef<HazardField | null>(null)
  const mapCloakRef = useRef(false)
  const emptyBerths = useMemo(() => [], [])
  const emptyHazards = useMemo(() => [], [])
  const hazardFields = useMemo(() => [gateHazards], [])

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
  } = useControls('Env · Void', {
    lighting: folder(
      {
        ambient: {
          value: 0.08,
          min: 0,
          max: 1,
          step: 0.01,
          label: 'Ambient',
        },
        envFill: {
          value: 0.28,
          min: 0,
          max: 2,
          step: 0.05,
          label: 'Env fill',
        },
      },
      { collapsed: true },
    ),
    post: folder(
      {
        bloomIntensity: {
          value: 0.42,
          min: 0,
          max: 4,
          step: 0.05,
          label: 'Bloom',
        },
        bloomThreshold: {
          value: 0.7,
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
        count: { value: 5600, min: 500, max: 12000, step: 100 },
        depth: { value: 110, min: 10, max: 200, step: 1 },
        radius: { value: 1600, min: 20, max: 2000, step: 5 },
        factor: { value: 3.4, min: 1, max: 12, step: 0.1 },
        saturation: { value: 0.28, min: 0, max: 1, step: 0.01 },
        fade: true,
        speed: { value: 0.22, min: 0, max: 4, step: 0.05 },
      },
      { collapsed: true },
    ),
    nebula: folder(
      {
        shellIntensity: {
          value: 0.55,
          min: 0,
          max: 1.2,
          step: 0.02,
          label: 'Shell',
        },
      },
      { collapsed: false },
    ),
  }, { order: 1 })

  const sunPosition = VOID_SUN_POSITION

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
    return null
  }, [gateArrival, adminWarpTarget, sunPosition])

  const mapBodies = useMemo<TrackedBody[]>(
    () => [
      {
        name: ALT_GATE_MAP_LABEL,
        object: misplantedGate,
        size: GATE_MAP_SIZE,
        color: '#6b5cff',
        kind: 'moon',
      },
    ],
    [],
  )

  const emptyBandits = useMemo(() => [], [])
  const emptyPatrols = useMemo(() => [], [])
  const emptyStations = useMemo(() => [], [])

  return (
    <>
      <color attach="background" args={['#010008']} />
      <ambientLight intensity={ambient} color="#5a6898" />

      <Environment
        background={false}
        resolution={128}
        environmentIntensity={envFill}
      >
        <Lightformer
          intensity={0.35}
          color="#6070b8"
          scale={32}
          position={[-50, 20, 30]}
        />
        <Lightformer
          intensity={0.18}
          color="#281830"
          scale={40}
          position={[40, -25, -40]}
        />
        <Lightformer
          intensity={0.2}
          color="#8870c8"
          scale={24}
          position={[10, 40, -20]}
        />
      </Environment>

      {started && (
        <>
          <MisplantedGate
            sunPosition={sunPosition}
            offset={VOID_GATE_OFFSET}
            playerRef={mapShipRef as RefObject<Object3D | null>}
            paused={paused}
            gateRef={misplantedGate}
            hazardRef={gateHazards}
            powered
            onPortalEnter={onPortalEnter}
          />

          <PlayerShip
            scale={0.08}
            metalness={0.38}
            roughness={0.42}
            envMapIntensity={0.55}
            sunPosition={sunPosition}
            sunSize={VOID_SUN_SIZE}
            mu={1}
            hazards={emptyHazards}
            hostiles={[]}
            hazardFields={hazardFields}
            laserTargets={[]}
            shipRef={mapShipRef}
            onMaterialPickup={onMaterialPickup}
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
        sunSize={VOID_SUN_SIZE}
        sunColor="#4a3a78"
        starName={VOID_STAR_NAME}
        beltInner={0}
        beltOuter={0}
        bodies={mapBodies}
        shipRef={mapShipRef}
        banditRefs={emptyBandits}
        patrolRefs={emptyPatrols}
        stations={emptyStations}
        hideNpcsRef={mapCloakRef}
      />

      <Nebula
        origin={VOID_GATE_OFFSET}
        shellIntensity={shellIntensity}
        colorA="#2a1a58"
        colorB="#142848"
        colorC="#4a2048"
        wispCount={0}
        seed={41}
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
