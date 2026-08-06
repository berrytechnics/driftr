import {
  GAS_ORBIT,
  MERCURY_ORBIT,
  MOON_NAMES,
  OUTER_DWARF_ECC,
  OUTER_DWARF_ORBIT,
  PLANET_NAMES,
  STATION_NAMES,
  SUN_SIZE,
} from '@/game/systemConfig'

export const NYX_WHISPER_TEXT = 'Night watches.'
export const GHOST_BERTH_LABEL = 'NYX TRANSIT · DECOMMISSIONED'
export const GHOST_BERTH_PLAQUE =
  'DECOMM. ORD. · AFTER FIRST RETURN · NO CREW'
export const NIGHT_SHARD_STATUS_LABEL = 'Night shards'
export const ASH_FOR_SOL_TEXT = 'Ash for Sol.'
export const ASH_FOR_SOL_DUAL_TEXT = 'Ash for Sol. Night for Nyx.'
export const NYX_DERELICT_TOAST =
  'Ghost berth. Wrong dust in the belt still answers.'
export const NYX_COM_GHOST =
  '…solar margin breached… cold… we can still see the belt lights…'
export const NYX_COMLOG_LABEL = 'COMLOG · NYX-1 · [CORRUPT]'
export const NYX_COMLOG_BODY =
  'Return docking: zero life signs. Facility sealed.'
/** Hyperion → apo pad on Nyx’s path (not on the dwarf). */
export const NYX_HYPERION_RUMOR =
  'Far turn of her path — apoapsis. Ghost Transit waits empty.'
/** Map marker after Hyperion clue. */
export const NYX_APO_MAP_LABEL = 'APO · TRANSIT'
/** Near Nyx body — enable Ask / confirm Transit isn’t with her. */
export const NYX_EMPTY_TOAST = 'No Transit on Nyx. Ask the docks.'
export const NYX_TRANSIT_MAP_LABEL = 'NYX TRANSIT'
export const NYX_BEACON_LABEL = 'NT-0'
/** Consumed when hard-docking Nyx Transit. */
export const NYX_TRANSIT_DOCK_TOAST = 'Dust takes the berth.'
export const NYX_DUST_KEY_TOAST = 'Nyx dust — berth key'

export const NYX_ASK_LABEL = 'Ask about Nyx'
/** Thalassa / Ares / Nyx Transit — no lead, just dismissal. */
export const NYX_ASK_DEFLECT =
  'No record on that channel. Outer-system noise. Nothing for this desk.'
export const NYX_ASK_DEFLECT_THALASSA =
  'Thalassa boards show clean lanes only. Nyx isn’t on our slate.'
export const NYX_ASK_DEFLECT_ARES =
  'Ares pads don’t keep Transit ghosts. File’s empty.'
export const NYX_ASK_DEFLECT_NYX =
  '…silence on the local band. Whoever ran this pad isn’t answering.'
export const NYX_ASK_KRONOS_LEAD =
  'Old dockmaster kept a side clock on Hyperion. Start there.'
export const NYX_ASK_KRONOS_RECAP =
  'I told you — Hyperion. Side clock. That is all I will give.'
export const NYX_ASK_KRONOS_POST_WHISPER =
  'You’ve been out there. Still — ask Hyperion. Old dockmaster kept time on that moon.'

export type NyxAskReply = {
  text: string
  /** True when this reply grants the Hyperion lead (first Kronos ask). */
  givesLead: boolean
}

/** ATC reply for “Ask about Nyx” — askable everywhere; only Kronos knows anything. */
export function replyForNyxAsk(
  stationName: string,
  hyperionLead: boolean,
  whisperHeard = false,
): NyxAskReply {
  if (stationName === STATION_NAMES.kronos) {
    if (hyperionLead) {
      return { text: NYX_ASK_KRONOS_RECAP, givesLead: false }
    }
    return {
      text: whisperHeard ? NYX_ASK_KRONOS_POST_WHISPER : NYX_ASK_KRONOS_LEAD,
      givesLead: true,
    }
  }
  if (stationName === STATION_NAMES.thalassa) {
    return { text: NYX_ASK_DEFLECT_THALASSA, givesLead: false }
  }
  if (stationName === STATION_NAMES.ares) {
    return { text: NYX_ASK_DEFLECT_ARES, givesLead: false }
  }
  if (stationName === STATION_NAMES.nyx) {
    return { text: NYX_ASK_DEFLECT_NYX, givesLead: false }
  }
  return { text: NYX_ASK_DEFLECT, givesLead: false }
}

