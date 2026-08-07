const STORAGE_KEY = '3js-controls-v1'

export type ControlSettings = {
  /** Pitch rate multiplier (arrow ↑/↓) */
  pitch: number
  /** Yaw rate multiplier (Q / E) */
  yaw: number
  /** Roll rate multiplier (arrow ←/→) */
  roll: number
  /** HUD cursor speed while pointer-locked */
  cursor: number
  /** Flip ↑/↓ pitch sense */
  invertPitch: boolean
  /** Flip Q/E yaw sense */
  invertYaw: boolean
  /** Flip ←/→ roll sense */
  invertRoll: boolean
}

type Listener = (settings: ControlSettings) => void

const DEFAULTS: ControlSettings = {
  pitch: 1,
  yaw: 1,
  roll: 1,
  cursor: 1,
  invertPitch: false,
  invertYaw: false,
  invertRoll: false,
}

const MIN = 0.25
const MAX = 2
const listeners = new Set<Listener>()

function clampSens(n: number) {
  if (!Number.isFinite(n)) return 1
  return Math.max(MIN, Math.min(MAX, n))
}

function load(): ControlSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<ControlSettings>
    return {
      pitch:
        typeof parsed.pitch === 'number'
          ? clampSens(parsed.pitch)
          : DEFAULTS.pitch,
      yaw:
        typeof parsed.yaw === 'number' ? clampSens(parsed.yaw) : DEFAULTS.yaw,
      roll:
        typeof parsed.roll === 'number' ? clampSens(parsed.roll) : DEFAULTS.roll,
      cursor:
        typeof parsed.cursor === 'number'
          ? clampSens(parsed.cursor)
          : DEFAULTS.cursor,
      invertPitch:
        typeof parsed.invertPitch === 'boolean'
          ? parsed.invertPitch
          : DEFAULTS.invertPitch,
      invertYaw:
        typeof parsed.invertYaw === 'boolean'
          ? parsed.invertYaw
          : DEFAULTS.invertYaw,
      invertRoll:
        typeof parsed.invertRoll === 'boolean'
          ? parsed.invertRoll
          : DEFAULTS.invertRoll,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

let settings: ControlSettings = load()

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Quota / private mode — ignore
  }
}

function notify() {
  for (const listener of listeners) listener(settings)
}

export function getControlSettings(): ControlSettings {
  return { ...settings }
}

export function setPitchSensitivity(value: number) {
  const next = clampSens(value)
  if (next === settings.pitch) return
  settings = { ...settings, pitch: next }
  persist()
  notify()
}

export function setYawSensitivity(value: number) {
  const next = clampSens(value)
  if (next === settings.yaw) return
  settings = { ...settings, yaw: next }
  persist()
  notify()
}

export function setRollSensitivity(value: number) {
  const next = clampSens(value)
  if (next === settings.roll) return
  settings = { ...settings, roll: next }
  persist()
  notify()
}

export function setCursorSensitivity(value: number) {
  const next = clampSens(value)
  if (next === settings.cursor) return
  settings = { ...settings, cursor: next }
  persist()
  notify()
}

export function setInvertPitch(value: boolean) {
  if (value === settings.invertPitch) return
  settings = { ...settings, invertPitch: value }
  persist()
  notify()
}

export function setInvertYaw(value: boolean) {
  if (value === settings.invertYaw) return
  settings = { ...settings, invertYaw: value }
  persist()
  notify()
}

export function setInvertRoll(value: boolean) {
  if (value === settings.invertRoll) return
  settings = { ...settings, invertRoll: value }
  persist()
  notify()
}

export function subscribeControlSettings(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const CONTROL_SENS_MIN = MIN
export const CONTROL_SENS_MAX = MAX
