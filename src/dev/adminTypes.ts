/** Dev-only warp targets resolved by each sky (Sol / Vesper). */
export type AdminWarpId = 'sun' | 'inner' | 'belt' | 'outer' | 'apo'

export type AdminWarpRequest = {
  seq: number
  id: AdminWarpId
}
