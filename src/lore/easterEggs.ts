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

/** Outer-arc intercept — short enough for a toast, clear as a phrase. */
export const NYX_WHISPER_TEXT = 'Dead band whisper: …night watches…'
export const GHOST_BERTH_LABEL = 'NYX TRANSIT · DECOMMISSIONED'
export const GHOST_BERTH_PLAQUE =
  'DECOMM. ORD. · AFTER FIRST RETURN · NO CREW'
/** Dock MFD copy when hard-docked at the apo ghost pad. */
export const NYX_OFFLINE_BLURB = 'Station is offline.'
export const NYX_OFFLINE_STATUS = '○ COLD BERTH'
export const NYX_OFFLINE_DESK_TITLE = 'STATION SYSTEMS'
export const NYX_OFFLINE_DESK_NOTE =
  'Primary bus dead. Auxiliary rails cold. Cargo lifts locked. Repair bay sealed. Outfitters offline since the last return.'
/** NYX Transit berth chip — damaged pad, not the decommission plaque. */
export const NYX_BERTH_OFFLINE_LABEL = 'OFFLINE'
export const NIGHT_SHARD_STATUS_LABEL = 'Nyx dust'
/** Jettison inside Hermes’ orbit — haul burns instead of floating as bait. */
export const ASH_FOR_SOL_TEXT = 'Sol takes the haul as ash.'
export const ASH_FOR_SOL_DUAL_TEXT =
  'Sol takes the haul as ash. Somewhere dark, Nyx takes notice.'
export const NYX_DERELICT_TOAST =
  'Ghost Transit pad. Strange belt dust still wakes it.'
/** Alternate sky — dockable cold tug. */
export const ALT_TUG_TOAST =
  'Hull cold. Registry scorched. Berth clamps still answer.'
export const ALT_TUG_OFFLINE_BLURB = 'No crew. No ATC. Clamps only.'
export const ALT_TUG_OFFLINE_STATUS = '○ DERELICT'
export const ALT_TUG_OFFLINE_DESK_TITLE = 'CREW LOG · RECOVERED'
export const ALT_TUG_OFFLINE_DESK_NOTE =
  'Main bus silent. Holds sealed with Sol ore still latched. Nav clocks dead. The tug will take your clamps — nothing else wakes.'
export const ALT_TUG_BERTH_LABEL = 'DERELICT TUG · UNREGISTERED'
export const ALT_TUG_FOOTNOTE =
  'They came for ore. The clamps still work. No one left to release them.'
/** Recovered flight recorder — haulage tug that slipped into Vesper mid-scoop. */
export type AltTugLogEntry = { stamp: string; body: string }
export const ALT_TUG_CREW_LOG: AltTugLogEntry[] = [
  {
    stamp: 'SOL · DAY 0',
    body: 'Cleared Thalassa Station empty. Contract: rock ore to Ares pad. Crew of three — Chen, Reyes, Mott. Clamps honest. Chart says home.',
  },
  {
    stamp: 'BELT · SCOOP 12',
    body: 'Grabs clean. Grades reading ordinary rock ore. One bag came up charcoal-dark, wrong tint — Mott tossed it as belt scrap. Pad quiet. Keep filling.',
  },
  {
    stamp: 'BELT · SCOOP 31',
    body: 'Stars twitched on the overlay. Nav checksum spat and cleared. Chen said finish the bag before we call it. We finished the bag.',
  },
  {
    stamp: '— · UNSYNC',
    body: 'Wrong light. The star is indigo and small. Worlds on the scope have no board names. Holds half-full of Sol ore. We did not jump. Nobody ordered a burn. We were still on the scoop when the sky changed.',
  },
  {
    stamp: 'COMMS · LOOP',
    body: 'Hailing Thalassa. Hailing Ares. Hailing Kronos ATC. Carrier empty on every band. Solar margin breached — cold — we can still see belt lights that aren’t ours. Reyes keeps the mike open overnight. Nothing answers with words.',
  },
  {
    stamp: 'SURVEY · DAY 9?',
    body: 'Tried the ash dwarf the old maps called Nyx. No Transit. Station on her flank ignores our codes — live lights, dead ears. Outer ice body won’t chart either. No exit marked. No beacon. We are inventorying every burn we have left.',
  },
  {
    stamp: 'RING · CLOSE',
    body: 'Found a tilted lattice past the dwarf — hollow throat, unfinished spars, tick marks in a survey hand. Chen said it looked like a pad raised to meet something. We drifted the throat twice. Threaded the gap. Hailed on every band we have. Mott scraped a strut for sample — same charcoal tint as the bad bag. No clamp. No Transit signature. No door. Just empty ring and the wrong sun through it.',
  },
  {
    stamp: 'GALLEY · RATION',
    body: 'Hydroponics never woke. Eating ore-binder paste and the last of the freeze packs. Mott stopped speaking except to count days on the bulkhead. The counts do not agree. Chen keeps looking back at the ring on the overlay like it owes us an answer.',
  },
  {
    stamp: 'RECORDER · CORRUPT',
    body: 'Reyes cut the log twice. Restored from buffer. He says someone is whispering on a dead band — night watches — and we must not reply. Chen replied anyway. Static only. Or not only. Mott will not leave the hold. Says the charcoal ore knows the way home if we listen. Same ore as the ring scrap.',
  },
  {
    stamp: 'LAST',
    body: 'Holds sealed. Clamps set. If you find this hull: we came for ore. We searched the ash dwarf, the live-dead station, the empty ring. We searched every dark for a door back to Sol. We did not find one. Rations gone. Reyes is singing to the mike. Chen — I am so—',
  },
]
/** Pause / codex digest of the recovered recorder. */
export const ALT_TUG_CREW_LOG_DIGEST =
  'Recovered crew log: Sol ore haul slipped mid-scoop into the wrong sky. Hailed every desk. Threaded an empty survey ring past the ash dwarf — no Transit, no answer. Found no exit. Starved, still calling on a dead carrier.'
