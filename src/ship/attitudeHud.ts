/** Live ship attitude for the navball — written every flight frame. */
export type AttitudeHudState = {
  /** Nose vs world XZ plane (radians); + = nose up */
  pitch: number
  /** Bank about nose (radians); + = right wing down */
  roll: number
  /** Compass degrees; 0 = facing world −Z */
  heading: number
  /**
   * Unit velocity in ship-local space (nose = −Z, +Y = up).
   * When nearly stopped, matches the nose.
   */
  progradeX: number
  progradeY: number
  progradeZ: number
  speed: number
  /**
   * Unit direction toward the sun in ship-local space.
   * Anti-sun (pointing away) is the negation.
   */
  sunX: number
  sunY: number
  sunZ: number
  /**
   * Degrees between the nose and anti-sun (radial-out from Sol).
   * 0 = pointed fully away from the sun; 180 = pointed at Sol.
   */
  awayAngle: number
}

export function createEmptyAttitudeHud(): AttitudeHudState {
  return {
    pitch: 0,
    roll: 0,
    heading: 0,
    progradeX: 0,
    progradeY: 0,
    progradeZ: -1,
    speed: 0,
    sunX: 0,
    sunY: 0,
    sunZ: 1,
    awayAngle: 0,
  }
}
