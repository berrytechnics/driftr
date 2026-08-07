const STORAGE_KEY = '3js-graphics-v1'

export type GraphicsQuality = 'low' | 'medium' | 'high'

export type GraphicsSettings = {
  quality: GraphicsQuality
  /** Cap for device pixel ratio */
  maxDpr: number
  /** Multiplier on Leva bloom intensity; 0 disables the composer */
  bloomScale: number
  /** Max anisotropy on planet / moon albedo maps */
  anisotropy: number
}

type Listener = (settings: GraphicsSettings) => void

const PRESETS: Record<GraphicsQuality, Omit<GraphicsSettings, 'quality'>> = {
  low: { maxDpr: 1, bloomScale: 0, anisotropy: 1 },
  medium: { maxDpr: 1.25, bloomScale: 0.7, anisotropy: 4 },
  high: { maxDpr: 1.5, bloomScale: 1, anisotropy: 8 },
}

const DEFAULT_QUALITY: GraphicsQuality = 'medium'

const listeners = new Set<Listener>()

function isQuality(v: unknown): v is GraphicsQuality {
  return v === 'low' || v === 'medium' || v === 'high'
}

function fromQuality(quality: GraphicsQuality): GraphicsSettings {
  return { quality, ...PRESETS[quality] }
}

function load(): GraphicsSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fromQuality(DEFAULT_QUALITY)
    const parsed = JSON.parse(raw) as { quality?: unknown }
    if (isQuality(parsed.quality)) return fromQuality(parsed.quality)
    return fromQuality(DEFAULT_QUALITY)
  } catch {
    return fromQuality(DEFAULT_QUALITY)
  }
}

let settings: GraphicsSettings = load()

function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ quality: settings.quality }),
    )
  } catch {
    // Quota / private mode — ignore
  }
}

function notify() {
  for (const listener of listeners) listener(settings)
}

export function getGraphicsSettings(): GraphicsSettings {
  return { ...settings }
}

export function setGraphicsQuality(quality: GraphicsQuality) {
  if (quality === settings.quality) return
  settings = fromQuality(quality)
  persist()
  notify()
}

export function subscribeGraphicsSettings(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
