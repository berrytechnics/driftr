/**
 * Compressed system scale — Sol is always the largest body.
 * Radii / orbital distances (world units):
 *   Sol 240 | Hermes 8.4 @ 432 | Ares 14.4 @ 773 | Boreas 16.2 @ 1159
 *   Thalassa 18 @ 1500 | belt 1727–2273 (mid ~2000) | Kronos 60 @ 2727 | Ouranos 84 @ 3727
 *   Nyx 5.7 @ a=5600, e=0.55 (peri ≈ 2520, apo ≈ 8680)
 *
 * Body radii are sized so orbital stations (~14u) read as outposts, not giants.
 */
export const SUN_SIZE = 240
export const MERCURY_SIZE = 8.4
export const MERCURY_ORBIT = 432
export const INNER_PLANET_SIZE = 14.4
export const INNER_ORBIT = 773
export const MID_PLANET_SIZE = 16.2
export const MID_ORBIT = 1159
export const BELT_PLANET_SIZE = 18
export const BELT_ORBIT = 1500
export const BELT_INNER = 1727
export const BELT_OUTER = 2273
export const GAS_GIANT_SIZE = 60
export const GAS_ORBIT = 2727
export const OUTER_GAS_SIZE = 84
export const OUTER_GAS_ORBIT = 3727
/** Distant dwarf — semi-major axis; eccentricity makes a visibly stretched year */
export const OUTER_DWARF_SIZE = 5.7
export const OUTER_DWARF_ORBIT = 5600
/** High ecc so apo sits far beyond Ouranos (rescue margin for Nyx Transit lore). */
export const OUTER_DWARF_ECC = 0.55
export const STAR_NAME = 'Sol'
export const PLANET_NAMES = {
  mercury: 'Hermes',
  inner: 'Ares',
  mid: 'Boreas',
  belt: 'Thalassa',
  gas: 'Kronos',
  outerGas: 'Ouranos',
  outerDwarf: 'Nyx',
} as const

/** Orbital outposts — one per named world */
export const STATION_NAMES = {
  thalassa: 'Thalassa Station',
  ares: 'Ares Station',
  kronos: 'Kronos Station',
  /** Ghost apo pad in Sol — offline MFD */
  nyx: 'Nyx Transit',
  /** Live pad orbiting alternate Ashen Nyx */
  nyxAlt: 'Nyx Station',
  /** Cold derelict tug in the alternate Vesper system — lore dock only */
  nyxTug: 'Derelict Tug',
} as const
/** @deprecated Prefer STATION_NAMES.thalassa — kept for older imports */
export const STATION_NAME = STATION_NAMES.thalassa

export const MOON_NAMES = {
  ares: 'Deimos',
  boreas: 'Khione',
  thalassa: 'Galene',
  kronosA: 'Rhea',
  kronosB: 'Iapetus',
  kronosC: 'Hyperion',
  ouranosA: 'Titania',
  ouranosB: 'Oberon',
} as const

/** Moon radii (world units) — scaled with host planets */
export const MOON_SIZES = {
  ares: 2.28,
  boreas: 2.88,
  thalassa: 3.3,
  kronosA: 3.3,
  kronosB: 5.1,
  kronosC: 6.9,
  ouranosA: 4.2,
  ouranosB: 6.3,
} as const

/**
 * Which sky the player is in —
 * Nyx pads (dust) slip Sol ↔ Vesper; a powered gate slips Vesper ↔ liminal void.
 */
export const SYSTEM_IDS = {
  sol: 'sol',
  nyxAlt: 'nyxAlt',
  /** Sparse liminal pocket reachable only through the misplanted gate. */
  gateVoid: 'gateVoid',
} as const
export type SystemId = (typeof SYSTEM_IDS)[keyof typeof SYSTEM_IDS]

/** Chart label for the liminal void (no catalog star). */
export const VOID_STAR_NAME = '—'

/** Compact alternate sky — small indigo Vesper, cooler and dimmer than Sol. */
export const ALT_STAR_NAME = 'Vesper'
export const ALT_SUN_SIZE = 72
export const ALT_SUN_COLOR = '#6b5cff'
export const ALT_SUN_INTENSITY = 1.65
/**
 * Vesper chart — quiet gaps between catalog bodies; only Nyx keeps a name.
 *   V-1 arid 7.2 @ 175 | V-2 rocky 10.5 @ 290 | Nyx ashen 5.7 @ 420
 *   belt 150–620 | V-3 frozen 13.8 @ 810 | collector rail @ 980
 */
export const ALT_INNER_SIZE = 7.2
export const ALT_INNER_ORBIT = 175
export const ALT_MID_SIZE = 10.5
export const ALT_MID_ORBIT = 290
/** Ashen dwarf — same scale as Sol’s Nyx, tighter orbit around the small star. */
export const ALT_NYX_SIZE = OUTER_DWARF_SIZE
export const ALT_NYX_ORBIT = 420
export const ALT_OUTER_SIZE = 13.8
export const ALT_OUTER_ORBIT = 810
/** Mild stretch so V-3 never quite settles into a reading. */
export const ALT_OUTER_ECC = 0.12
export const ALT_PLANET_NAMES = {
  inner: 'V-1',
  mid: 'V-2',
  outer: 'V-3',
} as const
export const ALT_NYX_NAME = PLANET_NAMES.outerDwarf
/** Sparse loose field of large rocks around Vesper (Nyx sits near mid-annulus). */
export const ALT_BELT_INNER = 150
export const ALT_BELT_OUTER = 620
/**
 * Derelict collector ring outside every catalog orbit (past V-3 apo ≈907).
 * Near-complete satellite rail meant to feed the misplanted gate — dark now.
 */
export const ALT_DYSON_ORBIT = 980
/** Dramatic tilt so the ring reads as a silhouette from most approaches. */
export const ALT_DYSON_INCLINATION = 0.52
