import { MathUtils } from 'three'

export type SiphonPadStats = {
  index: number
  label: string
  live: boolean
  /** 0–100 hull integrity */
  hull: number
  /** 0–100 photic charge */
  charge: number
  /** Alien throughput string (foreign units) */
  lambdaFlux: string
  /** Phase drift / incomprehensible metric */
  echoSkew: string
  status: 'SIPHONING' | 'STANDBY' | 'DORMANT'
}

export function buildSiphonPadStats(
  index: number,
  live: boolean,
  /** Full collector ring online — only then is a live node actually siphoning. */
  ringActive = false,
): SiphonPadStats {
  const seed = MathUtils.seededRandom(index * 13.7 + 2.2)
  const seed2 = MathUtils.seededRandom(index * 5.1 + 9.4)
  if (live && ringActive) {
    return {
      index,
      label: `NODE ${String(index).padStart(2, '0')}`,
      live: true,
      hull: 74 + Math.floor(seed * 26),
      charge: 58 + Math.floor(seed2 * 42),
      lambdaFlux: `${(1.4 + seed * 4.8).toFixed(2)} ʞR`,
      echoSkew: `${(seed2 * 0.9 - 0.15).toFixed(3)}Δ`,
      status: 'SIPHONING',
    }
  }
  if (live) {
    return {
      index,
      label: `NODE ${String(index).padStart(2, '0')}`,
      live: true,
      hull: 74 + Math.floor(seed * 26),
      charge: 12 + Math.floor(seed2 * 22),
      lambdaFlux: '0.00 ʞR',
      echoSkew: `${(seed2 * 0.9 - 0.15).toFixed(3)}Δ`,
      status: 'STANDBY',
    }
  }
  return {
    index,
    label: `NODE ${String(index).padStart(2, '0')}`,
    live: false,
    hull: 6 + Math.floor(seed * 24),
    charge: Math.floor(seed2 * 14),
    lambdaFlux: '0.00 ʞR',
    echoSkew: `${(0.6 + seed * 1.8).toFixed(3)}Δ`,
    status: 'DORMANT',
  }
}
