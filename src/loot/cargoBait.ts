import {
  JETTISON_LIFETIME,
  cargoUnits,
  emptyCargo,
  type CargoHold,
} from '@/loot/economy'

/** World dump — player can re-scoop; bandits scramble from anywhere. */
export type CargoBait = {
  id: number
  active: boolean
  x: number
  y: number
  z: number
  /** Units left for scavengers to claim. */
  remaining: number
  life: number
  cargo: CargoHold
}

export function createEmptyCargoBait(): CargoBait {
  return {
    id: 0,
    active: false,
    x: 0,
    y: 0,
    z: 0,
    remaining: 0,
    life: 0,
    cargo: emptyCargo(),
  }
}

export function writeCargoBait(
  bait: CargoBait,
  id: number,
  x: number,
  y: number,
  z: number,
  cargo: CargoHold,
) {
  const units = cargoUnits(cargo)
  bait.id = id
  bait.active = units > 0
  bait.x = x
  bait.y = y
  bait.z = z
  bait.remaining = units
  bait.life = JETTISON_LIFETIME
  bait.cargo = { ...cargo }
}

export function clearCargoBait(bait: CargoBait) {
  bait.active = false
  bait.remaining = 0
  bait.life = 0
  bait.cargo = emptyCargo()
}

/** Player haul snapshot bandits read each frame (chase only if units > 0). */
export type PlayerCargoStatus = {
  units: number
}
