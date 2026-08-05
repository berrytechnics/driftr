export type MapBodyKind = 'planet' | 'moon'

export type MapBodySnapshot = {
  name: string
  /** Position relative to the star in the XZ plane */
  x: number
  z: number
  /** World radius — mapped to a readable pip size */
  size: number
  color: string
  kind: MapBodyKind
  /** Semi-major axis for orbit guide (defaults to current sun distance) */
  guideOrbit?: number
  /** When > 0, map draws an ellipse instead of a circle */
  eccentricity?: number
  /** Argument of periapsis (radians) for elliptical guides */
  periapsisPhase?: number
}

export type MapSnapshot = {
  starName: string
  starSize: number
  starColor: string
  beltInner: number
  beltOuter: number
  bodies: MapBodySnapshot[]
  ship: {
    x: number
    z: number
    /** Heading in degrees; 0 = facing world −Z (up on the map) */
    heading: number
  } | null
  /** Bandit pips (sun-relative XZ) */
  bandits: { x: number; z: number }[]
  /** Friendly patrol pips (sun-relative XZ) */
  patrols: { x: number; z: number }[]
}

export function createEmptyMapSnapshot(): MapSnapshot {
  return {
    starName: 'Sol',
    starSize: 8,
    starColor: '#ffcc66',
    beltInner: 1727,
    beltOuter: 2273,
    bodies: [],
    ship: null,
    bandits: [],
    patrols: [],
  }
}
