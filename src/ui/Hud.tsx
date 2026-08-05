import type { OrbitalTelemetry } from '@/ship/PlayerShip'
import {
  cargoUnits,
  formatCredits,
  type CargoHold,
} from '@/loot/economy'
import { ARMOR_MAX_TIER, armorTierLabel } from '@/loot/shop'

function Meter({
  value,
  color,
  width = 140,
}: {
  value: number
  color: string
  width?: number
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)))
  return (
    <div
      style={{
        width,
        height: 5,
        background: 'rgba(255,255,255,0.12)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          transition: 'width 80ms linear',
        }}
      />
    </div>
  )
}

export function Hud({
  telemetry,
  credits,
  cargo,
  armorTier = 0,
}: {
  telemetry: OrbitalTelemetry | null
  credits: number
  cargo: CargoHold
  armorTier?: number
}) {
  const hold = cargoUnits(cargo)
  const dead = !!telemetry && telemetry.hp <= 0
  const hullPct =
    telemetry && telemetry.maxHp > 0 ? telemetry.hp / telemetry.maxHp : 0
  const hullColor = dead
    ? '#ff7b72'
    : hullPct < 0.35
      ? '#ffa657'
      : '#7ee787'
  const heatColor = telemetry?.overheated
    ? '#ff7b72'
    : (telemetry?.heat ?? 0) > 0.75
      ? '#ffa657'
      : '#ff6a4a'
  const plating = armorTierLabel(armorTier)

  return (
    <div
      style={{
        position: 'absolute',
        left: 16,
        bottom: 16,
        color: '#c9d1d9',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 13,
        lineHeight: 1.45,
        pointerEvents: 'none',
        userSelect: 'none',
        textShadow: '0 1px 4px rgba(0,0,0,0.85)',
        zIndex: 6,
        minWidth: 168,
      }}
    >
      {telemetry && (
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              color: hullColor,
              marginBottom: 3,
            }}
          >
            <span>
              HULL {Math.round(telemetry.hp)}/{Math.round(telemetry.maxHp)}
            </span>
            <span
              style={{
                color: 'rgba(201, 209, 217, 0.45)',
                fontSize: 11,
              }}
            >
              {armorTier > 0
                ? `T${armorTier}/${ARMOR_MAX_TIER}`
                : 'STOCK'}
            </span>
          </div>
          <Meter value={hullPct} color={hullColor} />
          <div
            style={{
              marginTop: 2,
              fontSize: 11,
              color: 'rgba(201, 209, 217, 0.4)',
            }}
          >
            {plating}
          </div>

          <div
            style={{
              marginTop: 10,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '2px 14px',
            }}
          >
            <div>
              <span style={{ color: 'rgba(201, 209, 217, 0.45)' }}>SPD </span>
              {telemetry.speed.toFixed(0)}
            </div>
            <div>
              <span style={{ color: 'rgba(201, 209, 217, 0.45)' }}>ALT </span>
              {telemetry.altitude.toFixed(0)}
            </div>
          </div>
          {telemetry.nearBody ? (
            <div
              style={{
                marginTop: 4,
                color:
                  telemetry.nearBodyKind === 'moon' ? '#b8d4e8' : '#9ad8ff',
                fontSize: 12,
                letterSpacing: '0.04em',
              }}
            >
              <span style={{ color: 'rgba(201, 209, 217, 0.45)' }}>
                {telemetry.nearBodyKind === 'moon' ? 'MOON ' : 'NEAR '}
              </span>
              {telemetry.nearBody}
            </div>
          ) : null}

          <div style={{ marginTop: 10, marginBottom: 3 }}>
            <div
              style={{
                color: heatColor,
                marginBottom: 3,
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <span>
                {telemetry.overheated
                  ? 'GUNS OVERHEAT'
                  : `GUNS ${Math.round(telemetry.heat * 100)}%`}
              </span>
            </div>
            <Meter value={telemetry.heat} color={heatColor} />
          </div>

          {telemetry.torpedoOwned ? (
            <div
              style={{
                marginTop: 8,
                color:
                  telemetry.torpedoAmmo <= 0
                    ? 'rgba(201, 209, 217, 0.4)'
                    : telemetry.torpedoLock >= 1
                      ? '#7dffc8'
                      : '#5ad0ff',
              }}
            >
              TPD {telemetry.torpedoAmmo}/{telemetry.torpedoMaxAmmo}
              {telemetry.torpedoAmmo > 0 &&
                (telemetry.torpedoLock >= 1
                  ? ' · LOCK'
                  : telemetry.torpedoLock > 0.05
                    ? ` · ${Math.round(telemetry.torpedoLock * 100)}%`
                    : '')}
            </div>
          ) : (
            <div
              style={{
                marginTop: 8,
                color: 'rgba(201, 209, 217, 0.35)',
              }}
            >
              TPD — none
            </div>
          )}

          {telemetry.thrusterOwned ? (
            <div
              style={{
                marginTop: 6,
                color: telemetry.thrusterActive ? '#9ef0c8' : '#7dffc8',
              }}
            >
              {telemetry.thrusterActive
                ? 'BURN · NO STEER · C cut'
                : 'THR ready · C'}
            </div>
          ) : null}

          <div
            style={{
              marginTop: 8,
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <span style={{ color: '#ffd78a' }}>
              ₡ {formatCredits(credits)}
            </span>
            <span
              style={{
                color: hold > 0 ? '#c4a574' : 'rgba(201, 209, 217, 0.4)',
              }}
            >
              HOLD {hold}
            </span>
          </div>
          {hold > 0 && (
            <div
              style={{
                marginTop: 2,
                fontSize: 11,
                color: 'rgba(196, 165, 116, 0.7)',
              }}
            >
              {cargo.ore} ore · {cargo.ice} ice · {cargo.alloy} alloy
              <span style={{ color: 'rgba(201, 209, 217, 0.4)' }}>
                {' '}
                · J dump
              </span>
            </div>
          )}

          {(telemetry.speedBuff > 0 || telemetry.fireBuff > 0) && (
            <div style={{ marginTop: 8 }}>
              {telemetry.speedBuff > 0 && (
                <div style={{ color: '#5cffd0' }}>
                  SPD + {telemetry.speedBuff.toFixed(1)}s
                </div>
              )}
              {telemetry.fireBuff > 0 && (
                <div style={{ color: '#ffc14a' }}>
                  RATE ×2 {telemetry.fireBuff.toFixed(1)}s
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <div style={{ color: 'rgba(201, 209, 217, 0.45)', fontSize: 12 }}>
        M map · Esc pause · T torpedo · J dump
      </div>
    </div>
  )
}
