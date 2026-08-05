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
import { STATION_NAME } from '@/game/systemConfig'
import {
  emptyCargo,
  MATERIAL_PRICE,
  type CargoHold,
  type MaterialKind,
} from '@/loot/economy'
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
import { Hud } from '@/ui/Hud'

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
  const [paused, setPaused] = useState(false)
  const [started, setStarted] = useState(() => saved.docked)
  const [docked, setDocked] = useState(() => saved.docked)
  const [dockAvailable, setDockAvailable] = useState(false)
  const [telemetry, setTelemetry] = useState<OrbitalTelemetry | null>(null)
  const [credits, setCredits] = useState(() => saved.credits)
  const [cargo, setCargo] = useState<CargoHold>(() => ({ ...saved.cargo }))
  const [damageFlash, setDamageFlash] = useState(0)
  const startedRef = useRef(saved.docked)
  const dockedRef = useRef(saved.docked)
  const lastHp = useRef<number | null>(saved.hp)
  const creditsRef = useRef(credits)
  const cargoRef = useRef(cargo)
  const telemetryRef = useRef<OrbitalTelemetry | null>(null)
  /** Skip the keyup from the Esc that opened the pause menu */
  const ignoreEscResume = useRef(false)
  const mapSnapshotRef = useRef<MapSnapshot>(createEmptyMapSnapshot())
  const mapShipRef = useRef<Group | null>(null)
  const combatHudRef = useRef<CombatHudState>(createEmptyCombatHud())

  dockedRef.current = docked
  creditsRef.current = credits
  cargoRef.current = cargo

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
    }
    saveGameSave(snapshot)
  }, [saved.hp, saved.heat, saved.overheated])

  // Debounced autosave when economy / dock / hull changes
  useEffect(() => {
    const timer = window.setTimeout(persistNow, 400)
    return () => window.clearTimeout(timer)
  }, [credits, cargo, docked, telemetry, persistNow])

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
    lastHp.current = value.hp
    telemetryRef.current = value
    setTelemetry(value)
  }, [])

  const onDockAvailable = useCallback((available: boolean) => {
    setDockAvailable(available)
  }, [])

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

  const dockAtStation = useCallback(() => {
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
    if (!started || paused || docked || !dockAvailable) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'KeyF' || event.repeat) return
      event.preventDefault()
      dockAtStation()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [started, paused, docked, dockAvailable, dockAtStation])

  const showMenu = (!started || paused) && !docked
  const menuMode = started || paused ? 'paused' : 'start'
  const worldPaused = !started || paused
  const inFlight = started && !paused && !docked

  return (
    <>
      <Leva collapsed />
      <ThemeMusic
        playing={started && !paused && !docked}
        docked={docked}
      />
      <GameCanvas
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
      />
      {inFlight && (
        <>
          <Crosshair
            overheated={!!telemetry?.overheated}
            dead={!!telemetry && telemetry.hp <= 0}
          />
          <CombatChevron hudRef={combatHudRef} active={inFlight} />
          <DamageFlash flashKey={damageFlash} active={inFlight} />
          <Hud telemetry={telemetry} credits={credits} cargo={cargo} />
          {dockAvailable && (
            <Suspense fallback={null}>
              <DockPrompt stationName={STATION_NAME} onDock={dockAtStation} />
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
            stationName={STATION_NAME}
            credits={credits}
            cargo={cargo}
            onSell={sellMaterial}
            onSellAll={sellAllCargo}
            onUndock={undockFromStation}
          />
        </Suspense>
      )}
      {showMenu && (
        <Suspense fallback={null}>
          <PauseMenu mode={menuMode} onResume={resumeFlight} />
        </Suspense>
      )}
    </>
  )
}
