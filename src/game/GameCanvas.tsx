import { Canvas } from '@react-three/fiber'
import { memo, type RefObject } from 'react'
import type { Group } from 'three'
import type { CombatHudState } from '@/combat/combatHud'
import type { AdminWarpRequest, GateArrivalRequest } from '@/dev/adminTypes'
import type { HullSnapshot } from '@/game/persist'
import { GateVoidSpace } from '@/game/GateVoidSpace'
import { NyxAltSpace } from '@/game/NyxAltSpace'
import { Space } from '@/game/Space'
import { SYSTEM_IDS, type SystemId } from '@/game/systemConfig'
import type { PlayerCargoStatus } from '@/loot/cargoBait'
import type { CargoHold } from '@/loot/economy'
import type { MaterialPickup } from '@/loot/MaterialDrops'
import type { MapSnapshot } from '@/map/systemMap'
import type { MapWaypointState } from '@/map/mapWaypoint'
import type { AttitudeHudState } from '@/ship/attitudeHud'
import type { OrbitalTelemetry } from '@/ship/PlayerShip'

/** Keeps Canvas props stable so HUD state updates don't reconcile the R3F tree. */
export const GameCanvas = memo(function GameCanvas({
  started,
  paused,
  docked,
  dockStationName,
  beltResetSeed = 0,
  suspendRender,
  systemId = SYSTEM_IDS.sol,
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
  healRequest,
  maxHp,
  torpedoOwned,
  torpedoAmmo,
  torpedoMaxAmmo,
  onTorpedoAmmoChange,
  thrusterOwned,
  sensorsOwned,
  playerCargoRef,
  jettisonDump,
  onJettisonCargo,
  nyxDerelictSeen = false,
  onNyxDerelictSeen,
  nyxCorridorUnlockedRef,
  nyxTransitDockable = false,
  nyxApoMarkActive = false,
  nyxHyperionRumorHeard = false,
  nyxTugSeen = false,
  onNyxTugSeen,
  nyxCassiniSeen = false,
  onNyxCassiniSeen,
  nyxGateSeen = false,
  onNyxGateSeen,
  vesperSiphonRepaired = [],
  gatePowered = false,
  onGatePortalEnter,
  gateArrival = null,
  adminWarpTarget = null,
}: {
  /** Lazy-load heavy station assets after launch (or docked save). */
  started: boolean
  paused: boolean
  docked: boolean
  dockStationName?: string
  /** Incremented when docking — rebuilds the asteroid belt. */
  beltResetSeed?: number
  /** Freeze the WebGL loop (Escape pause). Start screen keeps animating. */
  suspendRender: boolean
  systemId?: SystemId
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
  nyxTransitDockable?: boolean
  nyxApoMarkActive?: boolean
  nyxHyperionRumorHeard?: boolean
  nyxTugSeen?: boolean
  onNyxTugSeen?: (toast: string) => void
  nyxCassiniSeen?: boolean
  onNyxCassiniSeen?: (toast: string) => void
  nyxGateSeen?: boolean
  onNyxGateSeen?: (toast: string) => void
  vesperSiphonRepaired?: readonly number[]
  gatePowered?: boolean
  onGatePortalEnter?: () => void
  gateArrival?: GateArrivalRequest | null
  adminWarpTarget?: AdminWarpRequest | null
}) {
  const sky =
    systemId === SYSTEM_IDS.gateVoid
      ? 'void'
      : systemId === SYSTEM_IDS.nyxAlt
        ? 'vesper'
        : 'sol'

  return (
    <Canvas
      frameloop={suspendRender ? 'never' : 'always'}
      camera={{ position: [0, 3, 12], fov: 60, near: 0.1, far: 24000 }}
      style={{ width: '100vw', height: '100vh' }}
      gl={{
        antialias: false,
        powerPreference: 'high-performance',
        stencil: false,
        depth: true,
      }}
      dpr={[1, 1.25]}
    >
      {sky === 'void' ? (
        <GateVoidSpace
          key="gateVoid"
          started={started}
          paused={paused}
          docked={docked}
          onLockChange={onLockChange}
          onTelemetry={onTelemetry}
          onDockAvailable={onDockAvailable}
          onMaterialPickup={onMaterialPickup}
          mapSnapshotRef={mapSnapshotRef}
          mapShipRef={mapShipRef}
          combatHudRef={combatHudRef}
          attitudeHudRef={attitudeHudRef}
          waypointRef={waypointRef}
          initialHull={initialHull}
          healRequest={healRequest}
          maxHp={maxHp}
          torpedoOwned={torpedoOwned}
          torpedoAmmo={torpedoAmmo}
          torpedoMaxAmmo={torpedoMaxAmmo}
          onTorpedoAmmoChange={onTorpedoAmmoChange}
          thrusterOwned={thrusterOwned}
          playerCargoRef={playerCargoRef}
          onJettisonCargo={onJettisonCargo}
          onPortalEnter={onGatePortalEnter}
          gateArrival={gateArrival}
          adminWarpTarget={adminWarpTarget}
        />
      ) : sky === 'vesper' ? (
        <NyxAltSpace
          key="nyxAlt"
          started={started}
          paused={paused}
          docked={docked}
          dockStationName={dockStationName}
          onLockChange={onLockChange}
          onTelemetry={onTelemetry}
          onDockAvailable={onDockAvailable}
          onMaterialPickup={onMaterialPickup}
          mapSnapshotRef={mapSnapshotRef}
          mapShipRef={mapShipRef}
          combatHudRef={combatHudRef}
          attitudeHudRef={attitudeHudRef}
          waypointRef={waypointRef}
          initialHull={initialHull}
          healRequest={healRequest}
          maxHp={maxHp}
          torpedoOwned={torpedoOwned}
          torpedoAmmo={torpedoAmmo}
          torpedoMaxAmmo={torpedoMaxAmmo}
          onTorpedoAmmoChange={onTorpedoAmmoChange}
          thrusterOwned={thrusterOwned}
          playerCargoRef={playerCargoRef}
          onJettisonCargo={onJettisonCargo}
          nyxTugSeen={nyxTugSeen}
          onNyxTugSeen={onNyxTugSeen}
          nyxCassiniSeen={nyxCassiniSeen}
          onNyxCassiniSeen={onNyxCassiniSeen}
          nyxGateSeen={nyxGateSeen}
          onNyxGateSeen={onNyxGateSeen}
          vesperSiphonRepaired={vesperSiphonRepaired}
          gatePowered={gatePowered}
          onPortalEnter={onGatePortalEnter}
          gateArrival={gateArrival}
          adminWarpTarget={adminWarpTarget}
        />
      ) : (
        <Space
          key="sol"
          started={started}
          paused={paused}
          docked={docked}
          dockStationName={dockStationName}
          beltResetSeed={beltResetSeed}
          onLockChange={onLockChange}
          onTelemetry={onTelemetry}
          onDockAvailable={onDockAvailable}
          onMaterialPickup={onMaterialPickup}
          mapSnapshotRef={mapSnapshotRef}
          mapShipRef={mapShipRef}
          combatHudRef={combatHudRef}
          attitudeHudRef={attitudeHudRef}
          waypointRef={waypointRef}
          initialHull={initialHull}
          healRequest={healRequest}
          maxHp={maxHp}
          torpedoOwned={torpedoOwned}
          torpedoAmmo={torpedoAmmo}
          torpedoMaxAmmo={torpedoMaxAmmo}
          onTorpedoAmmoChange={onTorpedoAmmoChange}
          thrusterOwned={thrusterOwned}
          sensorsOwned={sensorsOwned}
          playerCargoRef={playerCargoRef}
          jettisonDump={jettisonDump}
          onJettisonCargo={onJettisonCargo}
          nyxDerelictSeen={nyxDerelictSeen}
          onNyxDerelictSeen={onNyxDerelictSeen}
          nyxCorridorUnlockedRef={nyxCorridorUnlockedRef}
          nyxTransitDockable={nyxTransitDockable}
          nyxApoMarkActive={nyxApoMarkActive}
          nyxHyperionRumorHeard={nyxHyperionRumorHeard}
          adminWarpTarget={adminWarpTarget}
        />
      )}
    </Canvas>
  )
})
