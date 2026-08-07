import { STATION_NAMES } from '@/game/systemConfig'

/** Orbiting remnant keys used in GateVoidSpace / persist. */
export type VoidRemnantId =
  | 'freeport'
  | 'greenpeace'
  | 'orbitalComplex'
  | 'miningOutpost'

export type VoidLogEntry = { stamp: string; body: string }
export type VoidStatLine = { label: string; value: string }

export type VoidRemnantProfile = {
  id: VoidRemnantId
  /** Hard-dock / MFD registry name (revealed designation). */
  name: string
  /** Pre-discovery chart scribble. */
  chartLabel: string
  platformLabel: string
  toast: string
  blurb: string
  status: string
  deskTitle: string
  deskNote: string
  footnote: string
  stats: VoidStatLine[]
  logs: VoidLogEntry[]
  journalSightTitle: string
  journalSightBody: string
  journalDockTitle: string
  journalDockBody: string
}

/**
 * Sibling pads on the cold MFD — one badge each, Sol-style status (all COLD).
 * Ghost Nyx is a different system and is not listed here.
 */
export const VOID_SYSTEM_BADGES: { id: VoidRemnantId; label: string }[] = [
  { id: 'freeport', label: 'FAIRHARBOR' },
  { id: 'greenpeace', label: 'CRADLE WARD' },
  { id: 'orbitalComplex', label: 'ARCH VAULT' },
  { id: 'miningOutpost', label: 'SIPHON REACH' },
]

/**
 * Ancient builders who raised the Cinder gate — designations recovered from
 * cold MFDs. Chart stays vague until the player hard-docks once.
 */
