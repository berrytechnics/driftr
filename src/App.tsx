import { Leva } from 'leva'
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { Group } from 'three'
import {
  ThemeMusic,
  tryPlayStation,
  tryPlayTheme,
} from '@/audio/ThemeMusic'
import { GameCanvas } from '@/game/GameCanvas'
import {
  hullFromSave,
  loadGameSave,
  saveGameSave,
  type GameSave,
} from '@/game/persist'
import { STATION_NAMES } from '@/game/systemConfig'
import {
  cargoUnits,
  emptyCargo,
  MATERIAL_PRICE,
  type CargoHold,
  type MaterialKind,
} from '@/loot/economy'
import type { PlayerCargoStatus } from '@/loot/cargoBait'
import {
  ARMOR_TIERS,
  SENSOR_MOD_ID,
  SENSOR_UNLOCK_COST,
  THRUSTER_MOD_ID,
  THRUSTER_UNLOCK_COST,
  TORPEDO_MAX_AMMO,
  TORPEDO_RELOAD_COST,
  TORPEDO_RELOAD_ID,
  TORPEDO_UNLOCK_COST,
  TORPEDO_WEAPON_ID,
  canBuyArmorTier,
  canBuySensorUnlock,
  canBuyThrusterUnlock,
  canBuyTorpedoReload,
  canBuyTorpedoUnlock,
  clampArmorTier,
  clampTorpedoAmmo,
  maxHpForArmorTier,
  repairCost,
} from '@/loot/shop'
import type { MaterialPickup } from '@/loot/MaterialDrops'
import {
  createEmptyCombatHud,
  type CombatHudState,
} from '@/combat/combatHud'
import { createEmptyMapSnapshot, type MapSnapshot } from '@/map/systemMap'
import type { OrbitalTelemetry } from '@/ship/PlayerShip'
import { CombatChevron } from '@/ui/CombatChevron'
import { Crosshair } from '@/ui/Crosshair'
import { DamageFlash } from '@/ui/DamageFlash'
import { FpsCounter } from '@/ui/FpsCounter'
import { Hud } from '@/ui/Hud'
import { LoadingScreen } from '@/ui/LoadingScreen'

const PauseMenu = lazy(() =>
  import('@/ui/PauseMenu').then((m) => ({ default: m.PauseMenu })),
)
const StationMenu = lazy(() =>
  import('@/ui/StationMenu').then((m) => ({ default: m.StationMenu })),
)
const SystemMap = lazy(() =>
  import('@/map/SystemMap').then((m) => ({ default: m.SystemMap })),
)
const DockPrompt = lazy(() =>
  import('@/ui/DockPrompt').then((m) => ({ default: m.DockPrompt })),
)

