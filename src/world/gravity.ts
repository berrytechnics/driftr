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
const _radial = new Vector3()
const _tangent = new Vector3()
const _tilt = new Vector3()

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

/**
 * Place a body on an elliptical orbit at a chosen radial fraction from
 * periapsis (0) to apoapsis (1). Writes world position + velocity.
 */
export function placeEllipticalOrbit(
  outPosition: Vector3,
  outVelocity: Vector3,
  body: Vector3,
  semiMajor: number,
  eccentricity: number,
  mu: number,
  periapsisPhase: number,
  inclination: number,
  /** 0 = periapsis, 1 = apoapsis */
  startRadiusFraction = 0,
) {
  const e = Math.min(Math.max(eccentricity, 0), 0.95)
  const a = Math.max(semiMajor, 1e-4)
  const peri = a * (1 - e)
  const apo = a * (1 + e)
  const frac = Math.min(Math.max(startRadiusFraction, 0), 1)
  const r = peri + frac * (apo - peri)

  // True anomaly from polar equation: r = a(1−e²)/(1+e cos ν)
  let nu = 0
  if (e > 1e-6) {
    const cosNu = (a * (1 - e * e) / Math.max(r, 1e-4) - 1) / e
    nu = Math.acos(Math.min(1, Math.max(-1, cosNu)))
    // Ascending toward apo (positive true anomaly)
  }

  // Orbital-plane radius direction, then tilt around X
  _radial.set(Math.cos(periapsisPhase + nu), 0, Math.sin(periapsisPhase + nu))
  if (inclination !== 0) {
    _tilt.set(1, 0, 0)
    _radial.applyAxisAngle(_tilt, inclination)
  }
  _radial.normalize()

  outPosition.copy(body).addScaledVector(_radial, r)

  circularOrbitTangent(_radial, _tangent)
  // Kepler planar velocity: v_r radial, v_θ along tangent
  const h = Math.sqrt(Math.max(0, mu * a * (1 - e * e)))
  const invH = h > 1e-8 ? 1 / h : 0
  const vr = mu * invH * e * Math.sin(nu)
  const vt = mu * invH * (1 + e * Math.cos(nu))
  outVelocity
    .copy(_radial)
    .multiplyScalar(vr)
    .addScaledVector(_tangent, vt)
}
