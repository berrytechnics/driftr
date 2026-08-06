import {
  emptyCargo,
  type CargoHold,
  type MaterialKind,
} from '@/loot/economy'
import {
  STATION_NAMES,
  SYSTEM_IDS,
  type SystemId,
} from '@/game/systemConfig'
import { isSiphonPadName } from '@/lore/siphonPads'
import {
  BASE_MAX_HP,
  clampArmorTier,
  clampTorpedoAmmo,
  clampTorpedoMagTier,
  maxAmmoForTorpedoMagTier,
  maxHpForArmorTier,
} from '@/loot/shop'

function sanitizeSystemId(raw: unknown): SystemId {
  if (raw === SYSTEM_IDS.nyxAlt) return SYSTEM_IDS.nyxAlt
  return SYSTEM_IDS.sol
}

const KNOWN_STATIONS = new Set<string>(Object.values(STATION_NAMES))

function sanitizeDockStationName(raw: unknown, systemId: SystemId): string {
  if (typeof raw === 'string' && isSiphonPadName(raw)) {
    // Siphon pads only exist in the alt sky
    return systemId === SYSTEM_IDS.nyxAlt ? raw : STATION_NAMES.nyxAlt
  }
  if (typeof raw === 'string' && KNOWN_STATIONS.has(raw)) {
    // Don't restore a Sol pad while in alt (or vice versa) after a bad save.
    if (systemId === SYSTEM_IDS.nyxAlt) {
      if (raw === STATION_NAMES.nyxAlt || raw === STATION_NAMES.nyxTug) {
        return raw
      }
      return STATION_NAMES.nyxAlt
    }
    if (
      raw === STATION_NAMES.nyxAlt ||
      raw === STATION_NAMES.nyxTug
    ) {
      return STATION_NAMES.thalassa
    }
    return raw
  }
  return systemId === SYSTEM_IDS.nyxAlt
    ? STATION_NAMES.nyxAlt
    : STATION_NAMES.thalassa
}

