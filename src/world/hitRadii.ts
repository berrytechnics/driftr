/**
 * Tight lethal hull spheres (world units) for PlayerShip collision.
 * Kept separate from React/GLB modules so HMR doesn't orphan the bindings.
 */

export const STATION_HIT_RADIUS = {
  ares: 3.2,
  thalassa: 3.5,
  kronos: 5.2,
  /** Alt Nyx Station — kronos mesh at scale ~0.3 */
  nyxAlt: 3.8,
} as const

/** Keyed Nyx Transit only — ghost / offline apo pad has no collision. */
export const NYX_TRANSIT_HIT_RADIUS = 5.2

export const FLOATING_WRECK_HIT_RADIUS = {
  tug: 7.2,
  cassini: 2.2,
} as const
