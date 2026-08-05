export type MaterialKind = 'ore' | 'ice' | 'alloy'

export type CargoHold = Record<MaterialKind, number>

/** Station buy prices (credits per unit) */
export const MATERIAL_PRICE: Record<MaterialKind, number> = {
  ore: 8,
  ice: 14,
  alloy: 32,
}

export const MATERIAL_LABEL: Record<MaterialKind, string> = {
  ore: 'Rock ore',
  ice: 'Volatile ice',
  alloy: 'Rare alloy',
}

export const MATERIAL_COLOR: Record<MaterialKind, string> = {
  ore: '#c4a574',
  ice: '#a8d4f0',
  alloy: '#d4b060',
}

/**
 * Belt rock body tints — muted so types read at close range without
 * painting the belt neon. Exact per-rock colors are rolled around these
 * families in AsteroidBelt (`rockColor`).
 */
export const ASTEROID_COLOR: Record<MaterialKind, string> = {
  ore: '#5c534a',
  ice: '#c2c7cb',
  alloy: '#6e675c',
}

/** Token lifetime in the belt if not scooped */
export const MATERIAL_LIFETIME = 28

/** Jettisoned haul drifts longer so bandits can cross the system. */
export const JETTISON_LIFETIME = 180

export const MATERIAL_KINDS: MaterialKind[] = ['ore', 'ice', 'alloy']

/**
 * Asteroid composition in the belt — alloy rocks are uncommon but findable.
 * (~50% ore / ~32% ice / ~18% alloy)
 */
export function rollAsteroidType(rand: () => number = Math.random): MaterialKind {
  const r = rand()
  if (r < 0.5) return 'ore'
  if (r < 0.82) return 'ice'
  return 'alloy'
}

/**
 * Drop from a typed rock — color signals the primary haul, with a small
 * chance of the other materials so a single rock isn’t a pure guarantee.
 */
export function rollMaterialFromAsteroidType(
  type: MaterialKind,
  rand: () => number = Math.random,
): MaterialKind {
  const r = rand()
  if (type === 'ore') {
    if (r < 0.8) return 'ore'
    if (r < 0.94) return 'ice'
    return 'alloy'
  }
  if (type === 'ice') {
    if (r < 0.8) return 'ice'
    if (r < 0.94) return 'ore'
    return 'alloy'
  }
  // Alloy asteroids mostly yield alloy
  if (r < 0.72) return 'alloy'
  if (r < 0.88) return 'ore'
  return 'ice'
}

/** Weighted roll — ore common, alloy scarce (non-asteroid fallbacks) */
export function rollMaterialKind(): MaterialKind {
  const r = Math.random()
  if (r < 0.62) return 'ore'
  if (r < 0.88) return 'ice'
  return 'alloy'
}

/** Units in a single pickup shard */
export function rollMaterialAmount(kind: MaterialKind) {
  if (kind === 'alloy') return 1
  if (kind === 'ice') return 1 + (Math.random() < 0.35 ? 1 : 0)
  return 1 + (Math.random() < 0.45 ? 1 : 0) + (Math.random() < 0.2 ? 1 : 0)
}

export function emptyCargo(): CargoHold {
  return { ore: 0, ice: 0, alloy: 0 }
}

export function cargoUnits(cargo: CargoHold) {
  return cargo.ore + cargo.ice + cargo.alloy
}

export function cargoValue(cargo: CargoHold) {
  return MATERIAL_KINDS.reduce(
    (sum, kind) => sum + cargo[kind] * MATERIAL_PRICE[kind],
    0,
  )
}

export function formatCredits(n: number) {
  return n.toLocaleString('en-US')
}
