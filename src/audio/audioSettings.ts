const STORAGE_KEY = '3js-audio-v1'

export type AudioSettings = {
  music: number
  sfx: number
}

type Listener = (settings: AudioSettings) => void

const DEFAULTS: AudioSettings = {
  music: 0.4,
  sfx: 0.75,
}

const listeners = new Set<Listener>()

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function load(): AudioSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<AudioSettings>
    return {
      music:
        typeof parsed.music === 'number' ? clamp01(parsed.music) : DEFAULTS.music,
      sfx: typeof parsed.sfx === 'number' ? clamp01(parsed.sfx) : DEFAULTS.sfx,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

let settings: AudioSettings = load()

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

export function getAudioSettings(): AudioSettings {
  return { ...settings }
}

export function getMusicVolume() {
  return settings.music
}

export function getSfxVolume() {
  return settings.sfx
}

export function setMusicVolume(volume: number) {
  const next = clamp01(volume)
  if (next === settings.music) return
  settings = { ...settings, music: next }
  persist()
  notify()
}

export function setSfxVolume(volume: number) {
  const next = clamp01(volume)
  if (next === settings.sfx) return
  settings = { ...settings, sfx: next }
  persist()
  notify()
}

export function subscribeAudioSettings(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
