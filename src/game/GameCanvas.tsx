import { Canvas } from '@react-three/fiber'
import { memo, type RefObject } from 'react'
import type { Group } from 'three'
import type { CombatHudState } from '@/combat/combatHud'
import type { HullSnapshot } from '@/game/persist'
import type { PlayerCargoStatus } from '@/loot/cargoBait'
import type { CargoHold } from '@/loot/economy'
import type { MaterialPickup } from '@/loot/MaterialDrops'
import type { MapSnapshot } from '@/map/systemMap'
import type { OrbitalTelemetry } from '@/ship/PlayerShip'
import { Space } from '@/game/Space'

/** Keeps Canvas props stable so HUD state updates don't reconcile the R3F tree. */
export const GameCanvas = memo(function GameCanvas({
  started,
  paused,
  docked,
  beltResetSeed = 0,
  suspendRender,
  onLockChange,
  onTelemetry,
  onDockAvailable,
  onMaterialPickup,
  mapSnapshotRef,
  mapShipRef,
  combatHudRef,
  initialHull,
  healRequest,
  maxHp,
  torpedoOwned,
  torpedoAmmo,
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
}: {
  /** Lazy-load heavy station assets after launch (or docked save). */
  started: boolean
  paused: boolean
  docked: boolean
  /** Incremented when docking — rebuilds the asteroid belt. */
  beltResetSeed?: number
  /** Freeze the WebGL loop (Escape pause). Start screen keeps animating. */
  suspendRender: boolean
  onLockChange: (locked: boolean) => void
  onTelemetry: (telemetry: OrbitalTelemetry) => void
  onDockAvailable: (available: boolean, stationName?: string) => void
  onMaterialPickup: (pickup: MaterialPickup) => void
  mapSnapshotRef: RefObject<MapSnapshot>
  mapShipRef: RefObject<Group | null>
  combatHudRef: RefObject<CombatHudState>
  initialHull?: HullSnapshot
  healRequest?: { seq: number; hp: number; maxHp?: number } | null
  maxHp?: number
  torpedoOwned?: boolean
  torpedoAmmo?: number
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
}) {
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
      <Space
        started={started}
        paused={paused}
        docked={docked}
        beltResetSeed={beltResetSeed}
        onLockChange={onLockChange}
        onTelemetry={onTelemetry}
        onDockAvailable={onDockAvailable}
        onMaterialPickup={onMaterialPickup}
        mapSnapshotRef={mapSnapshotRef}
        mapShipRef={mapShipRef}
        combatHudRef={combatHudRef}
        initialHull={initialHull}
        healRequest={healRequest}
        maxHp={maxHp}
        torpedoOwned={torpedoOwned}
        torpedoAmmo={torpedoAmmo}
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
      />
    </Canvas>
  )
})
