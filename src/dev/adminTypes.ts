/** Dev-only warp targets resolved by each sky (Sol / Vesper / void). */
export type AdminWarpId =
  | 'sun'
  | 'inner'
  | 'belt'
  | 'outer'
  | 'apo'
  | 'siphon'
  | 'gate'

export type AdminWarpRequest = {
  seq: number
  id: AdminWarpId
}

/**
 * Undocked spawn after flying a powered gate portal.
 * Each sky resolves seq → world xyz beside its matching gate throat.
 */
export type GateArrivalRequest = {
  seq: number
}
