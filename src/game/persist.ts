import {
  emptyCargo,
  type CargoHold,
  type MaterialKind,
} from '@/loot/economy'

const SAVE_KEY = '3js-save-v1'
/** Legacy Leva settings blob — cleared so it doesn't linger. */
const LEGACY_SETTINGS_KEY = '3js-settings-v1'
const MAX_HP = 100

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
}

export type HullSnapshot = {
  hp: number
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
    hp: MAX_HP,
    heat: 0,
    overheated: false,
    speedBuff: 0,
    fireBuff: 0,
    docked: false,
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

  const hpRaw = typeof raw.hp === 'number' && Number.isFinite(raw.hp) ? raw.hp : MAX_HP
  // Dead hull → treat as a fresh respawn next launch
  const hp = hpRaw <= 0 ? MAX_HP : clamp(Math.round(hpRaw), 1, MAX_HP)

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
  }
}

export function saveGameSave(save: GameSave) {
  writeJson(SAVE_KEY, {
    ...save,
    version: 1 as const,
    credits: Math.max(0, Math.floor(save.credits)),
    cargo: sanitizeCargo(save.cargo),
    hp: save.hp <= 0 ? MAX_HP : clamp(Math.round(save.hp), 1, MAX_HP),
    heat: clamp(save.heat, 0, 1),
    speedBuff: Math.max(0, save.speedBuff),
    fireBuff: Math.max(0, save.fireBuff),
  } satisfies GameSave)
}

export function hullFromSave(save: GameSave): HullSnapshot {
  return {
    hp: save.hp,
    heat: save.heat,
    overheated: save.overheated,
    speedBuff: save.speedBuff,
    fireBuff: save.fireBuff,
  }
}
