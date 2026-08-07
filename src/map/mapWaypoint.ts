/** Player map pick — body name tracked for the flight HUD marker. */
export type MapWaypointState = {
  /** Selected body / station name (planet / moon / star / station), or null */
  name: string | null
  /** Kind hint for label styling */
  kind: 'star' | 'planet' | 'moon' | 'station' | 'marker' | null
  /** Screen overlay — written by MapWaypointTracker */
  show: boolean
  /** True when the body projects inside the view frustum box */
  onScreen: boolean
  /** CSS pixels */
  x: number
  y: number
  /** Edge chevron aim (radians) when off-screen */
  angle: number
  /** Distance from camera to body (world units) */
  distance: number
}

export function createEmptyMapWaypoint(): MapWaypointState {
  return {
    name: null,
    kind: null,
    show: false,
    onScreen: false,
    x: 0,
    y: 0,
    angle: 0,
    distance: 0,
  }
}