/** Alternate sky — Cassini-class probe husk (visual only). */
export const ALT_CASSINI_TOAST =
  'Old probe husk. No lock. No reply.'
export const ALT_CASSINI_MAP_LABEL = 'Probe husk'
/** Alternate sky — misplanted Transit counterpart ring. */
export const ALT_GATE_TOAST =
  'Survey lattice. Ring empty. No Transit signature — the pad was never meant for this sky.'
export const ALT_GATE_MAP_LABEL = 'Unknown structure'
/** Chart label after the player has flown the powered throat. */
export const ALT_GATE_KNOWN_MAP_LABEL = 'Space Gate'
export function altGateMapLabel(traveled: boolean) {
  return traveled ? ALT_GATE_KNOWN_MAP_LABEL : ALT_GATE_MAP_LABEL
}
export const ALT_GATE_JOURNAL_TITLE = 'Unknown structure'
export const ALT_GATE_JOURNAL_BODY =
  'Tilted survey ring past the ashen dwarf. Hollow throat, unfinished struts, tick marks in a dead hand. Nothing answers. Looks like the Transit pad that was raised to meet Nyx — dropped here when the ellipse lied.'
/** Outer Vesper collector rail — chart label only (no toast yet). */
export const ALT_DYSON_MAP_LABEL = 'satellite ring'
/** Cost in Nyx dust to awaken a dormant siphon node. */
export const SIPHON_REPAIR_SHARD_COST = 5
export const SIPHON_REPAIR_TOAST =
  'Node answers. Plates drink again — the lattice remembers light.'
export const SIPHON_RING_COMPLETE_TOAST =
  'Every siphon breathes. The empty gate finds a current.'
export const NYX_COM_GHOST =
  '…solar margin breached… cold… we can still see the belt lights…'
export const NYX_COMLOG_LABEL = 'COMLOG · NYX-1 · [CORRUPT]'
export const NYX_COMLOG_BODY =
  'Return docking: zero life signs. Facility sealed.'
/** Hyperion → apo pad on Nyx’s path (not on the dwarf). */
export const NYX_HYPERION_RUMOR =
  'At Nyx’s farthest turn — apoapsis — an empty ghost Transit still waits.'
