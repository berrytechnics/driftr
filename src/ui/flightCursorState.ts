/** Shared normalized cursor (0–1) while the OS pointer is locked. */
export const flightCursorPos = {
  x: 0.5,
  y: 0.5,
}

export function flightCursorClientPoint() {
  return {
    clientX: flightCursorPos.x * window.innerWidth,
    clientY: flightCursorPos.y * window.innerHeight,
  }
}

export function resetFlightCursor() {
  flightCursorPos.x = 0.5
  flightCursorPos.y = 0.5
}
