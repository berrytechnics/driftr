import { useEffect, useState } from 'react'
import {
  getGraphicsSettings,
  subscribeGraphicsSettings,
  type GraphicsSettings,
} from '@/game/graphicsSettings'

/** Live graphics preset — use inside Canvas / world components. */
export function useGraphicsSettings(): GraphicsSettings {
  const [settings, setSettings] = useState(getGraphicsSettings)
  useEffect(() => subscribeGraphicsSettings(setSettings), [])
  return settings
}