/** Map marker after Hyperion clue. */
export const NYX_APO_MAP_LABEL = 'APO · TRANSIT'
/** Near Nyx body — enable Ask / confirm Transit isn’t with her. */
export const NYX_EMPTY_TOAST = 'No Transit on Nyx. Ask the docks.'
export const NYX_TRANSIT_MAP_LABEL = 'NYX TRANSIT'
export const NYX_BEACON_LABEL = 'NT-0'
/** First pickup of the omen rock — before you know what it opens. */
export const NYX_DUST_PICKUP_TOAST = 'Nyx dust — charcoal tint, not ore.'
/** Consumed when hard-docking Nyx Transit. */
export const NYX_TRANSIT_DOCK_TOAST = 'Nyx dust wakes the cold berth.'
/** Pickup toast once you’ve seen the ghost pad. */
export const NYX_DUST_KEY_TOAST = 'Nyx dust — keys the Transit pads'
/** Fired when docking either Nyx pad with dust slips you into the other sky. */
export const NYX_ALT_TRANSPORT_TOAST = 'The berth slips you into another sky.'
/** Fired when flying a powered gate throat into the matching ring. */
export const GATE_PORTAL_TRANSPORT_TOAST =
  'The throat takes you. Same ring — dead star’s hollow.'

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
  'Old dockmaster watched Nyx’s timing from Hyperion. Start there.'
export const NYX_ASK_KRONOS_RECAP =
  'I told you — Hyperion. Private watch on that moon. That is all I will give.'
export const NYX_ASK_KRONOS_POST_WHISPER =
  'You’ve been out there. Still — ask Hyperion. Old dockmaster kept Nyx’s clock on that moon.'
/** After the apo ghost pad — Kronos clarifies the belt omen, not what it opens. */
export const NYX_ASK_KRONOS_POST_DERELICT =
  'Wrong dust they meant: charcoal rock in Thalassa’s belt — sick tint, not ore, ice, or alloy. Said to wake the old Transit pads. This desk never logged how.'
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
  derelictSeen = false,
): NyxAskReply {
  if (stationName === STATION_NAMES.kronos) {
    if (hyperionLead) {
      return {
        text: derelictSeen
          ? NYX_ASK_KRONOS_POST_DERELICT
          : NYX_ASK_KRONOS_RECAP,
        givesLead: false,
      }
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
  nyxTugSeen?: boolean
  nyxCassiniSeen?: boolean
  nyxGateSeen?: boolean
}

/** Build ordered journal entries from persisted lore progress. */
export function buildNyxJournal(flags: NyxJournalFlags): NyxJournalEntry[] {
  const entries: NyxJournalEntry[] = []

  if (flags.nightShards > 0) {
    entries.push({
      id: 'dust',
      title: 'Belt omen',
      body: `Nyx dust · ${flags.nightShards} shard${flags.nightShards === 1 ? '' : 's'}. Keys Nyx Transit pads; spent when you cross between systems.`,
    })
  }

  if (flags.nyxCorridorUnlocked && !flags.nyxWhisperHeard) {
    entries.push({
      id: 'corridor-early',
      title: 'Struck pad',
      body: `Decommissioned berth — ${GHOST_BERTH_LABEL}. Map marks a faint ${NYX_TRANSIT_MAP_LABEL} corridor.`,
    })
  }

  if (flags.nyxHyperionLead) {
    entries.push({
      id: 'kronos-atc',
      title: 'Kronos ATC',
      body: flags.nyxDerelictSeen
        ? NYX_ASK_KRONOS_POST_DERELICT
        : flags.nyxWhisperHeard || flags.nyxFoundEmpty
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
      body: `${NYX_TRANSIT_MAP_LABEL} corridor unlocked on the system map.`,
    })
  }

  if (flags.nyxDerelictSeen) {
    entries.push({
      id: 'derelict',
      title: 'Ghost station',
      body: NYX_DERELICT_TOAST,
    })
  }

  if (flags.nyxTugSeen) {
    entries.push({
      id: 'alt-tug',
      title: 'Derelict tug',
      body: ALT_TUG_TOAST,
    })
    entries.push({
      id: 'alt-tug-log',
      title: ALT_TUG_OFFLINE_DESK_TITLE,
      body: ALT_TUG_CREW_LOG_DIGEST,
    })
  }

  if (flags.nyxCassiniSeen) {
    entries.push({
      id: 'alt-cassini',
      title: 'Probe husk',
      body: ALT_CASSINI_TOAST,
    })
  }

  if (flags.nyxGateSeen) {
    entries.push({
      id: 'alt-gate',
      title: ALT_GATE_JOURNAL_TITLE,
      body: ALT_GATE_JOURNAL_BODY,
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

/** Sol cheat / map — night omen rock ping label (click → flight nav marker). */
export const NIGHT_SHARD_MAP_LABEL = 'SHARD · NYX DUST'

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