export default function App() {
  const saved = useMemo(() => loadGameSave(), [])
  const initialHull = useMemo(() => hullFromSave(saved), [saved])

  const [, setLocked] = useState(false)
  const [booting, setBooting] = useState(true)
  const [paused, setPaused] = useState(false)
  const [started, setStarted] = useState(() => saved.docked)
  const [docked, setDocked] = useState(() => saved.docked)
  const [dockAvailable, setDockAvailable] = useState(false)
  const [dockStationName, setDockStationName] = useState(
    STATION_NAMES.thalassa,
  )
  const [telemetry, setTelemetry] = useState<OrbitalTelemetry | null>(null)
  const [credits, setCredits] = useState(() => saved.credits)
  const [cargo, setCargo] = useState<CargoHold>(() => ({ ...saved.cargo }))
  const [torpedoOwned, setTorpedoOwned] = useState(() => saved.torpedoOwned)
  const [torpedoAmmo, setTorpedoAmmo] = useState(() => saved.torpedoAmmo)
  const [armorTier, setArmorTier] = useState(() => saved.armorTier)
  const [thrusterOwned, setThrusterOwned] = useState(() => saved.thrusterOwned)
  const [sensorsOwned, setSensorsOwned] = useState(() => saved.sensorsOwned)
  const [damageFlash, setDamageFlash] = useState(0)
  const [healRequest, setHealRequest] = useState<{
    seq: number
    hp: number
    maxHp?: number
  } | null>(null)
  const [jettisonDump, setJettisonDump] = useState<{
    seq: number
    x: number
    y: number
    z: number
    cargo: CargoHold
  } | null>(null)
  const startedRef = useRef(saved.docked)
  const dockedRef = useRef(saved.docked)
  const lastHp = useRef<number | null>(saved.hp)
  const creditsRef = useRef(credits)
  const cargoRef = useRef(cargo)
  const playerCargoRef = useRef<PlayerCargoStatus>({ units: 0 })
  const torpedoOwnedRef = useRef(torpedoOwned)
  const torpedoAmmoRef = useRef(torpedoAmmo)
  const armorTierRef = useRef(armorTier)
  const thrusterOwnedRef = useRef(thrusterOwned)
  const sensorsOwnedRef = useRef(sensorsOwned)
  const telemetryRef = useRef<OrbitalTelemetry | null>(null)
  const healSeq = useRef(0)
  const jettisonSeq = useRef(0)
  const shipMaxHp = maxHpForArmorTier(armorTier)
  /** Skip the keyup from the Esc that opened the pause menu */
  const ignoreEscResume = useRef(false)
  const mapSnapshotRef = useRef<MapSnapshot>(createEmptyMapSnapshot())
  const mapShipRef = useRef<Group | null>(null)
  const combatHudRef = useRef<CombatHudState>(createEmptyCombatHud())

  dockedRef.current = docked
  creditsRef.current = credits
  cargoRef.current = cargo
  playerCargoRef.current.units = cargoUnits(cargo)
  torpedoOwnedRef.current = torpedoOwned
  torpedoAmmoRef.current = torpedoAmmo
  armorTierRef.current = armorTier
  thrusterOwnedRef.current = thrusterOwned
  sensorsOwnedRef.current = sensorsOwned

  const persistNow = useCallback(() => {
    const t = telemetryRef.current
    const snapshot: GameSave = {
      version: 1,
      credits: creditsRef.current,
      cargo: cargoRef.current,
      hp: t?.hp ?? lastHp.current ?? saved.hp,
      heat: t?.heat ?? saved.heat,
      overheated: t?.overheated ?? saved.overheated,
      speedBuff: t?.speedBuff ?? 0,
      fireBuff: t?.fireBuff ?? 0,
      docked: dockedRef.current,
      torpedoOwned: torpedoOwnedRef.current,
      torpedoAmmo: torpedoAmmoRef.current,
      armorTier: armorTierRef.current,
      thrusterOwned: thrusterOwnedRef.current,
      sensorsOwned: sensorsOwnedRef.current,
    }
    saveGameSave(snapshot)
  }, [saved.hp, saved.heat, saved.overheated])

  // Debounced autosave when economy / dock / hull changes
  useEffect(() => {
    const timer = window.setTimeout(persistNow, 400)
    return () => window.clearTimeout(timer)
  }, [
    credits,
    cargo,
    docked,
    telemetry,
    torpedoOwned,
    torpedoAmmo,
    armorTier,
    thrusterOwned,
    sensorsOwned,
    persistNow,
  ])

  useEffect(() => {
    const flush = () => persistNow()
    window.addEventListener('beforeunload', flush)
    window.addEventListener('pagehide', flush)
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('beforeunload', flush)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [persistNow])

  const onLockChange = useCallback((value: boolean) => {
    setLocked(value)
    if (value) {
      startedRef.current = true
      setStarted(true)
      setPaused(false)
    } else if (startedRef.current && !dockedRef.current) {
      // Pointer unlock while docked is intentional (station MFD needs the mouse)
      setPaused(true)
      ignoreEscResume.current = true
      window.setTimeout(() => {
        ignoreEscResume.current = false
      }, 300)
    }
  }, [])

  const onTelemetry = useCallback((value: OrbitalTelemetry) => {
    if (
      lastHp.current !== null &&
      value.hp < lastHp.current &&
      value.hp > 0
    ) {
      setDamageFlash((n) => n + 1)
    }
    // Death — dump cargo (credits keep); no docking while wrecked
    if (value.hp <= 0 && (lastHp.current === null || lastHp.current > 0)) {
      setCargo(emptyCargo())
      setDockAvailable(false)
    }
    lastHp.current = value.hp
    telemetryRef.current = value
    setTelemetry(value)
  }, [])

  const onDockAvailable = useCallback(
    (available: boolean, stationName?: string) => {
      // PlayerShip already suppresses offers while wrecked. Do not gate on
      // telemetry hp here — rejecting after the ship flips its local
      // dockAvailableRef leaves App stuck false until you leave and re-enter range.
      setDockAvailable(available)
      if (available && stationName) setDockStationName(stationName)
    },
    [],
  )

  const onMaterialPickup = useCallback((pickup: MaterialPickup) => {
    setCargo((prev) => ({
      ...prev,
      [pickup.kind]: prev[pickup.kind] + pickup.amount,
    }))
  }, [])

  const sellMaterial = useCallback((kind: MaterialKind) => {
    setCargo((prev) => {
      const qty = prev[kind]
      if (qty <= 0) return prev
      setCredits((c) => c + qty * MATERIAL_PRICE[kind])
      return { ...prev, [kind]: 0 }
    })
  }, [])

  const sellAllCargo = useCallback(() => {
    setCargo((prev) => {
      let payout = 0
      for (const kind of Object.keys(prev) as MaterialKind[]) {
        payout += prev[kind] * MATERIAL_PRICE[kind]
      }
      if (payout > 0) setCredits((c) => c + payout)
      return emptyCargo()
    })
  }, [])

  const repairShip = useCallback(() => {
    const t = telemetryRef.current
    if (!t || !dockedRef.current) return
    const cost = repairCost(t.hp, t.maxHp)
    if (cost <= 0 || creditsRef.current < cost) return
    const repaired = { ...t, hp: t.maxHp }
    telemetryRef.current = repaired
    lastHp.current = t.maxHp
    setTelemetry(repaired)
    setCredits((c) => c - cost)
    healSeq.current += 1
    setHealRequest({ seq: healSeq.current, hp: t.maxHp })
  }, [])

  const onTorpedoAmmoChange = useCallback((ammo: number) => {
    const next = clampTorpedoAmmo(ammo)
    torpedoAmmoRef.current = next
    setTorpedoAmmo(next)
  }, [])

  const onJettisonCargo = useCallback((x: number, y: number, z: number) => {
    if (dockedRef.current) return
    const dump = { ...cargoRef.current }
    if (cargoUnits(dump) <= 0) return
    cargoRef.current = emptyCargo()
    playerCargoRef.current.units = 0
    setCargo(emptyCargo())
    jettisonSeq.current += 1
    setJettisonDump({
      seq: jettisonSeq.current,
      x,
      y,
      z,
      cargo: dump,
    })
  }, [])

  const buyShopItem = useCallback((id: string) => {
    if (!dockedRef.current) return
    if (id === TORPEDO_WEAPON_ID) {
      if (!canBuyTorpedoUnlock(creditsRef.current, torpedoOwnedRef.current)) {
        return
      }
      setCredits((c) => c - TORPEDO_UNLOCK_COST)
      torpedoOwnedRef.current = true
      torpedoAmmoRef.current = TORPEDO_MAX_AMMO
      setTorpedoOwned(true)
      setTorpedoAmmo(TORPEDO_MAX_AMMO)
      return
    }
    if (id === THRUSTER_MOD_ID) {
      if (!canBuyThrusterUnlock(creditsRef.current, thrusterOwnedRef.current)) {
        return
      }
      setCredits((c) => c - THRUSTER_UNLOCK_COST)
      thrusterOwnedRef.current = true
      setThrusterOwned(true)
      return
    }
    if (id === SENSOR_MOD_ID) {
      if (!canBuySensorUnlock(creditsRef.current, sensorsOwnedRef.current)) {
        return
      }
      setCredits((c) => c - SENSOR_UNLOCK_COST)
      sensorsOwnedRef.current = true
      setSensorsOwned(true)
      return
    }
    if (id === TORPEDO_RELOAD_ID) {
      if (
        !canBuyTorpedoReload(
          creditsRef.current,
          torpedoOwnedRef.current,
          torpedoAmmoRef.current,
        )
      ) {
        return
      }
      setCredits((c) => c - TORPEDO_RELOAD_COST)
      const next = clampTorpedoAmmo(torpedoAmmoRef.current + 1)
      torpedoAmmoRef.current = next
      setTorpedoAmmo(next)
      return
    }

    const armor = ARMOR_TIERS.find((tier) => tier.id === id)
    if (!armor) return
    const current = clampArmorTier(armorTierRef.current)
    if (armor.tier !== current + 1) return
    if (!canBuyArmorTier(creditsRef.current, current)) return

    const oldMax = maxHpForArmorTier(current)
    const newMax = armor.maxHp
    const bonus = newMax - oldMax
    const currentHp =
      telemetryRef.current?.hp ?? lastHp.current ?? oldMax
    const newHp = Math.min(newMax, Math.round(currentHp) + bonus)

    setCredits((c) => c - armor.cost)
    armorTierRef.current = armor.tier
    setArmorTier(armor.tier)
    lastHp.current = newHp
    if (telemetryRef.current) {
      const updated = {
        ...telemetryRef.current,
        hp: newHp,
        maxHp: newMax,
      }
      telemetryRef.current = updated
      setTelemetry(updated)
    }
    healSeq.current += 1
    setHealRequest({ seq: healSeq.current, hp: newHp, maxHp: newMax })
  }, [])

  const dockAtStation = useCallback(() => {
    if (telemetryRef.current && telemetryRef.current.hp <= 0) return
    if (!dockAvailable && !dockedRef.current) return
    dockedRef.current = true
    setDocked(true)
    setDockAvailable(false)
    setPaused(false)
    tryPlayStation()
    if (document.pointerLockElement) {
      document.exitPointerLock()
    }
  }, [dockAvailable])

  const undockFromStation = useCallback(() => {
    dockedRef.current = false
    setDocked(false)
    setPaused(false)
    setHealRequest(null)
    tryPlayTheme()
    const canvas = document.querySelector('canvas')
    void canvas?.requestPointerLock()
  }, [])

  const resumeFlight = useCallback(() => {
    setPaused(false)
    tryPlayTheme()
    const canvas = document.querySelector('canvas')
    void canvas?.requestPointerLock()
  }, [])

  useEffect(() => {
    if (!started || !paused || docked) return
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Escape') return
      if (ignoreEscResume.current) return
      event.preventDefault()
      resumeFlight()
    }
    window.addEventListener('keyup', onKeyUp)
    return () => window.removeEventListener('keyup', onKeyUp)
  }, [started, paused, docked, resumeFlight])

  useEffect(() => {
    if (
      !started ||
      paused ||
      docked ||
      !dockAvailable ||
      (telemetry && telemetry.hp <= 0)
    ) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'KeyF' || event.repeat) return
      event.preventDefault()
      dockAtStation()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [started, paused, docked, dockAvailable, dockAtStation, telemetry])

  const showMenu = !booting && (!started || paused) && !docked
  const menuMode = started || paused ? 'paused' : 'start'
  const worldPaused = !started || paused
  const inFlight = !booting && started && !paused && !docked

  const onBootFinished = useCallback(() => setBooting(false), [])

  return (
    <>
      {/* Debug panel — leva is stubbed out of production builds */}
      {import.meta.env.DEV && <Leva collapsed />}
      <ThemeMusic
        playing={!booting && started && !paused && !docked}
        docked={docked}
      />
      <GameCanvas
        started={started}
        paused={worldPaused}
        docked={docked}
        suspendRender={started && paused && !docked}
        onLockChange={onLockChange}
        onTelemetry={onTelemetry}
        onDockAvailable={onDockAvailable}
        onMaterialPickup={onMaterialPickup}
        mapSnapshotRef={mapSnapshotRef}
        mapShipRef={mapShipRef}
        combatHudRef={combatHudRef}
        initialHull={initialHull}
        healRequest={healRequest}
        maxHp={shipMaxHp}
        torpedoOwned={torpedoOwned}
        torpedoAmmo={torpedoAmmo}
        onTorpedoAmmoChange={onTorpedoAmmoChange}
        thrusterOwned={thrusterOwned}
        sensorsOwned={sensorsOwned}
        playerCargoRef={playerCargoRef}
        jettisonDump={jettisonDump}
        onJettisonCargo={onJettisonCargo}
      />
      {inFlight && (
        <>
          <Crosshair
            overheated={!!telemetry?.overheated}
            dead={!!telemetry && telemetry.hp <= 0}
            torpedoOwned={
              telemetry?.torpedoOwned ?? torpedoOwned
            }
            torpedoLock={telemetry?.torpedoLock ?? 0}
            torpedoAmmo={telemetry?.torpedoAmmo ?? torpedoAmmo}
          />
          <CombatChevron hudRef={combatHudRef} active={inFlight} />
          <DamageFlash flashKey={damageFlash} active={inFlight} />
          <Hud
            telemetry={telemetry}
            credits={credits}
            cargo={cargo}
            armorTier={armorTier}
          />
          {dockAvailable && !(telemetry && telemetry.hp <= 0) && (
            <Suspense fallback={null}>
              <DockPrompt
                stationName={dockStationName}
                onDock={dockAtStation}
              />
            </Suspense>
          )}
        </>
      )}
      {started && (
        <Suspense fallback={null}>
          <SystemMap snapshotRef={mapSnapshotRef} active={started} />
        </Suspense>
      )}
      {docked && (
        <Suspense fallback={null}>
          <StationMenu
            stationName={dockStationName}
            credits={credits}
            cargo={cargo}
            hp={
              healRequest?.hp ??
              telemetry?.hp ??
              lastHp.current ??
              saved.hp
            }
            maxHp={healRequest?.maxHp ?? telemetry?.maxHp ?? shipMaxHp}
            armorTier={armorTier}
            torpedoOwned={torpedoOwned}
            torpedoAmmo={torpedoAmmo}
            thrusterOwned={thrusterOwned}
            sensorsOwned={sensorsOwned}
            onSell={sellMaterial}
            onSellAll={sellAllCargo}
            onRepair={repairShip}
            onBuy={buyShopItem}
            onUndock={undockFromStation}
          />
        </Suspense>
      )}
      {showMenu && (
        <Suspense fallback={null}>
          <PauseMenu
            mode={menuMode}
            onResume={resumeFlight}
            ship={{
              hp:
                telemetry?.hp ??
                lastHp.current ??
                saved.hp,
              maxHp: telemetry?.maxHp ?? shipMaxHp,
              armorTier,
              credits,
              cargo,
              torpedoOwned,
              torpedoAmmo,
              thrusterOwned,
              sensorsOwned,
              heat: telemetry?.heat ?? saved.heat,
              overheated: telemetry?.overheated ?? saved.overheated,
              speed: telemetry?.speed ?? 0,
              altitude: telemetry?.altitude ?? 0,
            }}
          />
        </Suspense>
      )}
      {!booting && <FpsCounter />}
      {booting && <LoadingScreen onFinished={onBootFinished} />}
    </>
  )
}