export const VOID_REMNANT_PROFILES: Record<VoidRemnantId, VoidRemnantProfile> = {
  freeport: {
    id: 'freeport',
    name: STATION_NAMES.voidFreeport,
    chartLabel: 'Faint return',
    platformLabel: 'REMNANT HUB',
    toast: 'Cold clamps answer. Hub boards long dead.',
    blurb: 'No ATC. Manifests frozen mid-count. Clamps only.',
    status: '○ OFFLINE',
    deskTitle: 'CARGO OPS · RECOVERED',
    deskNote:
      'Tithe rails locked. Bond vaults sealed with seals older than Sol chalk. The pad still takes your dock — nothing else wakes.',
    footnote:
      'Late burn scratched into the bulkhead: COLONY HAUL · OVERDUE · REROUTE GATE.',
    stats: [
      { label: 'TRAFFIC QUEUE', value: '0 / 0' },
      { label: 'BOND VAULT', value: 'SEALED' },
      { label: 'TITHE RAIL', value: 'COLD' },
      { label: 'COLONY ETA', value: '— OVERDUE —' },
      { label: 'RESERVE FUEL', value: 'CRITICAL' },
    ],
    logs: [
      {
        stamp: 'OPS · PRE-FALL',
        body: 'Colony haul inbound on autopilot through the finished gate. Fairharbor to stage the ice cradles, then feed Siphon Reach and Cradle Ward. Charts already name the violet destination — we still call this place home.',
      },
      {
        stamp: 'OPS · AFTERLIGHT',
        body: 'Star died before the haul cleared the throat. Gate frames dumped static. Colony ship limped in on fumes — cradles full, no burning star left to siphon, no working door home.',
      },
      {
        stamp: 'OPS · LAST ORDER',
        body: 'Quartermaster marks the final shard for Arch Vault. Not for warmth. For a second gate aimed at the indigo system. Someone has to begin again. Fairharbor stays dark until they do.',
      },
    ],
    journalSightTitle: 'Faint return',
    journalSightBody:
      'Cold logistics pad in the remnant. Clamps still answer; boards do not.',
    journalDockTitle: 'Fairharbor',
    journalDockBody:
      'Ancestor logistics hub. Manifests froze when the colony haul arrived late — fuel critical, star already ash. Last notes push their final shard into a second gate aimed at Vesper.',
  },
  greenpeace: {
    id: 'greenpeace',
    name: STATION_NAMES.voidGreenpeace,
    chartLabel: 'Cold berth',
    platformLabel: 'REMNANT HAB',
    toast: 'Habitat shell intact. Life bus answered with silence.',
    blurb: 'No crew. Cradles sealed. Life deck dark.',
    status: '○ OFFLINE',
    deskTitle: 'LIFE DECK · RECOVERED',
    deskNote:
      'Atmosphere held in a dead loop. Grow bays locked. Cradle galleries read occupied on paper and empty on every sensor that still boots.',
    footnote:
      'Gallery plaque: WE SLEPT FOR A WORLD THAT IS NOT THERE.',
    stats: [
      { label: 'CRADLE BERTHS', value: '12 840 · SEALED' },
      { label: 'ATMO LOOP', value: 'IDLE HOLD' },
      { label: 'GROW BAYS', value: 'DARK' },
      { label: 'WAKE AUTHORITY', value: 'ARCH VAULT' },
      { label: 'COLONIST ROLL', value: 'ICE · NO THAW' },
    ],
    logs: [
      {
        stamp: 'HAB · PREP',
        body: 'Ward spun up for the colony haul. Soil, seed banks, soft rooms. Instructions: thaw only after Fairharbor clears the berths and Siphon Reach reports a living light.',
      },
      {
        stamp: 'HAB · AFTERLIGHT',
        body: 'No living light. No berth clear. Galleries stay iced by standing order — better sleep than starvation under ash.',
      },
      {
        stamp: 'HAB · HAND-OFF',
        body: 'Life deck authority transferred to Arch Vault for the second-gate burn. Cradle Ward will not wake them here. If the indigo sky has soil, that is their morning.',
      },
    ],
    journalSightTitle: 'Cold berth',
    journalSightBody:
      'Quiet habitat shell in the remnant. Life bus silent; something vast still sealed inside.',
    journalDockTitle: 'Cradle Ward',
    journalDockBody:
      'Ancestor habitat. Galleries inventory a sleeping colony that never thawed — held for a world that died before they arrived. Wake authority passed to Arch Vault with the second gate.',
  },
  orbitalComplex: {
    id: 'orbitalComplex',
    name: STATION_NAMES.voidOrbital,
    chartLabel: 'Silent frame',
    platformLabel: 'REMNANT COMMAND',
    toast: 'Command frame cold. Pilot glass still holds a last heading.',
    blurb: 'No ATC. Command bus dead. Pilot glass remembered.',
    status: '○ OFFLINE',
    deskTitle: 'COMMAND LOG · RECOVERED',
    deskNote:
      'Primary bus silent. Survey clocks stuck on the star’s last good day. The pilot glass still points a burnt heading at an indigo sun.',
    footnote:
      'Last heading burned into glass: GATE-2 · AUTOPILOT · VESPER VECTOR.',
    stats: [
      { label: 'COMMAND BUS', value: 'DEAD' },
      { label: 'GATE-1 STATUS', value: 'FRAME · NO POWER' },
      { label: 'GATE-2 STATUS', value: 'LAUNCHED · LOST LINK' },
      { label: 'PILOT TARGET', value: 'INDIGO SYSTEM' },
      { label: 'CREW ROLL', value: '0 LIVE · SEEDSHIP ICE' },
    ],
    logs: [
      {
        stamp: 'CMD · PRE-FALL',
        body: 'Gate-1 complete. Shard siphon from the living star held the throat open. Colony ship cleared for autopilot arrival. Arch Vault to hand the system to the wake crews.',
      },
      {
        stamp: 'CMD · AFTERLIGHT',
        body: 'Supernova. Siphon starved. Gate-1 inert. Colony ship arrives with cradles and almost no fuel — a nation on ice for a star that is already ash.',
      },
      {
        stamp: 'CMD · LAST SHARD',
        body: 'Engineers take Fairharbor’s final shard. Raise Gate-2. Set pilot to the purple system charted beyond. Scientists stay behind only long enough to watch it take. After that — empty stations, a dead sun, and a sleeping haul we cannot thaw without light.',
      },
    ],
    journalSightTitle: 'Silent frame',
    journalSightBody:
      'Command lattice in the remnant. Cold, but the pilot glass still catches light wrong.',
    journalDockTitle: 'Arch Vault',
    journalDockBody:
      'Ancestor command. Logs close the story of Gate-1’s death and Gate-2’s departure toward Vesper — built with the last shard, aimed to begin again.',
  },
  miningOutpost: {
    id: 'miningOutpost',
    name: STATION_NAMES.voidMining,
    chartLabel: 'Hull echo',
    platformLabel: 'REMNANT SIPHON',
    toast: 'Draw spines cold. Residue reads like burnt night-glass.',
    blurb: 'No ore crews. Siphon well sealed. Clamps only.',
    status: '○ OFFLINE',
    deskTitle: 'SIPHON LOG · RECOVERED',
    deskNote:
      'Draw spines retracted. Intake letters warn of stellar shard flux — not rock. The well is empty because the star is.',
    footnote:
      'Stenciled on the well ring: NO STAR · NO CURRENT · NO GATE.',
    stats: [
      { label: 'DRAW SPINES', value: 'RETRACTED' },
      { label: 'SHARD FLUX', value: '0 · STAR ASH' },
      { label: 'ORE LINE', value: 'UNUSED' },
      { label: 'GATE FEED', value: 'CUT' },
      { label: 'RESERVE CELL', value: 'TRANSFERRED → ARCH' },
    ],
    logs: [
      {
        stamp: 'SIPHON · RISE',
        body: 'Reach planted before collapse. Mission: drink shard radiation from the living star and pipe it into Gate-1. Ore lines were always a cover story for outsiders who might arrive early.',
      },
      {
        stamp: 'SIPHON · PEAK',
        body: 'Gate-1 holds. Colonists left their origin weeks ago on ice. We keep the current honest until they wake under a sky that still burns.',
      },
      {
        stamp: 'SIPHON · CUT',
        body: 'Light ends. Flux drops to zero in a breath. Last charged cell to Arch Vault. Without a star there is no second chance here — only the hope that another sky still has a current.',
      },
    ],
    journalSightTitle: 'Hull echo',
    journalSightBody:
      'Siphon spines dark against the remnant. Whatever they drank is gone with the star.',
    journalDockTitle: 'Siphon Reach',
    journalDockBody:
      'Ancestor siphon well. Not ore — star shard flux to power Gate-1. When Cinder died the current died with it; the last cell went to Arch Vault for Gate-2.',
  },
}

