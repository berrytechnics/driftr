import { Vector3 } from 'three'

export type BuffKind = 'speed' | 'firerate'

/** Chance a laser-destroyed asteroid leaves a token (else material) */
export const BUFF_DROP_CHANCE = 0.06

/** How long pickups last on the ship (seconds) */
export const BUFF_DURATION = 12

/** Token despawn if not collected */
export const TOKEN_LIFETIME = 22

export const SPEED_BUFF_MULT = 1.55
export const FIRERATE_BUFF_MULT = 2

export function buffLabel(kind: BuffKind) {
  return kind === 'speed' ? 'Speed boost' : 'Double fire-rate'
}

export function buffColor(kind: BuffKind) {
  return kind === 'speed' ? '#5cffd0' : '#ffc14a'
}

/** Convert belt-local coords into world space (sun + Rx inclination). */
export function beltLocalToWorld(
  lx: number,
  ly: number,
  lz: number,
  sun: [number, number, number],
  inclination: number,
  out: Vector3,
) {
  const cosI = Math.cos(inclination)
  const sinI = Math.sin(inclination)
  out.set(
    sun[0] + lx,
    sun[1] + (ly * cosI - lz * sinI),
    sun[2] + (ly * sinI + lz * cosI),
  )
  return out
}
