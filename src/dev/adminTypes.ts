/** Dev-only warp targets resolved by each sky (Sol / Vesper). */
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