const BY_NAME = new Map(
  Object.values(VOID_REMNANT_PROFILES).map((p) => [p.name, p] as const),
)

export function isVoidRemnantStation(name: string | undefined | null): boolean {
  return !!name && BY_NAME.has(name)
}

export function voidRemnantProfile(
  name: string | undefined | null,
): VoidRemnantProfile | null {
  if (!name) return null
  return BY_NAME.get(name) ?? null
}

export function voidRemnantById(id: VoidRemnantId): VoidRemnantProfile {
  return VOID_REMNANT_PROFILES[id]
}

/** Chart scribble until first hard-dock, then the recovered designation. */
export function voidRemnantMapLabel(
  id: VoidRemnantId,
  dockedOnce: boolean,
): string {
  const p = VOID_REMNANT_PROFILES[id]
  return dockedOnce ? p.name : p.chartLabel
}

export type VoidJournalFlags = {
  voidFreeportSeen?: boolean
  voidFreeportDocked?: boolean
  voidCradleSeen?: boolean
  voidCradleDocked?: boolean
  voidArchSeen?: boolean
  voidArchDocked?: boolean
  voidSiphonSeen?: boolean
  voidSiphonDocked?: boolean
}

const SIGHT_FLAG: Record<VoidRemnantId, keyof VoidJournalFlags> = {
  freeport: 'voidFreeportSeen',
  greenpeace: 'voidCradleSeen',
  orbitalComplex: 'voidArchSeen',
  miningOutpost: 'voidSiphonSeen',
}

