import type { OrbitalTelemetry } from '@/ship/PlayerShip'
import {
  cargoUnits,
  formatCredits,
  type CargoHold,
} from '@/loot/economy'

export function Hud({
  telemetry,
  credits,
  cargo,
}: {
  telemetry: OrbitalTelemetry | null
  credits: number
  cargo: CargoHold
}) {
  const hold = cargoUnits(cargo)
  return (
    <div
      style={{
        position: 'absolute',
        left: 16,
        bottom: 16,
        color: '#c9d1d9',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 13,
        lineHeight: 1.55,
        pointerEvents: 'none',
        userSelect: 'none',
        textShadow: '0 1px 4px rgba(0,0,0,0.85)',
        zIndex: 6,
      }}
    >
      {telemetry && (
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              color:
                telemetry.hp <= 0
                  ? '#ff7b72'
                  : telemetry.hp < telemetry.maxHp * 0.35
                    ? '#ffa657'
                    : '#7ee787',
            }}
          >
            HP {telemetry.hp} / {telemetry.maxHp}
          </div>
          <div style={{ marginTop: 6, marginBottom: 4 }}>
            <div
              style={{
                color: telemetry.overheated
                  ? '#ff7b72'
                  : telemetry.heat > 0.75
                    ? '#ffa657'
                    : '#c9d1d9',
                marginBottom: 3,
              }}
            >
              {telemetry.overheated
                ? 'OVERHEAT — cooling'
                : `Guns ${Math.round(telemetry.heat * 100)}%`}
            </div>
            <div
              style={{
                width: 140,
                height: 6,
                background: 'rgba(255,255,255,0.12)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.round(telemetry.heat * 100)}%`,
                  height: '100%',
                  background: telemetry.overheated
                    ? '#ff7b72'
                    : telemetry.heat > 0.75
                      ? '#ffa657'
                      : '#ff6a4a',
                  transition: 'width 80ms linear',
                }}
              />
            </div>
          </div>
          <div style={{ marginTop: 6, color: '#ffd78a' }}>
            ₡ {formatCredits(credits)}
          </div>
          {telemetry.torpedoOwned && (
            <div
              style={{
                marginTop: 4,
                color:
                  telemetry.torpedoAmmo <= 0
                    ? 'rgba(201, 209, 217, 0.4)'
                    : telemetry.torpedoLock >= 1
                      ? '#7dffc8'
                      : '#5ad0ff',
              }}
            >
              Torpedoes {telemetry.torpedoAmmo}/{telemetry.torpedoMaxAmmo}
              {telemetry.torpedoAmmo > 0 &&
                (telemetry.torpedoLock >= 1
                  ? ' · LOCKED — T fire'
                  : telemetry.torpedoLock > 0.05
                    ? ` · locking ${Math.round(telemetry.torpedoLock * 100)}%`
                    : ' · face foe · T')}
            </div>
          )}
          <div
            style={{
              color: hold > 0 ? '#c4a574' : 'rgba(201, 209, 217, 0.45)',
            }}
          >
            Cargo {hold}
            {hold > 0 &&
              ` · ore ${cargo.ore} · ice ${cargo.ice} · alloy ${cargo.alloy}`}
          </div>
          {(telemetry.speedBuff > 0 || telemetry.fireBuff > 0) && (
            <div style={{ marginTop: 6 }}>
              {telemetry.speedBuff > 0 && (
                <div style={{ color: '#5cffd0' }}>
                  Speed boost {telemetry.speedBuff.toFixed(1)}s
                </div>
              )}
              {telemetry.fireBuff > 0 && (
                <div style={{ color: '#ffc14a' }}>
                  Double fire-rate {telemetry.fireBuff.toFixed(1)}s
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <div style={{ color: 'rgba(201, 209, 217, 0.55)' }}>
        Hold M — map · Esc — pause
      </div>
    </div>
  )
}