function sanitizeSiphonRepaired(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  const out: number[] = []
  const seen = new Set<number>()
  for (const v of raw) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue
    const id = Math.floor(v)
    if (id < 0 || id > 64 || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

const SAVE_KEY = '3js-save-v1'
/** Legacy Leva settings blob — cleared so it doesn't linger. */
const LEGACY_SETTINGS_KEY = '3js-settings-v1'

export type GameSave = {
  version: 1
  credits: number
  cargo: CargoHold
  hp: number
  heat: number
  overheated: boolean
  speedBuff: number
  fireBuff: number
  docked: boolean
  /** Seeking torpedo launcher unlocked at the station. */
  torpedoOwned: boolean
  /** Loaded warheads (0–capacity for current magazine tier). */
  torpedoAmmo: number
  /** Magazine expansion tier (0 = stock 4 tubes, 1–3 = upgrades). */
  torpedoMagTier: number
  /** Hull plating tier (0 = stock, 1–3 = upgrades). */
  armorTier: number
  /** Advanced thruster unlocked at the station. */
  thrusterOwned: boolean
  /** Long-range sensors unlocked at the station. */
  sensorsOwned: boolean
  /** Lore — night shards scooped from the omen belt rock. */
  nightShards: number
  /** Lore — heard Nyx’s apoapsis whisper at least once. */
  nyxWhisperHeard: boolean
  /** Lore — map shows NYX TRANSIT corridor. */
  nyxCorridorUnlocked: boolean
  /** Lore — pause COMLOG entry available. */
  nyxComlogUnlocked: boolean
  /** Lore — saw the derelict ghost station. */
  nyxDerelictSeen: boolean
  /** Lore — approached the derelict tug in alt Nyx space. */
  nyxTugSeen: boolean
  /** Lore — approached the Cassini probe husk in alt Nyx space. */
  nyxCassiniSeen: boolean
  /** Lore — approached the Unknown structure (alt gate) in alt Nyx space. */
  nyxGateSeen: boolean
  /**
   * Indices of collector-ring siphons revived with Nyx dust
   * (subset of SIPHON_INITIAL_DEAD).
   */
  vesperSiphonRepaired: number[]
  /** Lore — dual ash toast used once. */
  nyxDualAshDone: boolean
  /** Lore — Hyperion outer-arc handoff toast heard once. */
  nyxHyperionRumorHeard: boolean
  /** Lore — found a natural Nyx clue; ATC Ask about Nyx unlocked. */
  nyxTopicUnlocked: boolean
  /** Lore — Kronos ATC pointed you at Hyperion. */
  nyxHyperionLead: boolean
  /** Lore — approached Nyx herself and found no Transit. */
  nyxFoundEmpty: boolean
  /** Skip the first-load lore briefing modal. */
  hideIntroSynopsis: boolean
  /** Which system sky is loaded — Sol vs alternate Nyx. */
  systemId: SystemId
  /** Last hard-dock pad name (survives remount / reload). */
  dockStationName: string
}

export type HullSnapshot = {
  hp: number
  maxHp: number
  heat: number
  overheated: boolean
  speedBuff: number
  fireBuff: number
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Quota / private mode — ignore
  }
}

function sanitizeCargo(raw: unknown): CargoHold {
  const base = emptyCargo()
  if (!raw || typeof raw !== 'object') return base
  const obj = raw as Record<string, unknown>
  for (const kind of ['ore', 'ice', 'alloy'] as MaterialKind[]) {
    const n = obj[kind]
    base[kind] =
      typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
  }
  return base
}

export function defaultGameSave(): GameSave {
  return {
    version: 1,
    credits: 0,
    cargo: emptyCargo(),
    hp: BASE_MAX_HP,
    heat: 0,
    overheated: false,
    speedBuff: 0,
    fireBuff: 0,
    docked: false,
    torpedoOwned: false,
    torpedoAmmo: 0,
    torpedoMagTier: 0,
    armorTier: 0,
    thrusterOwned: false,
    sensorsOwned: false,
    nightShards: 0,
    nyxWhisperHeard: false,
    nyxCorridorUnlocked: false,
    nyxComlogUnlocked: false,
    nyxDerelictSeen: false,
    nyxTugSeen: false,
    nyxCassiniSeen: false,
    nyxGateSeen: false,
    vesperSiphonRepaired: [],
    nyxDualAshDone: false,
    nyxHyperionRumorHeard: false,
    nyxTopicUnlocked: false,
    nyxHyperionLead: false,
    nyxFoundEmpty: false,
    hideIntroSynopsis: false,
    systemId: SYSTEM_IDS.sol,
    dockStationName: STATION_NAMES.thalassa,
  }
}

export function loadGameSave(): GameSave {
  try {
    localStorage.removeItem(LEGACY_SETTINGS_KEY)
  } catch {
    // ignore
  }

  const raw = readJson<Partial<GameSave>>(SAVE_KEY)
  const base = defaultGameSave()
  if (!raw || raw.version !== 1) return base

  const armorTier = clampArmorTier(
    typeof raw.armorTier === 'number' && Number.isFinite(raw.armorTier)
      ? raw.armorTier
      : 0,
  )
  const maxHp = maxHpForArmorTier(armorTier)
  const hpRaw =
    typeof raw.hp === 'number' && Number.isFinite(raw.hp) ? raw.hp : maxHp
  // Dead hull → treat as a fresh respawn next launch
  const hp = hpRaw <= 0 ? maxHp : clamp(Math.round(hpRaw), 1, maxHp)

  const torpedoOwned = !!raw.torpedoOwned
  const torpedoMagTier = torpedoOwned
    ? clampTorpedoMagTier(
        typeof raw.torpedoMagTier === 'number' &&
          Number.isFinite(raw.torpedoMagTier)
          ? raw.torpedoMagTier
          : 0,
      )
    : 0
  const torpedoMaxAmmo = maxAmmoForTorpedoMagTier(torpedoMagTier)
  const torpedoAmmoRaw =
    typeof raw.torpedoAmmo === 'number' && Number.isFinite(raw.torpedoAmmo)
      ? raw.torpedoAmmo
      : 0

  return {
    version: 1,
    credits:
      typeof raw.credits === 'number' && Number.isFinite(raw.credits)
        ? Math.max(0, Math.floor(raw.credits))
        : 0,
    cargo: sanitizeCargo(raw.cargo),
    hp,
    heat:
      typeof raw.heat === 'number' && Number.isFinite(raw.heat)
        ? clamp(raw.heat, 0, 1)
        : 0,
    overheated: !!raw.overheated,
    speedBuff:
      typeof raw.speedBuff === 'number' && Number.isFinite(raw.speedBuff)
        ? Math.max(0, raw.speedBuff)
        : 0,
    fireBuff:
      typeof raw.fireBuff === 'number' && Number.isFinite(raw.fireBuff)
        ? Math.max(0, raw.fireBuff)
        : 0,
    docked: !!raw.docked,
    torpedoOwned,
    // Drop orphan ammo / mag if the launcher was never purchased
    torpedoAmmo: torpedoOwned
      ? clampTorpedoAmmo(torpedoAmmoRaw, torpedoMaxAmmo)
      : 0,
    torpedoMagTier,
    armorTier,
    thrusterOwned: !!raw.thrusterOwned,
    sensorsOwned: !!raw.sensorsOwned,
    nightShards:
      typeof raw.nightShards === 'number' && Number.isFinite(raw.nightShards)
        ? Math.max(0, Math.floor(raw.nightShards))
        : 0,
    nyxWhisperHeard: !!raw.nyxWhisperHeard,
    nyxCorridorUnlocked: !!raw.nyxCorridorUnlocked || !!raw.nyxWhisperHeard,
    nyxComlogUnlocked: !!raw.nyxComlogUnlocked || !!raw.nyxWhisperHeard,
    nyxDerelictSeen: !!raw.nyxDerelictSeen,
    nyxTugSeen: !!raw.nyxTugSeen,
    nyxCassiniSeen: !!raw.nyxCassiniSeen,
    nyxGateSeen: !!raw.nyxGateSeen,
    vesperSiphonRepaired: sanitizeSiphonRepaired(raw.vesperSiphonRepaired),
    nyxDualAshDone: !!raw.nyxDualAshDone,
    nyxHyperionRumorHeard: !!raw.nyxHyperionRumorHeard,
    // Migrate: any prior Nyx progress implies the ATC topic is available
    nyxTopicUnlocked:
      !!raw.nyxTopicUnlocked ||
      !!raw.nyxWhisperHeard ||
      !!raw.nyxCorridorUnlocked ||
      !!raw.nyxDerelictSeen ||
      !!raw.nyxHyperionLead ||
      !!raw.nyxHyperionRumorHeard ||
      !!raw.nyxFoundEmpty ||
      !!raw.nyxTugSeen ||
      !!raw.nyxCassiniSeen ||
      !!raw.nyxGateSeen ||
      (typeof raw.nightShards === 'number' && raw.nightShards > 0),
    nyxHyperionLead: !!raw.nyxHyperionLead,
    // Approaching Nyx / whisper already counts as "found her empty"
    nyxFoundEmpty:
      !!raw.nyxFoundEmpty || !!raw.nyxWhisperHeard || !!raw.nyxDerelictSeen,
    hideIntroSynopsis: !!raw.hideIntroSynopsis,
    systemId: sanitizeSystemId(raw.systemId),
    dockStationName: sanitizeDockStationName(
      raw.dockStationName,
      sanitizeSystemId(raw.systemId),
    ),
  }
}

export function saveGameSave(save: GameSave) {
  const torpedoOwned = !!save.torpedoOwned
  const torpedoMagTier = torpedoOwned
    ? clampTorpedoMagTier(save.torpedoMagTier)
    : 0
  const torpedoMaxAmmo = maxAmmoForTorpedoMagTier(torpedoMagTier)
  const armorTier = clampArmorTier(save.armorTier)
  const maxHp = maxHpForArmorTier(armorTier)
  writeJson(SAVE_KEY, {
    ...save,
    version: 1 as const,
    credits: Math.max(0, Math.floor(save.credits)),
    cargo: sanitizeCargo(save.cargo),
    hp: save.hp <= 0 ? maxHp : clamp(Math.round(save.hp), 1, maxHp),
    heat: clamp(save.heat, 0, 1),
    speedBuff: Math.max(0, save.speedBuff),
    fireBuff: Math.max(0, save.fireBuff),
    torpedoOwned,
    torpedoAmmo: torpedoOwned
      ? clampTorpedoAmmo(save.torpedoAmmo, torpedoMaxAmmo)
      : 0,
    torpedoMagTier,
    armorTier,
    thrusterOwned: !!save.thrusterOwned,
    sensorsOwned: !!save.sensorsOwned,
    nightShards: Math.max(0, Math.floor(save.nightShards ?? 0)),
    nyxWhisperHeard: !!save.nyxWhisperHeard,
    nyxCorridorUnlocked: !!save.nyxCorridorUnlocked,
    nyxComlogUnlocked: !!save.nyxComlogUnlocked,
    nyxDerelictSeen: !!save.nyxDerelictSeen,
    nyxTugSeen: !!save.nyxTugSeen,
    nyxCassiniSeen: !!save.nyxCassiniSeen,
    nyxGateSeen: !!save.nyxGateSeen,
    vesperSiphonRepaired: sanitizeSiphonRepaired(save.vesperSiphonRepaired),
    nyxDualAshDone: !!save.nyxDualAshDone,
    nyxHyperionRumorHeard: !!save.nyxHyperionRumorHeard,
    nyxTopicUnlocked: !!save.nyxTopicUnlocked,
    nyxHyperionLead: !!save.nyxHyperionLead,
    nyxFoundEmpty: !!save.nyxFoundEmpty,
    hideIntroSynopsis: !!save.hideIntroSynopsis,
    systemId: sanitizeSystemId(save.systemId),
    dockStationName: sanitizeDockStationName(
      save.dockStationName,
      sanitizeSystemId(save.systemId),
    ),
  } satisfies GameSave)
}

export function hullFromSave(save: GameSave): HullSnapshot {
  const maxHp = maxHpForArmorTier(save.armorTier)
  return {
    hp: save.hp,
    maxHp,
    heat: save.heat,
    overheated: save.overheated,
    speedBuff: save.speedBuff,
    fireBuff: save.fireBuff,
  }
}