const DOCK_FLAG: Record<VoidRemnantId, keyof VoidJournalFlags> = {
  freeport: 'voidFreeportDocked',
  greenpeace: 'voidCradleDocked',
  orbitalComplex: 'voidArchDocked',
  miningOutpost: 'voidSiphonDocked',
}

export function voidSightFlag(id: VoidRemnantId): keyof VoidJournalFlags {
  return SIGHT_FLAG[id]
}

export function voidDockFlag(id: VoidRemnantId): keyof VoidJournalFlags {
  return DOCK_FLAG[id]
}

export type VoidJournalEntry = { id: string; title: string; body: string }

/**
 * Surmise unlocked after enough cold pads are read — never stated as fact.
 * Explains the empty remnant; leaves Vesper’s silence unanswered.
 */
export const VOID_COLONY_SURMISE: VoidJournalEntry = {
  id: 'void-colony-surmise',
  title: 'Colony on ice',
  body: 'Reading across the remnant pads: they drank the living star to raise a gate, then sent a sleeping colony through it. The supernova beat the haul. They burned the last shard on a second gate aimed at Vesper and left the cradles sealed. That is why no one answers here. It does not say why Vesper answers no one either.',
}

/** Build COMLOG fragments from remnant sight / dock progress. */
export function buildVoidJournal(flags: VoidJournalFlags): VoidJournalEntry[] {
  const entries: VoidJournalEntry[] = []
  let dockedCount = 0

  for (const id of Object.keys(VOID_REMNANT_PROFILES) as VoidRemnantId[]) {
    const profile = VOID_REMNANT_PROFILES[id]
    const seen = !!flags[SIGHT_FLAG[id]]
    const docked = !!flags[DOCK_FLAG[id]]
    if (docked) {
      dockedCount += 1
      entries.push({
        id: `void-dock-${id}`,
        title: profile.journalDockTitle,
        body: profile.journalDockBody,
      })
    } else if (seen) {
      entries.push({
        id: `void-sight-${id}`,
        title: profile.journalSightTitle,
        body: profile.journalSightBody,
      })
    }
  }

  if (dockedCount >= 3) {
    entries.push(VOID_COLONY_SURMISE)
  }

  return entries
}

/**
 * Void-built expedition hull abandoned in Vesper after planting Gate-2 and the
 * automated siphon ring. Same cold MFD language as remnant pads — not Sol ATC.
 */
export type VesperExpeditionProfile = {
  name: string
  chartLabel: string
  platformLabel: string
  toast: string
  blurb: string
  status: string
  deskTitle: string
  deskNote: string
  footnote: string
  stats: VoidStatLine[]
  logs: VoidLogEntry[]
  badges: { id: string; label: string }[]
  journalSightTitle: string
  journalSightBody: string
  journalDockTitle: string
  journalDockBody: string
}

