import {
  MATERIAL_KINDS,
  MATERIAL_LABEL,
  MATERIAL_PRICE,
  cargoUnits,
  cargoValue,
  formatCredits,
  type CargoHold,
  type MaterialKind,
} from '@/loot/economy'

type StationMenuProps = {
  stationName?: string
  credits: number
  cargo: CargoHold
  onSell: (kind: MaterialKind) => void
  onSellAll: () => void
  onUndock: () => void
}

const font = "'Share Tech Mono', ui-monospace, monospace"

function Corner({
  top,
  left,
  right,
  bottom,
}: {
  top?: boolean
  left?: boolean
  right?: boolean
  bottom?: boolean
}) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        width: 22,
        height: 22,
        top: top ? 10 : undefined,
        bottom: bottom ? 10 : undefined,
        left: left ? 10 : undefined,
        right: right ? 10 : undefined,
        borderTop: top ? '2px solid rgba(120, 210, 255, 0.85)' : undefined,
        borderBottom: bottom ? '2px solid rgba(120, 210, 255, 0.85)' : undefined,
        borderLeft: left ? '2px solid rgba(120, 210, 255, 0.85)' : undefined,
        borderRight: right ? '2px solid rgba(120, 210, 255, 0.85)' : undefined,
      }}
    />
  )
}

