export type MapBodyKind = 'planet' | 'moon'

export type MapBodySnapshot = {
  name: string
  /** Position relative to the star (sun-centered) */
  x: number
  y: number
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
  /** Orbital plane tilt (radians) — matches Planet inclination */
  inclination?: number
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
    y: number
    z: number
    /** Heading in degrees; 0 = facing world −Z (cone follows travel when moving) */
    heading: number
  } | null
  /** Bandit pips (sun-relative) */
  bandits: { x: number; y: number; z: number }[]
  /** Friendly patrol pips (sun-relative) */
  patrols: { x: number; y: number; z: number }[]
  /**
   * Dock stations (sun-relative).
   * `host*` is the parent body pip; the gold berth ring draws around it while
   * a small pip marks the true station position.
   */
  stations: {
    name: string
    x: number
    y: number
    z: number
    hostX: number
    hostY: number
    hostZ: number
    hostSize: number
    /** Gold berth ring around host pip — false for dead/ghost pads */
    hostRing?: boolean
    /** Gold pip at true station position */
    showPip?: boolean
    /** Chart label stays up without selecting the pip */
    alwaysShowLabel?: boolean
  }[]
  /** Seconds remaining — bright silver Nyx ellipse (cruise into night) */
  nyxOrbitGlow: number
  /** Persist-driven — draw faint NYX TRANSIT corridor on Nyx’s ellipse */
  nyxCorridorUnlocked: boolean
  /** Ephemeral lore map pings (NT-0, APO · TRANSIT, etc.) */
  lorePings: MapLorePing[]
  /** Active jettisoned haul (sun-relative) until scooped, claimed, or timed out. */
  cargoDump: { x: number; y: number; z: number } | null
}

export type MapLorePing = {
  x: number
  y: number
  z: number
  label: string
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
    stations: [],
    nyxOrbitGlow: 0,
    nyxCorridorUnlocked: false,
    lorePings: [],
    cargoDump: null,
  }
}

/**
 * Sample a Kepler-ish orbit in sun-centered coords using the same tilt
 * convention as `placeEllipticalOrbit` (tilt around world +X).
 */
export function sampleInclinedOrbit(
  semiMajor: number,
  eccentricity: number,
  periapsisPhase: number,
  inclination: number,
  segments = 96,
): [number, number, number][] {
  const a = Math.max(semiMajor, 1e-4)
  const e = Math.min(Math.max(eccentricity, 0), 0.95)
  const ecc2 = 1 - e * e
  const ci = Math.cos(inclination)
  const si = Math.sin(inclination)
  const pts: [number, number, number][] = []
  for (let s = 0; s <= segments; s++) {
    const nu = (s / segments) * Math.PI * 2
    const r = e > 0.02 ? (a * ecc2) / (1 + e * Math.cos(nu)) : a
    const ang = periapsisPhase + nu
    const x = Math.cos(ang) * r
    const z0 = Math.sin(ang) * r
    // Radial was (x, 0, z); applyAxisAngle(+X, inclination)
    pts.push([x, -z0 * si, z0 * ci])
  }
  return pts
}
