/** Station commerce — repair, weapons, reloads, armor. */

export type ShopCategory = 'service' | 'weapon' | 'mod'

export type StationDesk = 'cargo' | 'services'

/** Credits charged per missing hull point for a full bay repair. */
export const REPAIR_COST_PER_HP = 3

/** Stock hull before plating upgrades. */
export const BASE_MAX_HP = 100

/** Tube capacity for the seeking torpedo launcher. */
export const TORPEDO_MAX_AMMO = 4

/** One-time unlock — installs tubes and loads a full magazine. */
export const TORPEDO_UNLOCK_COST = 450

/** Credits per reload round. */
export const TORPEDO_RELOAD_COST = 85

export const TORPEDO_WEAPON_ID = 'wpn-torpedo'
export const TORPEDO_RELOAD_ID = 'ammo-torpedo'

/** One-time unlock — ballistic cruise burn (no steer / no weapons). */
export const THRUSTER_UNLOCK_COST = 720
export const THRUSTER_MOD_ID = 'mod-adv-thruster'
/** Forward speed while the advanced thruster is lit. */
export const THRUSTER_SPEED = 110

export function canBuyThrusterUnlock(credits: number, owned: boolean) {
  return !owned && credits >= THRUSTER_UNLOCK_COST
}

/** One-time unlock — longer map contacts and brighter NPC beacons. */
export const SENSOR_UNLOCK_COST = 540
export const SENSOR_MOD_ID = 'mod-adv-sensors'
/** Stock contact radius (world units, ship-relative XZ). */
export const BASE_SENSOR_RANGE = 1000
/** Installed array contact radius. */
export const UPGRADED_SENSOR_RANGE = 3200

export function canBuySensorUnlock(credits: number, owned: boolean) {
  return !owned && credits >= SENSOR_UNLOCK_COST
}

export function sensorRangeForOwned(owned: boolean) {
  return owned ? UPGRADED_SENSOR_RANGE : BASE_SENSOR_RANGE
}

/** Sequential hull plating upgrades (buy in order). */
export type ArmorTierDef = {
  id: string
  /** Resulting armorTier after purchase (1–3). */
  tier: 1 | 2 | 3
  label: string
  blurb: string
  /** Max HP after this tier is installed. */
  maxHp: number
  cost: number
}

export const ARMOR_TIERS: ArmorTierDef[] = [
  {
    id: 'mod-armor-1',
    tier: 1,
    label: 'Light plating',
    blurb: 'Composite skin — raises max hull to 125.',
    maxHp: 125,
    cost: 320,
  },
  {
    id: 'mod-armor-2',
    tier: 2,
    label: 'Reinforced plating',
    blurb: 'Bonded plates over the frame — raises max hull to 150.',
    maxHp: 150,
    cost: 580,
  },
  {
    id: 'mod-armor-3',
    tier: 3,
    label: 'Heavy plating',
    blurb: 'Full ablative shell — raises max hull to 175.',
    maxHp: 175,
    cost: 980,
  },
]

export const ARMOR_MAX_TIER = ARMOR_TIERS.length

export function clampArmorTier(tier: number) {
  return Math.max(0, Math.min(ARMOR_MAX_TIER, Math.floor(tier)))
}

/** Short plating name for HUD / pause readouts. */
export function armorTierLabel(tier: number) {
  const t = clampArmorTier(tier)
  if (t <= 0) return 'Stock hull'
  return ARMOR_TIERS[t - 1]?.label ?? 'Stock hull'
}

/** Max hull for an installed armor tier (0 = stock). */
export function maxHpForArmorTier(tier: number) {
  const t = clampArmorTier(tier)
  if (t <= 0) return BASE_MAX_HP
  return ARMOR_TIERS[t - 1]?.maxHp ?? BASE_MAX_HP
}

export function nextArmorTier(tier: number): ArmorTierDef | null {
  const t = clampArmorTier(tier)
  if (t >= ARMOR_MAX_TIER) return null
  return ARMOR_TIERS[t] ?? null
}

export function canBuyArmorTier(credits: number, currentTier: number) {
  const next = nextArmorTier(currentTier)
  return !!next && credits >= next.cost
}

export function missingHp(hp: number, maxHp: number) {
  return Math.max(0, Math.round(maxHp) - Math.round(hp))
}

/** Full-repair quote for the current hull. */
export function repairCost(hp: number, maxHp: number) {
  return missingHp(hp, maxHp) * REPAIR_COST_PER_HP
}

export function canAffordRepair(credits: number, hp: number, maxHp: number) {
  const cost = repairCost(hp, maxHp)
  return cost > 0 && credits >= cost
}

export function clampTorpedoAmmo(ammo: number) {
  return Math.max(0, Math.min(TORPEDO_MAX_AMMO, Math.floor(ammo)))
}

export function torpedoReloadSlots(ammo: number) {
  return Math.max(0, TORPEDO_MAX_AMMO - clampTorpedoAmmo(ammo))
}

export function canBuyTorpedoUnlock(credits: number, owned: boolean) {
  return !owned && credits >= TORPEDO_UNLOCK_COST
}

export function canBuyTorpedoReload(
  credits: number,
  owned: boolean,
  ammo: number,
) {
  return (
    owned &&
    torpedoReloadSlots(ammo) > 0 &&
    credits >= TORPEDO_RELOAD_COST
  )
}

/**
 * Catalog stubs for upcoming station stock.
 * Wired listings use the live shop handlers in App / StationMenu.
 */
export type ShopListing = {
  id: string
  category: ShopCategory
  label: string
  blurb: string
  /** Fixed credit price; repair uses {@link repairCost} instead. */
  cost?: number
  /** One-time unlocks (weapons / mods) flip this after purchase. */
  unique?: boolean
}

export const WEAPON_SHOP: ShopListing[] = [
  {
    id: TORPEDO_WEAPON_ID,
    category: 'weapon',
    label: 'Seeking torpedo',
    blurb: 'Lock a hostile, then fire a warhead that hunts them. Four tubes.',
    cost: TORPEDO_UNLOCK_COST,
    unique: true,
  },
  {
    id: TORPEDO_RELOAD_ID,
    category: 'weapon',
    label: 'Torpedo reload',
    blurb: 'One seeking warhead for an empty tube.',
    cost: TORPEDO_RELOAD_COST,
  },
]

export const ARMOR_SHOP: ShopListing[] = ARMOR_TIERS.map((tier) => ({
  id: tier.id,
  category: 'mod' as const,
  label: tier.label,
  blurb: tier.blurb,
  cost: tier.cost,
  unique: true,
}))

export const THRUSTER_SHOP: ShopListing[] = [
  {
    id: THRUSTER_MOD_ID,
    category: 'mod',
    label: 'Advanced thruster',
    blurb:
      'Ballistic cruise — locks out steering and weapons while lit. Map contacts blank. Toggle with C; no limit.',
    cost: THRUSTER_UNLOCK_COST,
    unique: true,
  },
]

export const SENSOR_SHOP: ShopListing[] = [
  {
    id: SENSOR_MOD_ID,
    category: 'mod',
    label: 'Long-range sensors',
    blurb:
      'Extends map contact range and amplifies hostile / patrol beacons so contacts read farther in the black.',
    cost: SENSOR_UNLOCK_COST,
    unique: true,
  },
]