export const GATEWRIGHT_PROFILE: VesperExpeditionProfile = {
  name: STATION_NAMES.vesperGatewright,
  chartLabel: 'Foreign keel',
  platformLabel: 'EXPEDITION HULL',
  toast: 'Foreign registry. Clamps answer in an ancestor hand.',
  blurb: 'No Sol ATC. Expedition bus cold. Clamps only.',
  status: '○ EXPEDITION · COLD',
  deskTitle: 'EXPEDITION LOG · RECOVERED',
  deskNote:
    'Boards wake partial from a buffer older than Sol chalk. Clamps take a dock. No commerce desk answers. Registry tags point home to a dead star, not Thalassa.',
  footnote:
    'Last scratch on the galley plate: BOARDING TRANSPORT · RETURN COLONY · LEAVE HER TO RING.',
  stats: [
    { label: 'HOME SKY', value: 'CINDER · LOST LINK' },
    { label: 'MISSION', value: 'GATE-2 + SIPHON RING' },
    { label: 'RING NODES', value: 'AUTO · UNTESTED' },
    { label: 'CREW ROLL', value: '0 · TRANSPORT' },
    { label: 'SOL CODES', value: 'UNKNOWN' },
  ],
  badges: [
    { id: 'hull', label: 'GATEWRIGHT' },
    { id: 'gate', label: 'GATE-2 FRAME' },
    { id: 'siphon', label: 'SIPHON RING' },
    { id: 'colony', label: 'COLONY LINK' },
  ],
  logs: [
    {
      stamp: 'EXP · ARRIVAL',
      body: 'Indigo sky confirmed. Gatewright parked to raise the second throat Arch Vault piloted here on the last shard. Colony still iced behind us — we are the wake crew that begins again. Soft-spot the frame near the ashen dwarf and plant the automated siphon ring farther out where the light still has teeth.',
    },
    {
      stamp: 'EXP · RING RAISE',
      body: 'Satellites swinging on rails. Each node meant to drink shard flux without a living well crew — Siphon Reach’s answer to a sky that is not home. Design was never run under a live star before we left. First spin looks honest. Second spin chatters. Third throws a fault we do not have a spare for.',
    },
    {
      stamp: 'EXP · TROUBLE',
      body: 'Ring nodes misbehave when we load them. Draw spines stutter. Telemetry invents ghosts. We keep resetting because the gate will not hold without a current, and we have no second shipyard. Untested automatics — we knew. Knowing does not calm the boards.',
    },
    {
      stamp: 'EXP · ANOMALY',
      body: 'Scope keeps tagging hulls that were not here at last survey. Derelict vessels. Belt clutter with no burn trail. They appear between watches — as if the throat we are building already leaks without asking. No emission. No answer when hailed. We mark them and pretend the chart is still ours.',
    },
    {
      stamp: 'EXP · HAND-OFF',
      body: 'Orders: leave Gatewright on station to watch the ring and the unfinished gate. Occupants board the transport vessel for return to the colonists. Wake authority rides with the ice until a living light answers. Recorder closes here. If you read this keel cold — we meant to come back.',
    },
  ],
  journalSightTitle: 'Foreign keel',
  journalSightBody:
    'Unfamiliar hull in Vesper. Clamps answer in a hand that is not Sol’s.',
  journalDockTitle: 'Gatewright',
  journalDockBody:
    'Void expedition ship. Logs say they arrived to plant Gate-2 and raise an automated siphon ring — untested satellites that already misbehaved. They marked derelicts and clutter appearing from nowhere, then boarded a transport home to the colonists and left the hull cold.',
}

export function isVesperExpeditionStation(
  name: string | undefined | null,
): boolean {
  return !!name && name === GATEWRIGHT_PROFILE.name
}

export function vesperExpeditionProfile(
  name: string | undefined | null,
): VesperExpeditionProfile | null {
  if (!name || name !== GATEWRIGHT_PROFILE.name) return null
  return GATEWRIGHT_PROFILE
}

/** Chart scribble until first hard-dock, then Gatewright. */
export function gatewrightMapLabel(dockedOnce: boolean): string {
  return dockedOnce ? GATEWRIGHT_PROFILE.name : GATEWRIGHT_PROFILE.chartLabel
}

export type GatewrightJournalFlags = {
  vesperGatewrightSeen?: boolean
  vesperGatewrightDocked?: boolean
}

/** Append Gatewright sight / dock fragments into the Void COMLOG thread. */
export function appendGatewrightJournal(
  flags: GatewrightJournalFlags,
  entries: VoidJournalEntry[],
): VoidJournalEntry[] {
  const out = [...entries]
  if (flags.vesperGatewrightDocked) {
    out.push({
      id: 'vesper-gatewright-dock',
      title: GATEWRIGHT_PROFILE.journalDockTitle,
      body: GATEWRIGHT_PROFILE.journalDockBody,
    })
  } else if (flags.vesperGatewrightSeen) {
    out.push({
      id: 'vesper-gatewright-sight',
      title: GATEWRIGHT_PROFILE.journalSightTitle,
      body: GATEWRIGHT_PROFILE.journalSightBody,
    })
  }
  return out
}
