/**
 * Tight lethal hull spheres (world units) for PlayerShip collision.
 * Kept separate from React/GLB modules so HMR doesn't orphan the bindings.
 *
 * Sized from mesh bounds at the scales used in Space / NyxAltSpace
 * (center → farthest vertex, slight pad so plating registers before core).
 */

export const STATION_HIT_RADIUS = {
  /** space_station.glb @ 0.26 — large lattice mesh */
  ares: 3.2,
  /** space+station.glb @ 0.28 — meshR ≈ 0.75 */
  thalassa: 0.85,
  /** space__station.glb @ 0.42 — meshR ≈ 1.21 */
  kronos: 1.3,
  /** Alt Nyx Station — same kronos mesh @ ~0.3 — meshR ≈ 0.87 */
  nyxAlt: 0.95,
} as const

/** Keyed Nyx Transit — same kronos mesh @ 0.42 (ghost / offline apo has no collision). */
export const NYX_TRANSIT_HIT_RADIUS = 1.3

export const FLOATING_WRECK_HIT_RADIUS = {
  tug: 7.2,
  cassini: 2.2,
} as const