/** Pause-menu journal line — one recovered signal / lead. */
export type NyxJournalEntry = {
  id: string
  title: string
  body: string
}

export type NyxJournalFlags = {
  nightShards: number
  nyxTopicUnlocked: boolean
  nyxHyperionLead: boolean
  nyxHyperionRumorHeard: boolean
  nyxFoundEmpty: boolean
  nyxWhisperHeard: boolean
  nyxComlogUnlocked: boolean
  nyxCorridorUnlocked: boolean
  nyxDerelictSeen: boolean
  nyxDualAshDone: boolean
}

/** Build ordered journal entries from persisted lore progress. */
export function buildNyxJournal(flags: NyxJournalFlags): NyxJournalEntry[] {
  const entries: NyxJournalEntry[] = []

  if (flags.nightShards > 0) {
    entries.push({
      id: 'dust',
      title: 'Belt omen',
      body: `Nyx dust · ${flags.nightShards} shard${flags.nightShards === 1 ? '' : 's'} — keys the apo ghost pad (spent on hard-dock).`,
    })
  }

  if (flags.nyxCorridorUnlocked && !flags.nyxWhisperHeard) {
    entries.push({
      id: 'corridor-early',
      title: 'Struck pad',
      body: `Decommissioned berth — ${GHOST_BERTH_LABEL}. Map marks a faint ${NYX_TRANSIT_MAP_LABEL} path.`,
    })
  }

  if (flags.nyxHyperionLead) {
    entries.push({
      id: 'kronos-atc',
      title: 'Kronos ATC',
      body: flags.nyxWhisperHeard || flags.nyxFoundEmpty
        ? NYX_ASK_KRONOS_POST_WHISPER
        : NYX_ASK_KRONOS_LEAD,
    })
  }

  if (flags.nyxFoundEmpty) {
    entries.push({
      id: 'empty',
      title: 'Nyx herself',
      body: NYX_EMPTY_TOAST,
    })
  }

  if (flags.nyxHyperionRumorHeard) {
    entries.push({
      id: 'hyperion',
      title: 'Hyperion',
      body: NYX_HYPERION_RUMOR,
    })
  }

  if (flags.nyxWhisperHeard) {
    entries.push({
      id: 'whisper',
      title: 'Outer arc',
      body: NYX_WHISPER_TEXT,
    })
  }

  if (flags.nyxComlogUnlocked) {
    entries.push({
      id: 'comlog',
      title: NYX_COMLOG_LABEL,
      body: NYX_COMLOG_BODY,
    })
  }

  if (flags.nyxCorridorUnlocked && flags.nyxWhisperHeard) {
    entries.push({
      id: 'corridor',
      title: 'Map corridor',
      body: `${NYX_TRANSIT_MAP_LABEL} ellipse unlocked on the system map.`,
    })
  }

  if (flags.nyxDerelictSeen) {
    entries.push({
      id: 'derelict',
      title: 'Ghost station',
      body: NYX_DERELICT_TOAST,
    })
  }

  if (flags.nyxDualAshDone) {
    entries.push({
      id: 'ash',
      title: 'Ash for Sol',
      body: ASH_FOR_SOL_DUAL_TEXT,
    })
  }

  // Topic unlocked with no specific fragment yet (e.g. COM intercept only)
  if (flags.nyxTopicUnlocked && entries.length === 0) {
    entries.push({
      id: 'static',
      title: 'COM intercept',
      body: NYX_COM_GHOST,
    })
  }

  return entries
}

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

/** Player must be within this of the apo pad to see the derelict. */
export const NYX_DERELICT_PLAYER_RANGE = 420

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
