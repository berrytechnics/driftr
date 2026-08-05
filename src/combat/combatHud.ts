/** Mutable combat HUD snapshot written each frame for the DOM overlay. */
export type CombatHudState = {
  /** Bandit is in chase / gunfight */
  engaged: boolean
  /** Off-screen (or near edge) — show the edge chevron */
  showChevron: boolean
  /** Screen-space position in CSS pixels */
  x: number
  y: number
  /** Radians — chevron tip points toward the combatant */
  angle: number
  hp: number
  maxHp: number
}

export function createEmptyCombatHud(): CombatHudState {
  return {
    engaged: false,
    showChevron: false,
    x: 0,
    y: 0,
    angle: 0,
    hp: 0,
    maxHp: 1,
  }
}

/** Written by BanditShip; read by CombatTracker. */
export type BanditCombatState = {
  engaged: boolean
  alive: boolean
  hp: number
  maxHp: number
}

export function createEmptyBanditCombat(): BanditCombatState {
  return {
    engaged: false,
    alive: false,
    hp: 0,
    maxHp: 1,
  }
}