export function StationMenu({
  stationName = 'Thalassa Station',
  credits,
  cargo,
  onSell,
  onSellAll,
  onUndock,
}: StationMenuProps) {
  const units = cargoUnits(cargo)
  const holdValue = cargoValue(cargo)

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 22,
        display: 'grid',
        placeItems: 'center',
        padding: 12,
        fontFamily: font,
        color: '#d7e6df',
        userSelect: 'none',
        background: `
          radial-gradient(ellipse 70% 55% at 50% 42%, rgba(10, 24, 40, 0.4) 0%, rgba(0, 0, 0, 0.78) 70%),
          linear-gradient(180deg, rgba(0,0,0,0.55) 0%, transparent 18%, transparent 82%, rgba(0,0,0,0.7) 100%)
        `,
      }}
    >
      <style>{`
        @keyframes stationBlink {
          0%, 40% { opacity: 1; }
          50%, 90% { opacity: 0.25; }
          100% { opacity: 1; }
        }
        @keyframes stationScan {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
        .station-btn:hover {
          background: rgba(120, 210, 255, 0.22) !important;
          box-shadow: inset 0 0 0 1px rgba(120, 210, 255, 0.75),
            0 0 18px rgba(120, 210, 255, 0.18);
        }
        .station-btn:active {
          background: rgba(120, 210, 255, 0.3) !important;
        }
        .station-btn:disabled {
          opacity: 0.35;
          cursor: default !important;
          box-shadow: none !important;
          background: rgba(120, 210, 255, 0.05) !important;
        }
        .sell-btn:hover:not(:disabled) {
          background: rgba(255, 196, 92, 0.22) !important;
          box-shadow: inset 0 0 0 1px rgba(255, 196, 92, 0.7);
        }
        .station-mfd-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
          gap: clamp(24px, 4vw, 56px);
          align-items: start;
          flex: 1;
          min-height: 0;
        }
        @media (max-width: 820px) {
          .station-mfd-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: `
            linear-gradient(90deg, rgba(0,0,0,0.65) 0%, transparent 12%, transparent 88%, rgba(0,0,0,0.65) 100%),
            linear-gradient(0deg, rgba(0,0,0,0.55) 0%, transparent 14%, transparent 86%, rgba(0,0,0,0.5) 100%)
          `,
        }}
      />

      <div
        style={{
          position: 'relative',
          width: 'calc(100vw - 40px)',
          height: 'calc(100vh - 40px)',
          maxWidth: 1400,
          overflow: 'auto',
          borderRadius: 6,
          border: '3px solid #152028',
          boxShadow: `
            0 0 0 1px rgba(120, 210, 255, 0.28),
            0 0 0 8px #080c10,
            0 0 0 9px rgba(120, 210, 255, 0.12),
            0 30px 80px rgba(0, 0, 0, 0.75),
            inset 0 0 60px rgba(0, 30, 50, 0.35)
          `,
          background:
            'linear-gradient(180deg, rgba(14, 28, 40, 0.95) 0%, rgba(5, 10, 16, 0.97) 100%)',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            opacity: 0.12,
            background:
              'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.45) 2px, rgba(0,0,0,0.45) 4px)',
            zIndex: 2,
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            overflow: 'hidden',
            zIndex: 2,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              height: '35%',
              background:
                'linear-gradient(180deg, transparent, rgba(120, 200, 255, 0.06), transparent)',
              animation: 'stationScan 5.5s linear infinite',
            }}
          />
        </div>

        <Corner top left />
        <Corner top right />
        <Corner bottom left />
        <Corner bottom right />

        <div
          style={{
            position: 'relative',
            zIndex: 1,
            padding: 'clamp(22px, 3vh, 36px) clamp(24px, 3vw, 48px)',
            height: '100%',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              marginBottom: 18,
              paddingBottom: 12,
              borderBottom: '1px solid rgba(120, 190, 230, 0.2)',
              fontSize: 12,
              letterSpacing: '0.14em',
              color: 'rgba(160, 200, 230, 0.75)',
            }}
          >
            <span>DOCK-MFD · COMMERCE</span>
            <span
              style={{
                color: '#7ec8ff',
                animation: 'stationBlink 1.6s step-end infinite',
              }}
            >
              ● HARD-DOCK
            </span>
            <span>ATC CLEAR</span>
          </div>

          <div className="station-mfd-grid">
            <div>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: '0.2em',
                  color: 'rgba(120, 210, 255, 0.75)',
                  marginBottom: 8,
                }}
              >
                ORBITAL PLATFORM
              </div>
              <h1
                style={{
                  margin: '0 0 10px',
                  fontSize: 'clamp(28px, 4.5vw, 48px)',
                  fontWeight: 400,
                  letterSpacing: '0.1em',
                  color: '#c8e8ff',
                  textShadow: '0 0 18px rgba(120, 210, 255, 0.28)',
                }}
              >
                {stationName.toUpperCase()}
              </h1>
              <p
                style={{
                  margin: '0 0 28px',
                  fontSize: 'clamp(14px, 1.4vw, 17px)',
                  lineHeight: 1.5,
                  color: 'rgba(180, 210, 230, 0.75)',
                  letterSpacing: '0.04em',
                  maxWidth: 440,
                }}
              >
                Sell belt haulage at the commodity desk, then undock when ready.
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10,
                  marginBottom: 28,
                }}
              >
                <div
                  style={{
                    border: '1px solid rgba(255, 196, 92, 0.35)',
                    background: 'rgba(0, 0, 0, 0.28)',
                    padding: '12px 14px',
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: '0.18em',
                      color: 'rgba(255, 196, 92, 0.65)',
                      marginBottom: 6,
                    }}
                  >
                    CREDITS
                  </div>
                  <div style={{ fontSize: 22, color: '#ffd78a' }}>
                    ₡ {formatCredits(credits)}
                  </div>
                </div>
                <div
                  style={{
                    border: '1px solid rgba(120, 190, 230, 0.25)',
                    background: 'rgba(0, 0, 0, 0.28)',
                    padding: '12px 14px',
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: '0.18em',
                      color: 'rgba(160, 200, 230, 0.55)',
                      marginBottom: 6,
                    }}
                  >
                    HOLD VALUE
                  </div>
                  <div style={{ fontSize: 22, color: '#9ed8ff' }}>
                    ₡ {formatCredits(holdValue)}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="station-btn"
                onClick={onUndock}
                style={{
                  appearance: 'none',
                  width: '100%',
                  border: '1px solid rgba(120, 210, 255, 0.75)',
                  background: 'rgba(120, 210, 255, 0.1)',
                  color: '#b8e0ff',
                  padding: '16px 22px',
                  fontSize: 16,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  fontFamily: font,
                  cursor: 'pointer',
                  boxShadow: 'inset 0 0 0 1px rgba(120, 210, 255, 0.2)',
                }}
              >
                ▲  Undock / Jettison
              </button>
              <p
                style={{
                  margin: '12px 0 0',
                  fontSize: 12,
                  color: 'rgba(160, 200, 230, 0.5)',
                  letterSpacing: '0.06em',
                }}
              >
                Safety push clears the berth before free flight resumes
              </p>
            </div>

            <div
              style={{
                border: '1px solid rgba(120, 190, 230, 0.22)',
                background: 'rgba(0, 8, 14, 0.45)',
                padding: '16px 18px 14px',
                height: '100%',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 11,
                  letterSpacing: '0.18em',
                  color: 'rgba(160, 200, 230, 0.55)',
                  marginBottom: 12,
                  paddingBottom: 10,
                  borderBottom: '1px dashed rgba(120, 190, 230, 0.2)',
                }}
              >
                <span>CARGO EXCHANGE</span>
                <span>{units} UNITS</span>
              </div>

              <div style={{ flex: 1 }}>
                {MATERIAL_KINDS.map((kind) => {
                  const qty = cargo[kind]
                  const unitPrice = MATERIAL_PRICE[kind]
                  const line = qty * unitPrice
                  return (
                    <div
                      key={kind}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto auto',
                        gap: 12,
                        alignItems: 'center',
                        padding: '10px 0',
                        borderBottom: '1px solid rgba(120, 190, 230, 0.08)',
                        fontSize: 'clamp(13px, 1.2vw, 15px)',
                      }}
                    >
                      <div>
                        <div style={{ color: '#c8e8ff' }}>
                          {MATERIAL_LABEL[kind]}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: 'rgba(160, 200, 230, 0.5)',
                            marginTop: 2,
                          }}
                        >
                          ×{qty} · ₡{unitPrice}/u
                        </div>
                      </div>
                      <div style={{ color: '#ffd78a', minWidth: 64 }}>
                        ₡ {formatCredits(line)}
                      </div>
                      <button
                        type="button"
                        className="station-btn sell-btn"
                        disabled={qty <= 0}
                        onClick={() => onSell(kind)}
                        style={{
                          appearance: 'none',
                          border: '1px solid rgba(255, 196, 92, 0.55)',
                          background: 'rgba(255, 196, 92, 0.08)',
                          color: '#ffd78a',
                          padding: '8px 12px',
                          fontSize: 12,
                          letterSpacing: '0.12em',
                          textTransform: 'uppercase',
                          fontFamily: font,
                          cursor: qty > 0 ? 'pointer' : 'default',
                        }}
                      >
                        Sell
                      </button>
                    </div>
                  )
                })}
              </div>

              <button
                type="button"
                className="station-btn sell-btn"
                disabled={units <= 0}
                onClick={onSellAll}
                style={{
                  appearance: 'none',
                  width: '100%',
                  marginTop: 16,
                  border: '1px solid rgba(255, 196, 92, 0.7)',
                  background: 'rgba(255, 196, 92, 0.12)',
                  color: '#ffd78a',
                  padding: '14px 18px',
                  fontSize: 14,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  fontFamily: font,
                  cursor: units > 0 ? 'pointer' : 'default',
                }}
              >
                Sell all · ₡ {formatCredits(holdValue)}
              </button>
            </div>
          </div>

          <div
            style={{
              marginTop: 18,
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 11,
              letterSpacing: '0.12em',
              color: 'rgba(160, 200, 230, 0.4)',
            }}
          >
            <span>DRIFTR · DOCKED</span>
            <span>HOLD M · SYSTEM MAP</span>
          </div>
        </div>
      </div>
    </div>
  )
}
