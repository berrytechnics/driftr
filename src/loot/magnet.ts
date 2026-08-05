import type { Vector3 } from 'three'

/** World units — start drifting toward the ship inside this radius */
export const MAGNET_RANGE = 16
/** Approach speed at the outer edge of magnet range */
export const MAGNET_MIN_SPEED = 8
/** Approach speed when nearly on top of the ship */
export const MAGNET_MAX_SPEED = 36
/** Snap + hard stop inside this radius */
export const MAGNET_ARRIVE = 0.4

type Vel = { vx: number; vy: number; vz: number }

export type MagnetResult = 'none' | 'pulling' | 'arrived'

/**
 * Move a pickup toward `target` without ever overshooting.
 * Integrates position itself and zeroes velocity on arrival.
 */
export function stepPickupMagnet(
  pos: Vector3,
  vel: Vel,
  target: Vector3,
  dt: number,
): MagnetResult {
  const dx = target.x - pos.x
  const dy = target.y - pos.y
  const dz = target.z - pos.z
  const d2 = dx * dx + dy * dy + dz * dz
  if (d2 > MAGNET_RANGE * MAGNET_RANGE) return 'none'

  if (d2 <= MAGNET_ARRIVE * MAGNET_ARRIVE) {
    pos.x = target.x
    pos.y = target.y
    pos.z = target.z
    vel.vx = 0
    vel.vy = 0
    vel.vz = 0
    return 'arrived'
  }

  const d = Math.sqrt(d2)
  const falloff = 1 - d / MAGNET_RANGE
  const speed =
    MAGNET_MIN_SPEED +
    (MAGNET_MAX_SPEED - MAGNET_MIN_SPEED) * falloff * falloff
  // Never step past the arrival shell — hard brake, no overshoot
  const step = Math.min(speed * dt, Math.max(0, d - MAGNET_ARRIVE))
  const inv = 1 / d
  pos.x += dx * inv * step
  pos.y += dy * inv * step
  pos.z += dz * inv * step

  const remaining = d - step
  if (remaining <= MAGNET_ARRIVE) {
    pos.x = target.x
    pos.y = target.y
    pos.z = target.z
    vel.vx = 0
    vel.vy = 0
    vel.vz = 0
    return 'arrived'
  }

  // Track approach for any leftover motion; zero lateral drift
  vel.vx = dx * inv * speed
  vel.vy = dy * inv * speed
  vel.vz = dz * inv * speed
  return 'pulling'
}
