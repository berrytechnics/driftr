/**
 * Compressed system scale — Sol is always the largest body.
 * Radii / orbital distances (world units):
 *   Sol 40 | Hermes 1.4 @ 190 | Ares 2.4 @ 340 | Boreas 2.7 @ 510
 *   Thalassa 3.0 @ 660 | belt 760–1000 | Kronos 10 @ 1200 | Ouranos 14 @ 1640
 */
export const SUN_SIZE = 40
export const MERCURY_SIZE = 1.4
export const MERCURY_ORBIT = 190
export const INNER_PLANET_SIZE = 2.4
export const INNER_ORBIT = 340
export const MID_PLANET_SIZE = 2.7
export const MID_ORBIT = 510
export const BELT_PLANET_SIZE = 3.0
export const BELT_ORBIT = 660
export const BELT_INNER = 760
export const BELT_OUTER = 1000
export const GAS_GIANT_SIZE = 10
export const GAS_ORBIT = 1200
export const OUTER_GAS_SIZE = 14
export const OUTER_GAS_ORBIT = 1640
export const STATION_NAME = 'Thalassa Station'

export const STAR_NAME = 'Sol'
export const PLANET_NAMES = {
  mercury: 'Hermes',
  inner: 'Ares',
  mid: 'Boreas',
  belt: 'Thalassa',
  gas: 'Kronos',
  outerGas: 'Ouranos',
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
