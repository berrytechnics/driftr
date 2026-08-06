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
import { AdminPanel } from '@/dev/AdminPanel'
import type { AdminWarpId, AdminWarpRequest } from '@/dev/adminTypes'
import { GameCanvas } from '@/game/GameCanvas'
import {
  defaultGameSave,
  hullFromSave,
  loadGameSave,
  saveGameSave,
  type GameSave,
} from '@/game/persist'
import {
  STATION_NAMES,
  SYSTEM_IDS,
  type SystemId,
} from '@/game/systemConfig'
import {
  cargoUnits,
  emptyCargo,
  MATERIAL_PRICE,
  type CargoHold,
  type MaterialKind,
} from '@/loot/economy'
import type { PlayerCargoStatus } from '@/loot/cargoBait'
import {
  ARMOR_MAX_TIER,
  ARMOR_TIERS,
  BASE_MAX_HP,
  SENSOR_MOD_ID,
  SENSOR_UNLOCK_COST,
  THRUSTER_MOD_ID,
  THRUSTER_UNLOCK_COST,
  TORPEDO_MAG_MAX_TIER,
  TORPEDO_MAG_TIERS,
  TORPEDO_RELOAD_COST,
  TORPEDO_RELOAD_ID,
  TORPEDO_UNLOCK_COST,
  TORPEDO_WEAPON_ID,
  canBuyArmorTier,
  canBuySensorUnlock,
  canBuyThrusterUnlock,
  canBuyTorpedoMagTier,
  canBuyTorpedoReload,
  canBuyTorpedoUnlock,
  clampArmorTier,
  clampTorpedoAmmo,
  clampTorpedoMagTier,
  maxAmmoForTorpedoMagTier,
  maxHpForArmorTier,
  repairCost,
} from '@/loot/shop'
import type { MaterialPickup } from '@/loot/MaterialDrops'
import {
  createEmptyCombatHud,
  type CombatHudState,
} from '@/combat/combatHud'
import { createEmptyMapSnapshot, type MapSnapshot } from '@/map/systemMap'
import {
  createEmptyAttitudeHud,
  type AttitudeHudState,
} from '@/ship/attitudeHud'
import {
  createEmptyMapWaypoint,
  type MapWaypointState,
} from '@/map/mapWaypoint'
import type { OrbitalTelemetry } from '@/ship/PlayerShip'
import { CombatChevron } from '@/ui/CombatChevron'
import { Crosshair } from '@/ui/Crosshair'
import { DamageFlash } from '@/ui/DamageFlash'
import { FpsCounter } from '@/ui/FpsCounter'
import { Hud } from '@/ui/Hud'
import { MapWaypointMarker } from '@/ui/MapWaypointMarker'
import { Navball } from '@/ui/Navball'
import { LoadingScreen } from '@/ui/LoadingScreen'
import { LoreIntroModal } from '@/ui/LoreIntroModal'
import { LoreToast } from '@/ui/LoreToast'
import {
  ASH_FOR_SOL_DUAL_TEXT,
  ASH_FOR_SOL_TEXT,
  isAshForSolAltitude,
  isNearHyperion,
  isNearNyx,
  isNyxWhisperAltitude,
  NYX_ALT_TRANSPORT_TOAST,
  NYX_DUST_KEY_TOAST,
  NYX_DUST_PICKUP_TOAST,
  NYX_EMPTY_TOAST,
  NYX_HYPERION_RUMOR,
  NYX_WHISPER_COOLDOWN_S,
  NYX_WHISPER_TEXT,
  rollGhostBerth,
} from '@/lore/easterEggs'

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
  const [dockStationName, setDockStationName] = useState<string>(
    () => saved.dockStationName,
  )
  const [systemId, setSystemId] = useState<SystemId>(() => saved.systemId)
  const [beltResetSeed, setBeltResetSeed] = useState(0)
  const [telemetry, setTelemetry] = useState<OrbitalTelemetry | null>(null)
  const [credits, setCredits] = useState(() => saved.credits)
  const [cargo, setCargo] = useState<CargoHold>(() => ({ ...saved.cargo }))
  const [torpedoOwned, setTorpedoOwned] = useState(() => saved.torpedoOwned)
  const [torpedoAmmo, setTorpedoAmmo] = useState(() => saved.torpedoAmmo)
  const [torpedoMagTier, setTorpedoMagTier] = useState(
    () => saved.torpedoMagTier,
  )
  const [armorTier, setArmorTier] = useState(() => saved.armorTier)
  const [thrusterOwned, setThrusterOwned] = useState(() => saved.thrusterOwned)
  const [sensorsOwned, setSensorsOwned] = useState(() => saved.sensorsOwned)
  const [nightShards, setNightShards] = useState(() => saved.nightShards)
  const [nyxWhisperHeard, setNyxWhisperHeard] = useState(
    () => saved.nyxWhisperHeard,
  )
  const [nyxCorridorUnlocked, setNyxCorridorUnlocked] = useState(
    () => saved.nyxCorridorUnlocked,
  )
  const [nyxComlogUnlocked, setNyxComlogUnlocked] = useState(
    () => saved.nyxComlogUnlocked,
  )
  const [nyxDerelictSeen, setNyxDerelictSeen] = useState(
    () => saved.nyxDerelictSeen,
  )
  const [nyxTugSeen, setNyxTugSeen] = useState(() => saved.nyxTugSeen)
  const [nyxCassiniSeen, setNyxCassiniSeen] = useState(
    () => saved.nyxCassiniSeen,
  )
  const [nyxDualAshDone, setNyxDualAshDone] = useState(
    () => saved.nyxDualAshDone,
  )
  const [nyxHyperionRumorHeard, setNyxHyperionRumorHeard] = useState(
    () => saved.nyxHyperionRumorHeard,
  )
  const [nyxTopicUnlocked, setNyxTopicUnlocked] = useState(
    () => saved.nyxTopicUnlocked,
  )
  const [nyxHyperionLead, setNyxHyperionLead] = useState(
    () => saved.nyxHyperionLead,
  )
  const [nyxFoundEmpty, setNyxFoundEmpty] = useState(() => saved.nyxFoundEmpty)
  const [hideIntroSynopsis, setHideIntroSynopsis] = useState(
    () => saved.hideIntroSynopsis,
  )
  const [showIntroModal, setShowIntroModal] = useState(
    () => !saved.hideIntroSynopsis,
  )
  const [ghostBerth, setGhostBerth] = useState(false)
  const [loreToast, setLoreToast] = useState<string | null>(null)
  const [loreToastKey, setLoreToastKey] = useState(0)
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
    ashOffering?: boolean
  } | null>(null)
  const startedRef = useRef(saved.docked)
  const dockedRef = useRef(saved.docked)
  const systemIdRef = useRef<SystemId>(saved.systemId)
  const lastHp = useRef<number | null>(saved.hp)
  const creditsRef = useRef(credits)
  const cargoRef = useRef(cargo)
  const playerCargoRef = useRef<PlayerCargoStatus>({ units: 0 })
  const torpedoOwnedRef = useRef(torpedoOwned)
  const torpedoAmmoRef = useRef(torpedoAmmo)
  const torpedoMagTierRef = useRef(torpedoMagTier)
  const armorTierRef = useRef(armorTier)
  const thrusterOwnedRef = useRef(thrusterOwned)
  const sensorsOwnedRef = useRef(sensorsOwned)
  const nightShardsRef = useRef(nightShards)
  const nyxWhisperHeardRef = useRef(nyxWhisperHeard)
  const nyxCorridorUnlockedRef = useRef(nyxCorridorUnlocked)
  const nyxComlogUnlockedRef = useRef(nyxComlogUnlocked)
  const nyxDerelictSeenRef = useRef(nyxDerelictSeen)
  const nyxTugSeenRef = useRef(nyxTugSeen)
  const nyxCassiniSeenRef = useRef(nyxCassiniSeen)
  const nyxDualAshDoneRef = useRef(nyxDualAshDone)
  const nyxHyperionRumorHeardRef = useRef(nyxHyperionRumorHeard)
  const nyxTopicUnlockedRef = useRef(nyxTopicUnlocked)
  const nyxHyperionLeadRef = useRef(nyxHyperionLead)
  const nyxFoundEmptyRef = useRef(nyxFoundEmpty)
  const hideIntroSynopsisRef = useRef(hideIntroSynopsis)
  const nyxWhisperCooldown = useRef(0)
  const telemetryRef = useRef<OrbitalTelemetry | null>(null)
  const healSeq = useRef(0)
  const jettisonSeq = useRef(0)
  const shipMaxHp = maxHpForArmorTier(armorTier)
  const shipTorpedoMaxAmmo = maxAmmoForTorpedoMagTier(torpedoMagTier)
  /** Skip the keyup from the Esc that opened the pause menu */
  const ignoreEscResume = useRef(false)
  const mapSnapshotRef = useRef<MapSnapshot>(createEmptyMapSnapshot())
  const mapShipRef = useRef<Group | null>(null)
  const combatHudRef = useRef<CombatHudState>(createEmptyCombatHud())
  const attitudeHudRef = useRef<AttitudeHudState>(createEmptyAttitudeHud())
  const waypointRef = useRef<MapWaypointState>(createEmptyMapWaypoint())
  /** True while holding M — unlock for map mouse without pausing. */
  const mapOpenRef = useRef(false)

  dockedRef.current = docked
  creditsRef.current = credits
  cargoRef.current = cargo
  playerCargoRef.current.units = cargoUnits(cargo)
  torpedoOwnedRef.current = torpedoOwned
  torpedoAmmoRef.current = torpedoAmmo
  torpedoMagTierRef.current = torpedoMagTier
  armorTierRef.current = armorTier
  thrusterOwnedRef.current = thrusterOwned
  sensorsOwnedRef.current = sensorsOwned
  nightShardsRef.current = nightShards
  nyxWhisperHeardRef.current = nyxWhisperHeard
  nyxCorridorUnlockedRef.current = nyxCorridorUnlocked
  nyxComlogUnlockedRef.current = nyxComlogUnlocked
  nyxDerelictSeenRef.current = nyxDerelictSeen
  nyxTugSeenRef.current = nyxTugSeen
  nyxCassiniSeenRef.current = nyxCassiniSeen
  nyxDualAshDoneRef.current = nyxDualAshDone
  nyxHyperionRumorHeardRef.current = nyxHyperionRumorHeard
  nyxTopicUnlockedRef.current = nyxTopicUnlocked
  nyxHyperionLeadRef.current = nyxHyperionLead
  nyxFoundEmptyRef.current = nyxFoundEmpty
  hideIntroSynopsisRef.current = hideIntroSynopsis
  systemIdRef.current = systemId

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
      dockStationName,
      torpedoOwned: torpedoOwnedRef.current,
      torpedoAmmo: torpedoAmmoRef.current,
      torpedoMagTier: torpedoMagTierRef.current,
      armorTier: armorTierRef.current,
      thrusterOwned: thrusterOwnedRef.current,
      sensorsOwned: sensorsOwnedRef.current,
      nightShards: nightShardsRef.current,
      nyxWhisperHeard: nyxWhisperHeardRef.current,
      nyxCorridorUnlocked: nyxCorridorUnlockedRef.current,
      nyxComlogUnlocked: nyxComlogUnlockedRef.current,
      nyxDerelictSeen: nyxDerelictSeenRef.current,
      nyxTugSeen: nyxTugSeenRef.current,
      nyxCassiniSeen: nyxCassiniSeenRef.current,
      nyxDualAshDone: nyxDualAshDoneRef.current,
      nyxHyperionRumorHeard: nyxHyperionRumorHeardRef.current,
      nyxTopicUnlocked: nyxTopicUnlockedRef.current,
      nyxHyperionLead: nyxHyperionLeadRef.current,
      nyxFoundEmpty: nyxFoundEmptyRef.current,
      hideIntroSynopsis: hideIntroSynopsisRef.current,
      systemId: systemIdRef.current,
    }
    saveGameSave(snapshot)
  }, [dockStationName, saved.hp, saved.heat, saved.overheated])

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
    torpedoMagTier,
    armorTier,
    thrusterOwned,
    sensorsOwned,
    nightShards,
    nyxWhisperHeard,
    nyxCorridorUnlocked,
    nyxComlogUnlocked,
    nyxDerelictSeen,
    nyxTugSeen,
    nyxCassiniSeen,
    nyxDualAshDone,
    nyxHyperionRumorHeard,
    nyxTopicUnlocked,
    nyxHyperionLead,
    nyxFoundEmpty,
    hideIntroSynopsis,
    systemId,
    dockStationName,
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
    } else if (
      startedRef.current &&
      !dockedRef.current &&
      !mapOpenRef.current
    ) {
      // Pointer unlock while docked is intentional (station MFD needs the mouse)
      // Unlock for the hold-M map is also intentional — don't pause.
      setPaused(true)
      ignoreEscResume.current = true
      window.setTimeout(() => {
        ignoreEscResume.current = false
      }, 300)
    }
  }, [])

  const onMapOpenChange = useCallback((open: boolean) => {
    mapOpenRef.current = open
  }, [])

  const unlockNyxTopic = useCallback(() => {
    if (nyxTopicUnlockedRef.current) return
    nyxTopicUnlockedRef.current = true
    setNyxTopicUnlocked(true)
  }, [])

  const onKronosLead = useCallback(() => {
    if (nyxHyperionLeadRef.current) return
    nyxHyperionLeadRef.current = true
    setNyxHyperionLead(true)
    unlockNyxTopic()
  }, [unlockNyxTopic])

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

    // Sol-only Nyx lore — don't fire against alternate Ashen Nyx
    if (systemIdRef.current !== SYSTEM_IDS.sol) return

    // Near Nyx — enable Ask (Transit is not on the dwarf)
    if (isNearNyx(value.nearBody) && !nyxFoundEmptyRef.current) {
      nyxFoundEmptyRef.current = true
      setNyxFoundEmpty(true)
      unlockNyxTopic()
      setLoreToast(NYX_EMPTY_TOAST)
      setLoreToastKey((k) => k + 1)
    }

    // Nyx outer-arc whisper
    const now = performance.now() / 1000
    if (
      isNearNyx(value.nearBody) &&
      isNyxWhisperAltitude(value.altitude) &&
      now >= nyxWhisperCooldown.current
    ) {
      nyxWhisperCooldown.current = now + NYX_WHISPER_COOLDOWN_S
      setNyxWhisperHeard(true)
      setNyxComlogUnlocked(true)
      setNyxCorridorUnlocked(true)
      unlockNyxTopic()
      if (nyxFoundEmptyRef.current) {
        setLoreToast(NYX_WHISPER_TEXT)
        setLoreToastKey((k) => k + 1)
      }
    }

    // Hyperion (after Kronos Ask) → apo pad clue + map mark
    if (
      nyxHyperionLeadRef.current &&
      !nyxHyperionRumorHeardRef.current &&
      isNearHyperion(value.nearBody)
    ) {
      setNyxHyperionRumorHeard(true)
      setNyxCorridorUnlocked(true)
      setLoreToast(NYX_HYPERION_RUMOR)
      setLoreToastKey((k) => k + 1)
    }
  }, [unlockNyxTopic])

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
    if (pickup.nightShard) {
      setNightShards((n) => n + 1)
      unlockNyxTopic()
      setLoreToast(
        nyxDerelictSeenRef.current
          ? NYX_DUST_KEY_TOAST
          : NYX_DUST_PICKUP_TOAST,
      )
      setLoreToastKey((k) => k + 1)
      return
    }
    setCargo((prev) => ({
      ...prev,
      [pickup.kind]: prev[pickup.kind] + pickup.amount,
    }))
  }, [unlockNyxTopic])

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
    const next = clampTorpedoAmmo(
      ammo,
      maxAmmoForTorpedoMagTier(torpedoMagTierRef.current),
    )
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
    const altitude = telemetryRef.current?.altitude ?? Infinity
    if (systemIdRef.current === SYSTEM_IDS.sol && isAshForSolAltitude(altitude)) {
      if (nyxWhisperHeardRef.current && !nyxDualAshDoneRef.current) {
        setNyxDualAshDone(true)
        setLoreToast(ASH_FOR_SOL_DUAL_TEXT)
      } else {
        setLoreToast(ASH_FOR_SOL_TEXT)
      }
      setLoreToastKey((k) => k + 1)
      setJettisonDump({
        seq: jettisonSeq.current,
        x,
        y,
        z,
        cargo: dump,
        ashOffering: true,
      })
      return
    }
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
      const maxAmmo = maxAmmoForTorpedoMagTier(torpedoMagTierRef.current)
      setCredits((c) => c - TORPEDO_UNLOCK_COST)
      torpedoOwnedRef.current = true
      torpedoAmmoRef.current = maxAmmo
      setTorpedoOwned(true)
      setTorpedoAmmo(maxAmmo)
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
      const maxAmmo = maxAmmoForTorpedoMagTier(torpedoMagTierRef.current)
      if (
        !canBuyTorpedoReload(
          creditsRef.current,
          torpedoOwnedRef.current,
          torpedoAmmoRef.current,
          maxAmmo,
        )
      ) {
        return
      }
      setCredits((c) => c - TORPEDO_RELOAD_COST)
      const next = clampTorpedoAmmo(torpedoAmmoRef.current + 1, maxAmmo)
      torpedoAmmoRef.current = next
      setTorpedoAmmo(next)
      return
    }

    const mag = TORPEDO_MAG_TIERS.find((tier) => tier.id === id)
    if (mag) {
      const current = clampTorpedoMagTier(torpedoMagTierRef.current)
      if (mag.tier !== current + 1) return
      if (
        !canBuyTorpedoMagTier(
          creditsRef.current,
          torpedoOwnedRef.current,
          current,
        )
      ) {
        return
      }

      const oldMax = maxAmmoForTorpedoMagTier(current)
      const bonus = mag.maxAmmo - oldMax
      const nextAmmo = clampTorpedoAmmo(
        torpedoAmmoRef.current + bonus,
        mag.maxAmmo,
      )

      setCredits((c) => c - mag.cost)
      torpedoMagTierRef.current = mag.tier
      setTorpedoMagTier(mag.tier)
      torpedoAmmoRef.current = nextAmmo
      setTorpedoAmmo(nextAmmo)
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

    const atNyxTransit = dockStationName === STATION_NAMES.nyx
    const atNyxAlt = dockStationName === STATION_NAMES.nyxAlt
    const hasShard = nightShardsRef.current >= 1

    // Ghost apo pad still needs dust to accept a hard-dock.
    if (atNyxTransit && !hasShard) return

    /** Either Nyx pad with dust — slip to the other system and spend one shard. */
    let arrivedName = dockStationName
    let transported = false
    if ((atNyxTransit || atNyxAlt) && hasShard) {
      nightShardsRef.current -= 1
      setNightShards(nightShardsRef.current)
      Object.assign(waypointRef.current, createEmptyMapWaypoint())
      if (atNyxTransit) {
        systemIdRef.current = SYSTEM_IDS.nyxAlt
        setSystemId(SYSTEM_IDS.nyxAlt)
        arrivedName = STATION_NAMES.nyxAlt
      } else {
        systemIdRef.current = SYSTEM_IDS.sol
        setSystemId(SYSTEM_IDS.sol)
        arrivedName = STATION_NAMES.nyx
      }
      setDockStationName(arrivedName)
      transported = true
    }

    dockedRef.current = true
    setDocked(true)
    setDockAvailable(false)

    if (arrivedName === STATION_NAMES.nyx) {
      setGhostBerth(true)
      setLoreToast(NYX_ALT_TRANSPORT_TOAST)
      setLoreToastKey((k) => k + 1)
    } else if (arrivedName === STATION_NAMES.nyxAlt) {
      setGhostBerth(false)
      if (transported) {
        setLoreToast(NYX_ALT_TRANSPORT_TOAST)
        setLoreToastKey((k) => k + 1)
      } else {
        setLoreToast(null)
      }
    } else if (arrivedName === STATION_NAMES.nyxTug) {
      setGhostBerth(false)
      setLoreToast(null)
      if (!nyxTugSeenRef.current) {
        nyxTugSeenRef.current = true
        setNyxTugSeen(true)
      }
    } else {
      const showGhost = rollGhostBerth(nyxWhisperHeardRef.current)
      setGhostBerth(showGhost)
      if (showGhost) {
        setNyxCorridorUnlocked(true)
        unlockNyxTopic()
      }
      setLoreToast(null)
    }

    setBeltResetSeed((seed) => seed + 1)
    setPaused(false)
    tryPlayStation()
    if (document.pointerLockElement) {
      document.exitPointerLock()
    }
  }, [dockAvailable, dockStationName, unlockNyxTopic])

  const onNyxDerelictSeen = useCallback((toast: string) => {
    if (nyxDerelictSeenRef.current) return
    setNyxDerelictSeen(true)
    unlockNyxTopic()
    setLoreToast(toast)
    setLoreToastKey((k) => k + 1)
  }, [unlockNyxTopic])

  const onNyxTugSeen = useCallback((toast: string) => {
    if (nyxTugSeenRef.current) return
    setNyxTugSeen(true)
    setLoreToast(toast)
    setLoreToastKey((k) => k + 1)
  }, [])

  const onNyxCassiniSeen = useCallback((toast: string) => {
    if (nyxCassiniSeenRef.current) return
    setNyxCassiniSeen(true)
    setLoreToast(toast)
    setLoreToastKey((k) => k + 1)
  }, [])

  const undockFromStation = useCallback(() => {
    dockedRef.current = false
    setDocked(false)
    setGhostBerth(false)
    setPaused(false)
    setHealRequest(null)
    setLoreToast(null)
    tryPlayTheme()
    const canvas = document.querySelector('canvas')
    void canvas?.requestPointerLock()
  }, [])

  /** Dev admin — instant Sol ↔ Vesper hop, docked at the matching Nyx pad. */
  const adminTransportToSystem = useCallback((target: SystemId) => {
    const arrivedName =
      target === SYSTEM_IDS.nyxAlt ? STATION_NAMES.nyxAlt : STATION_NAMES.nyx

    Object.assign(waypointRef.current, createEmptyMapWaypoint())
    systemIdRef.current = target
    setSystemId(target)
    setDockStationName(arrivedName)

    startedRef.current = true
    setStarted(true)
    dockedRef.current = true
    setDocked(true)
    setDockAvailable(false)
    setGhostBerth(arrivedName === STATION_NAMES.nyx)
    setLoreToast(NYX_ALT_TRANSPORT_TOAST)
    setLoreToastKey((k) => k + 1)
    setBeltResetSeed((seed) => seed + 1)
    setPaused(false)
    setShowIntroModal(false)
    tryPlayStation()
    if (document.pointerLockElement) {
      document.exitPointerLock()
    }
  }, [])

  const adminWarpSeq = useRef(0)
  const [adminWarpTarget, setAdminWarpTarget] =
    useState<AdminWarpRequest | null>(null)

  const adminWarp = useCallback((id: AdminWarpId) => {
    dockedRef.current = false
    setDocked(false)
    setGhostBerth(false)
    setDockAvailable(false)
    setPaused(false)
    startedRef.current = true
    setStarted(true)
    setShowIntroModal(false)
    adminWarpSeq.current += 1
    setAdminWarpTarget({ seq: adminWarpSeq.current, id })
    tryPlayTheme()
    const canvas = document.querySelector('canvas')
    void canvas?.requestPointerLock()
  }, [])

  const adminAddCredits = useCallback((amount: number) => {
    setCredits((c) => c + amount)
  }, [])

  const adminAddDust = useCallback((amount: number) => {
    setNightShards((n) => n + amount)
    unlockNyxTopic()
  }, [unlockNyxTopic])

  const adminHeal = useCallback(() => {
    const maxHp = maxHpForArmorTier(armorTierRef.current)
    const repaired = telemetryRef.current
      ? { ...telemetryRef.current, hp: maxHp, maxHp, heat: 0, overheated: false }
      : null
    if (repaired) {
      telemetryRef.current = repaired
      lastHp.current = maxHp
      setTelemetry(repaired)
    }
    healSeq.current += 1
    setHealRequest({ seq: healSeq.current, hp: maxHp, maxHp })
  }, [])

  const adminUnlockOutfits = useCallback(() => {
    setTorpedoOwned(true)
    torpedoOwnedRef.current = true
    setThrusterOwned(true)
    thrusterOwnedRef.current = true
    setSensorsOwned(true)
    sensorsOwnedRef.current = true
    setArmorTier(ARMOR_MAX_TIER)
    armorTierRef.current = ARMOR_MAX_TIER
    setTorpedoMagTier(TORPEDO_MAG_MAX_TIER)
    torpedoMagTierRef.current = TORPEDO_MAG_MAX_TIER
    const maxAmmo = maxAmmoForTorpedoMagTier(TORPEDO_MAG_MAX_TIER)
    setTorpedoAmmo(maxAmmo)
    torpedoAmmoRef.current = maxAmmo
    const maxHp = maxHpForArmorTier(ARMOR_MAX_TIER)
    healSeq.current += 1
    setHealRequest({ seq: healSeq.current, hp: maxHp, maxHp })
  }, [])

  const adminFillTubes = useCallback(() => {
    const maxAmmo = maxAmmoForTorpedoMagTier(torpedoMagTierRef.current)
    if (!torpedoOwnedRef.current) {
      setTorpedoOwned(true)
      torpedoOwnedRef.current = true
    }
    setTorpedoAmmo(maxAmmo)
    torpedoAmmoRef.current = maxAmmo
  }, [])

  const adminFillCargo = useCallback(() => {
    setCargo({ ore: 40, ice: 40, alloy: 20 })
  }, [])

  const adminUnlockLore = useCallback(() => {
    setNyxTopicUnlocked(true)
    nyxTopicUnlockedRef.current = true
    setNyxHyperionLead(true)
    nyxHyperionLeadRef.current = true
    setNyxHyperionRumorHeard(true)
    nyxHyperionRumorHeardRef.current = true
    setNyxWhisperHeard(true)
    nyxWhisperHeardRef.current = true
    setNyxComlogUnlocked(true)
    nyxComlogUnlockedRef.current = true
    setNyxCorridorUnlocked(true)
    nyxCorridorUnlockedRef.current = true
    setNyxDerelictSeen(true)
    nyxDerelictSeenRef.current = true
    setNyxFoundEmpty(true)
    nyxFoundEmptyRef.current = true
    setNyxTugSeen(true)
    nyxTugSeenRef.current = true
    setNyxCassiniSeen(true)
    nyxCassiniSeenRef.current = true
    setNyxDualAshDone(true)
    nyxDualAshDoneRef.current = true
    setNightShards((n) => Math.max(n, 3))
  }, [])

  const adminClearLore = useCallback(() => {
    setNyxTopicUnlocked(false)
    nyxTopicUnlockedRef.current = false
    setNyxHyperionLead(false)
    nyxHyperionLeadRef.current = false
    setNyxHyperionRumorHeard(false)
    nyxHyperionRumorHeardRef.current = false
    setNyxWhisperHeard(false)
    nyxWhisperHeardRef.current = false
    setNyxComlogUnlocked(false)
    nyxComlogUnlockedRef.current = false
    setNyxCorridorUnlocked(false)
    nyxCorridorUnlockedRef.current = false
    setNyxDerelictSeen(false)
    nyxDerelictSeenRef.current = false
    setNyxFoundEmpty(false)
    nyxFoundEmptyRef.current = false
    setNyxTugSeen(false)
    nyxTugSeenRef.current = false
    setNyxCassiniSeen(false)
    nyxCassiniSeenRef.current = false
    setNyxDualAshDone(false)
    nyxDualAshDoneRef.current = false
    setNightShards(0)
    nightShardsRef.current = 0
  }, [])

  const dismissLoreToast = useCallback(() => {
    setLoreToast(null)
  }, [])

  const resumeFlight = useCallback(() => {
    setPaused(false)
    tryPlayTheme()
    const canvas = document.querySelector('canvas')
    void canvas?.requestPointerLock()
  }, [])

  const onIntroContinue = useCallback((dontShowAgain: boolean) => {
    if (dontShowAgain) {
      hideIntroSynopsisRef.current = true
      setHideIntroSynopsis(true)
    }
    setShowIntroModal(false)
  }, [])

  const resetProgress = useCallback(() => {
    const next = defaultGameSave()
    const hull = hullFromSave(next)

    // Sync refs before any persist/unload flush can run
    creditsRef.current = next.credits
    cargoRef.current = { ...next.cargo }
    playerCargoRef.current.units = 0
    torpedoOwnedRef.current = next.torpedoOwned
    torpedoAmmoRef.current = next.torpedoAmmo
    torpedoMagTierRef.current = next.torpedoMagTier
    armorTierRef.current = next.armorTier
    thrusterOwnedRef.current = next.thrusterOwned
    sensorsOwnedRef.current = next.sensorsOwned
    nightShardsRef.current = next.nightShards
    nyxWhisperHeardRef.current = next.nyxWhisperHeard
    nyxCorridorUnlockedRef.current = next.nyxCorridorUnlocked
    nyxComlogUnlockedRef.current = next.nyxComlogUnlocked
    nyxDerelictSeenRef.current = next.nyxDerelictSeen
    nyxTugSeenRef.current = next.nyxTugSeen
    nyxCassiniSeenRef.current = next.nyxCassiniSeen
    nyxDualAshDoneRef.current = next.nyxDualAshDone
    nyxHyperionRumorHeardRef.current = next.nyxHyperionRumorHeard
    nyxTopicUnlockedRef.current = next.nyxTopicUnlocked
    nyxHyperionLeadRef.current = next.nyxHyperionLead
    nyxFoundEmptyRef.current = next.nyxFoundEmpty
    hideIntroSynopsisRef.current = next.hideIntroSynopsis
    systemIdRef.current = next.systemId
    dockedRef.current = false
    startedRef.current = false
    lastHp.current = hull.hp
    nyxWhisperCooldown.current = 0
    setShowIntroModal(!next.hideIntroSynopsis)

    const telemetryReset: OrbitalTelemetry | null = telemetryRef.current
      ? {
          ...telemetryRef.current,
          hp: hull.hp,
          maxHp: hull.maxHp,
          heat: 0,
          overheated: false,
          speedBuff: 0,
          fireBuff: 0,
          torpedoOwned: false,
          torpedoAmmo: 0,
          torpedoLock: 0,
          thrusterOwned: false,
          thrusterActive: false,
        }
      : null
    telemetryRef.current = telemetryReset

    setCredits(next.credits)
    setCargo({ ...next.cargo })
    setTorpedoOwned(next.torpedoOwned)
    setTorpedoAmmo(next.torpedoAmmo)
    setTorpedoMagTier(next.torpedoMagTier)
    setArmorTier(next.armorTier)
    setThrusterOwned(next.thrusterOwned)
    setSensorsOwned(next.sensorsOwned)
    setNightShards(next.nightShards)
    setNyxWhisperHeard(next.nyxWhisperHeard)
    setNyxCorridorUnlocked(next.nyxCorridorUnlocked)
    setNyxComlogUnlocked(next.nyxComlogUnlocked)
    setNyxDerelictSeen(next.nyxDerelictSeen)
    setNyxTugSeen(next.nyxTugSeen)
    setNyxCassiniSeen(next.nyxCassiniSeen)
    setNyxDualAshDone(next.nyxDualAshDone)
    setNyxHyperionRumorHeard(next.nyxHyperionRumorHeard)
    setNyxTopicUnlocked(next.nyxTopicUnlocked)
    setNyxHyperionLead(next.nyxHyperionLead)
    setNyxFoundEmpty(next.nyxFoundEmpty)
    setHideIntroSynopsis(next.hideIntroSynopsis)
    setSystemId(next.systemId)
    setDockStationName(next.dockStationName)
    setGhostBerth(false)
    setLoreToast(null)
    setDockAvailable(false)
    setJettisonDump(null)
    setTelemetry(telemetryReset)
    setDocked(false)
    setStarted(false)
    setPaused(false)

    healSeq.current += 1
    setHealRequest({
      seq: healSeq.current,
      hp: hull.hp,
      maxHp: BASE_MAX_HP,
    })
    setBeltResetSeed((seed) => seed + 1)

    saveGameSave(next)

    if (document.pointerLockElement) {
      document.exitPointerLock()
    }
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
      {import.meta.env.DEV && (
        <>
          <Leva
            collapsed
            oneLineLabels
            titleBar={{ title: 'DRIFTR · Admin' }}
          />
          <AdminPanel
            systemId={systemId}
            onTransport={adminTransportToSystem}
            onAddCredits={adminAddCredits}
            onAddDust={adminAddDust}
            onHeal={adminHeal}
            onUnlockOutfits={adminUnlockOutfits}
            onFillTubes={adminFillTubes}
            onFillCargo={adminFillCargo}
            onUnlockLore={adminUnlockLore}
            onClearLore={adminClearLore}
            onWarp={adminWarp}
          />
        </>
      )}
      <ThemeMusic
        playing={!booting && started && !paused && !docked}
        docked={docked}
      />
      <GameCanvas
        started={started}
        paused={worldPaused}
        docked={docked}
        dockStationName={dockStationName}
        beltResetSeed={beltResetSeed}
        suspendRender={started && paused && !docked}
        systemId={systemId}
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
        maxHp={shipMaxHp}
        torpedoOwned={torpedoOwned}
        torpedoAmmo={torpedoAmmo}
        torpedoMaxAmmo={shipTorpedoMaxAmmo}
        onTorpedoAmmoChange={onTorpedoAmmoChange}
        thrusterOwned={thrusterOwned}
        sensorsOwned={sensorsOwned}
        playerCargoRef={playerCargoRef}
        adminWarpTarget={adminWarpTarget}
        jettisonDump={jettisonDump}
        onJettisonCargo={onJettisonCargo}
        nyxDerelictSeen={nyxDerelictSeen}
        onNyxDerelictSeen={onNyxDerelictSeen}
        nyxTugSeen={nyxTugSeen}
        onNyxTugSeen={onNyxTugSeen}
        nyxCassiniSeen={nyxCassiniSeen}
        onNyxCassiniSeen={onNyxCassiniSeen}
        nyxCorridorUnlockedRef={nyxCorridorUnlockedRef}
        nyxTransitDockable={
          systemId === SYSTEM_IDS.sol &&
          (nightShards > 0 ||
            (docked && dockStationName === STATION_NAMES.nyx))
        }
        nyxApoMarkActive={
          systemId === SYSTEM_IDS.sol &&
          nyxHyperionRumorHeard &&
          !nyxDerelictSeen
        }
        nyxHyperionRumorHeard={
          systemId === SYSTEM_IDS.sol && nyxHyperionRumorHeard
        }
      />
      {started && !booting && (
        <LoreToast
          message={loreToast}
          flashKey={loreToastKey}
          onDismissed={dismissLoreToast}
        />
      )}
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
            wobble={isNearHyperion(telemetry?.nearBody ?? null)}
          />
          <CombatChevron hudRef={combatHudRef} active={inFlight} />
          <MapWaypointMarker waypointRef={waypointRef} active={inFlight} />
          <DamageFlash flashKey={damageFlash} active={inFlight} />
          <Hud
            telemetry={telemetry}
            credits={credits}
            cargo={cargo}
            armorTier={armorTier}
          />
          <Navball attitudeRef={attitudeHudRef} active={inFlight} />
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
          <SystemMap
            snapshotRef={mapSnapshotRef}
            active={started}
            onRequestResume={resumeFlight}
            onOpenChange={onMapOpenChange}
            waypointRef={waypointRef}
          />
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
            torpedoMagTier={torpedoMagTier}
            thrusterOwned={thrusterOwned}
            sensorsOwned={sensorsOwned}
            ghostBerth={ghostBerth}
            nyxWhisperHeard={nyxWhisperHeard}
            nyxTopicUnlocked={nyxTopicUnlocked}
            nyxHyperionLead={nyxHyperionLead}
            nyxDerelictSeen={nyxDerelictSeen}
            onSell={sellMaterial}
            onSellAll={sellAllCargo}
            onRepair={repairShip}
            onBuy={buyShopItem}
            onUndock={undockFromStation}
            onNyxTopicClue={unlockNyxTopic}
            onKronosLead={onKronosLead}
            limitedServices={dockStationName === STATION_NAMES.nyxAlt}
          />
        </Suspense>
      )}
      {showMenu && (
        <Suspense fallback={null}>
          <PauseMenu
            mode={menuMode}
            onResume={resumeFlight}
            onResetProgress={resetProgress}
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
              torpedoMagTier,
              thrusterOwned,
              sensorsOwned,
              heat: telemetry?.heat ?? saved.heat,
              overheated: telemetry?.overheated ?? saved.overheated,
              speed: telemetry?.speed ?? 0,
              altitude: telemetry?.altitude ?? 0,
              nightShards,
              nyxTopicUnlocked,
              nyxHyperionLead,
              nyxHyperionRumorHeard,
              nyxFoundEmpty,
              nyxWhisperHeard,
              nyxComlogUnlocked,
              nyxCorridorUnlocked,
              nyxDerelictSeen,
              nyxTugSeen,
              nyxCassiniSeen,
              nyxDualAshDone,
            }}
          />
        </Suspense>
      )}
      {!booting && showIntroModal && (
        <LoreIntroModal onContinue={onIntroContinue} />
      )}
      {!booting && <FpsCounter />}
      {booting && <LoadingScreen onFinished={onBootFinished} />}
    </>
  )
}
