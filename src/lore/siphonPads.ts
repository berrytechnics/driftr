import type { RefObject } from 'react'
import type { Group } from 'three'

export const SIPHON_SAT_COUNT = 48
/** Sparse gaps — ring still reads nearly complete. */
export const SIPHON_MISSING = new Set([11, 12, 33])
/** Present but dark until repaired with Nyx dust. */
export const SIPHON_INITIAL_DEAD = new Set([7, 22, 28, 40])
export const SIPHON_DOCK_RANGE = 48
export const SIPHON_PAD_PREFIX = 'Siphon '

export function siphonPadName(index: number) {
  return `${SIPHON_PAD_PREFIX}${String(index).padStart(2, '0')}`
}

export function isSiphonPadName(name: string | undefined | null): boolean {
  return !!name && name.startsWith(SIPHON_PAD_PREFIX)
}

export function parseSiphonPadIndex(
  name: string | undefined | null,
): number | null {
  if (!isSiphonPadName(name)) return null
  const n = Number(name!.slice(SIPHON_PAD_PREFIX.length))
  return Number.isFinite(n) ? n : null
}

/** Non-missing slot indices on the collector rail. */
export function listSiphonIndices(): number[] {
  const out: number[] = []
  for (let i = 0; i < SIPHON_SAT_COUNT; i++) {
    if (!SIPHON_MISSING.has(i)) out.push(i)
  }
  return out
}

export function isSiphonLive(
  index: number,
  repaired: ReadonlySet<number> | readonly number[],
) {
  if (SIPHON_MISSING.has(index)) return false
  if (!SIPHON_INITIAL_DEAD.has(index)) return true
  if (repaired instanceof Set) return repaired.has(index)
  return (repaired as readonly number[]).includes(index)
}

export function isSiphonRingComplete(
  repaired: ReadonlySet<number> | readonly number[],
) {
  for (const id of SIPHON_INITIAL_DEAD) {
    if (repaired instanceof Set) {
      if (!repaired.has(id)) return false
    } else if (!(repaired as readonly number[]).includes(id)) {
      return false
    }
  }
  return true
}

/** Stable empty refs for each present siphon (NyxAltSpace builds berths from these). */
export function createSiphonDockRefs(): RefObject<Group | null>[] {
  return listSiphonIndices().map(() => ({ current: null }))
}

export type SiphonDockSlot = {
  index: number
  ref: RefObject<Group | null>
  name: string
}
