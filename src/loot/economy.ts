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

/** Token lifetime in the belt if not scooped */
export const MATERIAL_LIFETIME = 28

/** Jettisoned haul drifts longer so bandits can reach it. */
export const JETTISON_LIFETIME = 48

export const MATERIAL_KINDS: MaterialKind[] = ['ore', 'ice', 'alloy']

/** Weighted roll — ore common, alloy scarce */
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
