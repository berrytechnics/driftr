import {
  GAS_ORBIT,
  MERCURY_ORBIT,
  MOON_NAMES,
  OUTER_DWARF_ECC,
  OUTER_DWARF_ORBIT,
  PLANET_NAMES,
  SUN_SIZE,
} from '@/game/systemConfig'

export const NYX_WHISPER_TEXT = 'Night watches.'
export const GHOST_BERTH_LABEL = 'NYX TRANSIT · DECOMMISSIONED'
export const GHOST_BERTH_PLAQUE =
  'DECOMM. ORD. · AFTER FIRST RETURN · NO CREW'
export const NIGHT_SHARD_STATUS_LABEL = 'Night shards'
export const ASH_FOR_SOL_TEXT = 'Ash for Sol.'
export const ASH_FOR_SOL_DUAL_TEXT = 'Ash for Sol. Night for Nyx.'
export const NYX_DERELICT_TOAST = 'Nyx Transit — signal lost'
export const NYX_COM_GHOST =
  '…solar margin breached… cold… we can still see the belt lights…'
export const NYX_COMLOG_LABEL = 'COMLOG · NYX-1 · [CORRUPT]'
export const NYX_COMLOG_BODY =
  'Return docking: zero life signs. Facility sealed.'
export const NYX_HYPERION_RUMOR = 'Outer dockmaster kept Kronos time.'
export const NYX_TRANSIT_MAP_LABEL = 'NYX TRANSIT'
export const NYX_BEACON_LABEL = 'NT-0'

/** Nyx apoapsis distance from Sol center (world units). */
export const NYX_APOAPSIS =
  OUTER_DWARF_ORBIT * (1 + OUTER_DWARF_ECC)

export const NYX_PERIAPSIS =
  OUTER_DWARF_ORBIT * (1 - OUTER_DWARF_ECC)

/** Hue-shifted charcoal so the omen rock reads “wrong” next to ore / ice / alloy. */
export const NIGHT_ROCK_HEX = '#3a3548'

export const NIGHT_SHARD_COLOR = '#6a5a88'

/** Chance a dock cycle reveals the decommissioned Nyx pad. */
export const GHOST_BERTH_CHANCE = 0.22

/** Extra chance after the Nyx whisper has been heard. */
export const GHOST_BERTH_CHANCE_AFTER_WHISPER = 0.55

/** Seconds before the same approach can whisper again. */
export const NYX_WHISPER_COOLDOWN_S = 120

/** How long cruise-into-night keeps Nyx’s orbit lit on the map. */
export const NYX_ORBIT_GLOW_S = 5

/** Derelict ghost visible near this fraction of apoapsis. */
export const NYX_DERELICT_APO_FRAC = 0.9

/** Player must be within this of Nyx to see the derelict. */
export const NYX_DERELICT_PLAYER_RANGE = 220

/** Cold beacon NT-0 */
export const NYX_BEACON_COOLDOWN_S = 90
export const NYX_BEACON_LIFE_S = 4
export const NYX_BEACON_NEAR_RANGE = 180
/** Approaching the ping drains its life faster. */
export const NYX_BEACON_APPROACH_RANGE = 90

/** Dock COM ghost intercept chance when eligible. */
export const NYX_COM_GHOST_CHANCE = 0.25

/** Friendly linger near a peacekeeper before the salute flash. */
export const PATROL_SALUTE_HOLD_S = 2.2
export const PATROL_SALUTE_RANGE = 90
/** Soft formation radius — patrol eases toward your pace inside this. */
export const PATROL_SALUTE_MATCH_RANGE = 140
/** Brief exits from range still count toward the linger. */
export const PATROL_SALUTE_GRACE_S = 1.1
export const PATROL_SALUTE_COOLDOWN_S = 48
export const PATROL_SALUTE_FLASH_S = 0.9

/**
 * Telemetry `altitude` is distance-from-sun minus sun radius.
 * Outer half of Nyx’s ellipse (past semi-major) — not strict apoapsis,
 * so approaches during her long outer arc still count.
 */
export function isNyxWhisperAltitude(altitude: number) {
  return altitude + SUN_SIZE >= OUTER_DWARF_ORBIT
}

/** Extra approach slack so the tiny dwarf still registers as near-body. */
export const NYX_NEAR_PAD = 95

/** Inside Hermes’ orbit — jettison becomes an offering, not bait. */
export function isAshForSolAltitude(altitude: number) {
  return altitude + SUN_SIZE < MERCURY_ORBIT
}

/** Past Kronos’ orbital distance — advanced thruster “cruise into night”. */
export function isPastKronos(sunDistance: number) {
  return sunDistance >= GAS_ORBIT
}

export function isNearNyx(nearBody: string | null) {
  return nearBody === PLANET_NAMES.outerDwarf
}

export function isNearHyperion(nearBody: string | null) {
  return nearBody === MOON_NAMES.kronosC
}

export function isNyxMapBody(name: string) {
  return name === PLANET_NAMES.outerDwarf
}

export function isNyxNearApoapsis(sunDistance: number) {
  return sunDistance >= NYX_APOAPSIS * NYX_DERELICT_APO_FRAC
}

export function rollGhostBerth(nyxWhisperHeard: boolean) {
  const p = nyxWhisperHeard
    ? GHOST_BERTH_CHANCE_AFTER_WHISPER
    : GHOST_BERTH_CHANCE
  return Math.random() < p
}

export function rollNyxComGhost() {
  return Math.random() < NYX_COM_GHOST_CHANCE
}
