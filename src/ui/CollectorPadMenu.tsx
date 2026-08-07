import { useMemo } from 'react'
import { SIPHON_REPAIR_SHARD_COST } from '@/lore/easterEggs'
import {
  buildSiphonPadStats,
  type SiphonPadStats,
} from '@/ui/siphonPadStats'

export type { SiphonPadStats } from '@/ui/siphonPadStats'
export { buildSiphonPadStats } from '@/ui/siphonPadStats'

const font = "'Share Tech Mono', ui-monospace, monospace"

type CollectorPadMenuProps = {
  stationName: string
  stats: SiphonPadStats
  nightShards: number
  onRepair: () => void
  onUndock: () => void
}

function StatRow({
  label,
  value,
  muted,
}: {
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 16,
        padding: '7px 0',
        borderBottom: '1px solid rgba(120, 90, 160, 0.22)',
      }}
    >
      <span
        style={{
          color: muted ? 'rgba(160,140,190,0.55)' : 'rgba(190,170,220,0.75)',
          letterSpacing: '0.14em',
          fontSize: 11,
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: muted ? 'rgba(180,160,200,0.65)' : '#e8d8ff',
          letterSpacing: '0.06em',
          fontSize: 13,
        }}
      >
        {value}
      </span>
    </div>
  )
}

function Meter({
  label,
  pct,
  color,
}: {
  label: string
  pct: number
  color: string
}) {
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 11,
          letterSpacing: '0.14em',
          color: 'rgba(190,170,220,0.75)',
          marginBottom: 5,
        }}
      >
        <span>{label}</span>
        <span style={{ color: '#e8d8ff' }}>{clamped}%</span>
      </div>
      <div
        style={{
          height: 6,
          background: 'rgba(40, 28, 60, 0.85)',
          border: '1px solid rgba(120, 90, 160, 0.35)',
        }}
      >
        <div
          style={{
            width: `${clamped}%`,
            height: '100%',
            background: color,
            boxShadow: `0 0 10px ${color}`,
          }}
        />
      </div>
    </div>
  )
}

/** Compact hard-dock overlay for a Vesper siphon satellite. */
export function CollectorPadMenu({
  stationName,
  stats,
  nightShards,
  onRepair,
  onUndock,
}: CollectorPadMenuProps) {
  const canRepair =
    !stats.live && nightShards >= SIPHON_REPAIR_SHARD_COST

  const statusColor =
    stats.status === 'SIPHONING'
      ? 'rgba(140, 220, 180, 0.95)'
      : stats.status === 'STANDBY'
        ? 'rgba(180, 170, 120, 0.95)'
        : 'rgba(220, 120, 110, 0.95)'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 40,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: '0 18px 36px',
        fontFamily: font,
      }}
    >
      <div
        style={{
          pointerEvents: 'auto',
          width: 'min(420px, 100%)',
          background:
            'linear-gradient(165deg, rgba(18,12,32,0.94) 0%, rgba(8,6,18,0.96) 100%)',
          border: '1px solid rgba(140, 110, 200, 0.45)',
          boxShadow:
            '0 0 40px rgba(80, 40, 140, 0.35), inset 0 0 30px rgba(60, 30, 100, 0.2)',
          padding: '18px 20px 16px',
          color: '#ddd0f0',
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: '0.28em',
            color: 'rgba(170,140,220,0.65)',
            marginBottom: 4,
          }}
        >
          COLLECTOR CONTACT
        </div>
        <div
          style={{
            fontSize: 17,
            letterSpacing: '0.1em',
            color: '#f0e4ff',
            marginBottom: 2,
          }}
        >
          {stationName}
        </div>
        <div
          style={{
            fontSize: 12,
            letterSpacing: '0.18em',
            color: statusColor,
            marginBottom: 14,
          }}
        >
          {stats.status}
          <span style={{ color: 'rgba(160,140,190,0.5)', marginLeft: 10 }}>
            · {stats.label}
          </span>
        </div>

        <Meter
          label="HULL INTEGRITY"
          pct={stats.hull}
          color={stats.live ? 'rgba(150,210,255,0.85)' : 'rgba(200,90,80,0.8)'}
        />
        <Meter
          label="PHOTIC CHARGE"
          pct={stats.charge}
          color={
            stats.live ? 'rgba(180,120,255,0.85)' : 'rgba(90,70,110,0.85)'
          }
        />

        <StatRow label="Λ-FLUX" value={stats.lambdaFlux} />
        <StatRow label="ECHO SKEW" value={stats.echoSkew} />
        <StatRow
          label="NYX DUST"
          value={`${nightShards}`}
          muted={!canRepair && !stats.live}
        />

        {!stats.live && (
          <div
            style={{
              marginTop: 14,
              padding: '10px 12px',
              border: '1px solid rgba(200, 100, 90, 0.4)',
              background: 'rgba(60, 20, 28, 0.45)',
              fontSize: 12,
              letterSpacing: '0.06em',
              color: 'rgba(230,180,170,0.9)',
              lineHeight: 1.45,
            }}
          >
            Plates dark. Frame cold. Feed {SIPHON_REPAIR_SHARD_COST} Nyx dust to
            wake the siphon — alien bus still rejects common ore.
          </div>
        )}

        <div
          style={{
            display: 'flex',
            gap: 10,
            marginTop: 16,
            flexWrap: 'wrap',
          }}
        >
          {!stats.live && (
            <button
              type="button"
              disabled={!canRepair}
              onClick={onRepair}
              style={{
                appearance: 'none',
                flex: 1,
                minWidth: 140,
                border: canRepair
                  ? '1px solid rgba(200, 130, 255, 0.75)'
                  : '1px solid rgba(100, 80, 120, 0.4)',
                background: canRepair
                  ? 'rgba(140, 80, 200, 0.22)'
                  : 'rgba(40, 30, 55, 0.5)',
                color: canRepair ? '#ecd8ff' : 'rgba(160,140,180,0.45)',
                padding: '11px 14px',
                fontSize: 13,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                fontFamily: font,
                cursor: canRepair ? 'pointer' : 'not-allowed',
              }}
            >
              Repair · {SIPHON_REPAIR_SHARD_COST} dust
            </button>
          )}
          <button
            type="button"
            onClick={onUndock}
            style={{
              appearance: 'none',
              flex: 1,
              minWidth: 120,
              border: '1px solid rgba(120, 210, 255, 0.65)',
              background: 'rgba(80, 140, 200, 0.12)',
              color: '#c8e8ff',
              padding: '11px 14px',
              fontSize: 13,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              fontFamily: font,
              cursor: 'pointer',
            }}
          >
            Undock
          </button>
        </div>
      </div>
    </div>
  )
}

/** Hook-friendly memoized stats for the docked pad. */
export function useSiphonPadStats(
  index: number | null,
  live: boolean,
  ringActive = false,
) {
  return useMemo(() => {
    if (index == null) return null
    return buildSiphonPadStats(index, live, ringActive)
  }, [index, live, ringActive])
}
