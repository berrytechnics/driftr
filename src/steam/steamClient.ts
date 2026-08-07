/**
 * Optional Steamworks bridge exposed by Electron preload.
 * In the browser / web deploy this is always a no-op.
 */

export type SteamBridge = {
  isAvailable: () => Promise<boolean>
  getAppId: () => Promise<number>
  unlockAchievement: (achievementId: string) => Promise<boolean>
}

declare global {
  interface Window {
    steam?: SteamBridge
  }
}

const noopBridge: SteamBridge = {
  isAvailable: async () => false,
  getAppId: async () => 0,
  unlockAchievement: async () => false,
}

function getBridge(): SteamBridge {
  return typeof window !== 'undefined' && window.steam
    ? window.steam
    : noopBridge
}

/** True when running inside the Electron shell with Steamworks initialized. */
export async function isSteamAvailable(): Promise<boolean> {
  return getBridge().isAvailable()
}

export async function getSteamAppId(): Promise<number> {
  return getBridge().getAppId()
}

/**
 * Unlock a Steam achievement by API name.
 * Partner dashboard achievement definitions required for a real App ID.
 */
export async function unlockAchievement(
  achievementId: string,
): Promise<boolean> {
  return getBridge().unlockAchievement(achievementId)
}
