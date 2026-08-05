import { Vector3 } from 'three'

export type Occluder = {
  x: number
  y: number
  z: number
  radius: number
}

const _oc = new Vector3()
const _f = new Vector3()
const _to = new Vector3()
const _closest = new Vector3()
const _away = new Vector3()
const _side = new Vector3()
const _up = new Vector3(0, 1, 0)

/** True if segment from→to is blocked by any sphere (exclusive of endpoints). */
export function hasLineOfSight(
  from: Vector3,
  to: Vector3,
  occluders: Occluder[],
): boolean {
  _to.copy(to).sub(from)
  const dist = _to.length()
  if (dist < 1e-5) return true
  _to.multiplyScalar(1 / dist)

  for (let i = 0; i < occluders.length; i++) {
    const o = occluders[i]
    _oc.set(o.x, o.y, o.z)
    // Skip if either endpoint is already inside (caller shouldn't occlude self)
    if (from.distanceToSquared(_oc) < o.radius * o.radius) continue
    if (to.distanceToSquared(_oc) < o.radius * o.radius) continue

    // Closest point on segment to sphere center
    _f.copy(_oc).sub(from)
    const t = Math.max(0, Math.min(dist, _f.dot(_to)))
    _closest.copy(from).addScaledVector(_to, t)
    if (_closest.distanceToSquared(_oc) < o.radius * o.radius) {
      return false
    }
  }
  return true
}

/**
 * Steering bias away from a forbidden sphere.
 * Returns unit-ish avoidance vector (may be zero if clear).
 */
export function avoidSphere(
  position: Vector3,
  center: Vector3,
  keepOut: number,
  out: Vector3,
): Vector3 {
  out.copy(position).sub(center)
  const d = out.length()
  if (d > keepOut || d < 1e-6) {
    out.set(0, 0, 0)
    return out
  }
  // Stronger as we approach the keep-out shell
  const urgency = 1 - d / keepOut
  out.multiplyScalar(urgency / d)
  return out
}

/** Blend chase direction with avoidance; normalize result into out. */
export function steerWithAvoidance(
  chaseDir: Vector3,
  avoid: Vector3,
  avoidWeight: number,
  out: Vector3,
): Vector3 {
  out.copy(chaseDir).addScaledVector(avoid, avoidWeight)
  if (out.lengthSq() < 1e-8) {
    // Degenerate: slide sideways around the obstacle
    _side.crossVectors(chaseDir, _up)
    if (_side.lengthSq() < 1e-8) _side.set(1, 0, 0)
    out.copy(_side).normalize()
    return out
  }
  return out.normalize()
}

/** Unit direction from A toward B (or zero). */
export function dirToward(from: Vector3, to: Vector3, out: Vector3): Vector3 {
  out.copy(to).sub(from)
  if (out.lengthSq() < 1e-8) {
    out.set(0, 0, 0)
    return out
  }
  return out.normalize()
}

function ringBasis(planet: Vector3, sun: Vector3) {
  _away.copy(planet).sub(sun)
  if (_away.lengthSq() < 1e-6) _away.set(1, 0, 0)
  _away.normalize()
  _side.crossVectors(_up, _away)
  if (_side.lengthSq() < 1e-6) _side.set(0, 0, 1)
  _side.normalize()
}

/** Push a point onto a ring around Thalassa for patrol / spawn. */
export function placeOnRing(
  planet: Vector3,
  sun: Vector3,
  radius: number,
  angle: number,
  out: Vector3,
): Vector3 {
  ringBasis(planet, sun)
  // Rotate away around world-up-ish plane
  out
    .copy(planet)
    .addScaledVector(_away, Math.cos(angle) * radius)
    .addScaledVector(_side, Math.sin(angle) * radius)
  return out
}

/** Angle of a world point on the Thalassa patrol ring basis. */
export function angleOnRing(
  planet: Vector3,
  sun: Vector3,
  point: Vector3,
): number {
  ringBasis(planet, sun)
  _to.copy(point).sub(planet)
  const x = _to.dot(_away)
  const y = _to.dot(_side)
  return Math.atan2(y, x)
}
