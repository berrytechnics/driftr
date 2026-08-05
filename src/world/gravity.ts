import { Vector3 } from 'three'

/** Gravitational parameter μ = G(M + m) ≈ GM for a dominant central body. */
export function gravityAcceleration(
  position: Vector3,
  bodyPosition: Vector3,
  mu: number,
  softRadius: number,
  out: Vector3,
) {
  out.copy(position).sub(bodyPosition)
  const distance = Math.max(out.length(), softRadius)
  // a = -μ r̂ / r²  ==  -μ r / r³
  return out.multiplyScalar(-mu / (distance * distance * distance))
}

/** Speed needed for a circular orbit at the given radius. */
export function circularOrbitSpeed(mu: number, radius: number) {
  return Math.sqrt(mu / Math.max(radius, 1e-4))
}

/**
 * Vis-viva speed at radius `r` on an orbit with semi-major axis `a`.
 * For circular orbits, a === r and this matches circularOrbitSpeed.
 */
export function orbitalSpeed(mu: number, radius: number, semiMajor: number) {
  const r = Math.max(radius, 1e-4)
  const a = Math.max(semiMajor, 1e-4)
  return Math.sqrt(Math.max(0, mu * (2 / r - 1 / a)))
}

/**
 * Tangential unit direction for a circular orbit.
 * Uses world up, falling back to world X if nearly aligned with the radius.
 */
const _up = new Vector3(0, 1, 0)
const _fallbackAxis = new Vector3(1, 0, 0)

export function circularOrbitTangent(
  radiusDir: Vector3,
  out: Vector3,
  up: Vector3 = _up,
) {
  out.crossVectors(up, radiusDir)
  if (out.lengthSq() < 1e-8) {
    out.crossVectors(_fallbackAxis, radiusDir)
  }
  return out.normalize()
}
