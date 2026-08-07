import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/** @type {{ client: import('steamworks.js').Client | null, appId: number }} */
const state = {
  client: null,
  appId: 480,
}

/**
 * @returns {{ ok: boolean, appId: number, error?: string }}
 */
export function initSteam() {
  try {
    const steamworks = require('steamworks.js')
    // Spacewar (480) until a real Partner App ID is set in steam_appid.txt
    const client = steamworks.init()
    state.client = client
    state.appId = Number(client.utils.getAppId()) || 480
    console.log(`[steam] initialized appId=${state.appId}`)
    return { ok: true, appId: state.appId }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`[steam] init skipped: ${message}`)
    state.client = null
    return { ok: false, appId: state.appId, error: message }
  }
}

export function enableSteamOverlay() {
  try {
    const steamworks = require('steamworks.js')
    steamworks.electronEnableSteamOverlay()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`[steam] overlay enable skipped: ${message}`)
  }
}

export function isSteamAvailable() {
  return state.client != null
}

export function getSteamAppId() {
  return state.appId
}

/**
 * @param {string} achievementId
 * @returns {boolean}
 */
export function unlockAchievement(achievementId) {
  if (!state.client) return false
  try {
    const ok = state.client.achievement.activate(achievementId)
    if (ok) state.client.stats.store()
    return ok
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`[steam] unlockAchievement(${achievementId}): ${message}`)
    return false
  }
}
