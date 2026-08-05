/**
 * Compressed system scale — Sol is always the largest body.
 * Radii / orbital distances (world units):
 *   Sol 40 | Hermes 1.4 @ 432 | Ares 2.4 @ 773 | Boreas 2.7 @ 1159
 *   Thalassa 3.0 @ 1500 | belt 1727–2273 (mid ~2000) | Kronos 10 @ 2727 | Ouranos 14 @ 3727
 *   Nyx 0.95 @ a=5600, e=0.32 (peri ≈ 3808, apo ≈ 7392)
 */
export const SUN_SIZE = 40
export const MERCURY_SIZE = 1.4
export const MERCURY_ORBIT = 432
export const INNER_PLANET_SIZE = 2.4
export const INNER_ORBIT = 773
export const MID_PLANET_SIZE = 2.7
export const MID_ORBIT = 1159
export const BELT_PLANET_SIZE = 3.0
export const BELT_ORBIT = 1500
export const BELT_INNER = 1727
export const BELT_OUTER = 2273
export const GAS_GIANT_SIZE = 10
export const GAS_ORBIT = 2727
export const OUTER_GAS_SIZE = 14
export const OUTER_GAS_ORBIT = 3727
/** Distant dwarf — semi-major axis; eccentricity makes a visibly stretched year */
export const OUTER_DWARF_SIZE = 0.95
export const OUTER_DWARF_ORBIT = 5600
export const OUTER_DWARF_ECC = 0.32
export const STATION_NAME = 'Thalassa Station'

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
