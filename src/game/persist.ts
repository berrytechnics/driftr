import {
  emptyCargo,
  type CargoHold,
  type MaterialKind,
} from '@/loot/economy'
import {
  BASE_MAX_HP,
  clampArmorTier,
  clampTorpedoAmmo,
  maxHpForArmorTier,
} from '@/loot/shop'

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
  /** Loaded warheads (0–4). */
  torpedoAmmo: number
  /** Hull plating tier (0 = stock, 1–3 = upgrades). */
  armorTier: number
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
    armorTier: 0,
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
    // Drop orphan ammo if the launcher was never purchased
    torpedoAmmo: torpedoOwned ? clampTorpedoAmmo(torpedoAmmoRaw) : 0,
    armorTier,
  }
}

export function saveGameSave(save: GameSave) {
  const torpedoOwned = !!save.torpedoOwned
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
    torpedoAmmo: torpedoOwned ? clampTorpedoAmmo(save.torpedoAmmo) : 0,
    armorTier,
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
