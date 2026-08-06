import { useEffect, useState } from 'react'
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
import {
  ARMOR_MAX_TIER,
  ARMOR_TIERS,
  SENSOR_MOD_ID,
  SENSOR_SHOP,
  SENSOR_UNLOCK_COST,
  THRUSTER_MOD_ID,
  THRUSTER_SHOP,
  THRUSTER_UNLOCK_COST,
  TORPEDO_MAX_AMMO,
  TORPEDO_RELOAD_ID,
  TORPEDO_WEAPON_ID,
  WEAPON_SHOP,
  canBuySensorUnlock,
  canBuyThrusterUnlock,
  canBuyTorpedoReload,
  canBuyTorpedoUnlock,
  missingHp,
  repairCost,
  torpedoReloadSlots,
  type StationDesk,
} from '@/loot/shop'
import {
  GHOST_BERTH_LABEL,
  GHOST_BERTH_PLAQUE,
  NYX_COM_GHOST,
  rollNyxComGhost,
} from '@/lore/easterEggs'
import { CommsPortrait } from '@/ui/CommsPortrait'

type StationMenuProps = {
  stationName?: string
  credits: number
  cargo: CargoHold
  hp: number
  maxHp: number
  armorTier: number
  torpedoOwned: boolean
  torpedoAmmo: number
  thrusterOwned: boolean
  sensorsOwned: boolean
  /** Rare decommissioned Nyx transit pad ghost label */
  ghostBerth?: boolean
  /** Whisper unlocks COM ghost eligibility even without ghost berth */
  nyxWhisperHeard?: boolean
  /** Natural Nyx clue found — ATC Ask about Nyx */
  nyxTopicUnlocked?: boolean
  /** Kronos ATC already pointed you at Hyperion */
  nyxHyperionLead?: boolean
  onSell: (kind: MaterialKind) => void
  onSellAll: () => void
  onRepair: () => void
  onBuy: (id: string) => void
  onUndock: () => void
  /** COM ghost / topic unlock from dock-side lore rolls */
  onNyxTopicClue?: () => void
  onKronosLead?: () => void
}

const font = "'Share Tech Mono', ui-monospace, monospace"

const DESKS: { id: StationDesk; label: string }[] = [
  { id: 'cargo', label: 'Cargo' },
  { id: 'services', label: 'Services' },
]

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
  hp,
  maxHp,
  armorTier,
  torpedoOwned,
  torpedoAmmo,
  thrusterOwned,
  sensorsOwned,
  ghostBerth = false,
  nyxWhisperHeard = false,
  nyxTopicUnlocked = false,
  nyxHyperionLead = false,
  onSell,
  onSellAll,
  onRepair,
  onBuy,
  onUndock,
  onNyxTopicClue,
  onKronosLead,
}: StationMenuProps) {
  const [desk, setDesk] = useState<StationDesk>('cargo')
  const [plaqueOpen, setPlaqueOpen] = useState(false)
  const [comGhost, setComGhost] = useState<string | null>(null)
  const units = cargoUnits(cargo)
  const holdValue = cargoValue(cargo)
  const damage = missingHp(hp, maxHp)
  const cost = repairCost(hp, maxHp)
  const hullPct = maxHp > 0 ? Math.round((hp / maxHp) * 100) : 0
  const canRepair = damage > 0 && credits >= cost
  const reloadSlots = torpedoReloadSlots(torpedoAmmo)

  useEffect(() => {
    if (!(ghostBerth || nyxWhisperHeard)) return
    if (!rollNyxComGhost()) return
    setComGhost(NYX_COM_GHOST)
    onNyxTopicClue?.()
    const hide = window.setTimeout(() => setComGhost(null), 6500)
    return () => window.clearTimeout(hide)
  }, [ghostBerth, nyxWhisperHeard, onNyxTopicClue])

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
          0% { top: -35%; }
          100% { top: 100%; }
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
        .repair-btn:hover:not(:disabled) {
          background: rgba(120, 255, 180, 0.2) !important;
          box-shadow: inset 0 0 0 1px rgba(120, 255, 180, 0.65);
        }
        .weapon-btn:hover:not(:disabled) {
          background: rgba(90, 208, 255, 0.2) !important;
          box-shadow: inset 0 0 0 1px rgba(90, 208, 255, 0.65);
        }
        .armor-btn:hover:not(:disabled) {
          background: rgba(200, 170, 120, 0.22) !important;
          box-shadow: inset 0 0 0 1px rgba(220, 190, 140, 0.65);
        }
        .station-desk-tab {
          appearance: none;
          border: 1px solid rgba(120, 190, 230, 0.22);
          background: rgba(0, 0, 0, 0.2);
          color: rgba(160, 200, 230, 0.55);
          padding: 8px 14px;
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          font-family: ${font};
          cursor: pointer;
        }
        .station-desk-tab[data-active="true"] {
          color: #b8e0ff;
          border-color: rgba(120, 210, 255, 0.55);
          background: rgba(120, 210, 255, 0.12);
        }
        .station-desk-tab:hover:not([data-active="true"]) {
          color: rgba(200, 230, 255, 0.85);
          border-color: rgba(120, 210, 255, 0.4);
        }
        .station-mfd-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
          gap: clamp(24px, 4vw, 56px);
          align-items: stretch;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }
        .station-desk-scroll {
          flex: 1;
          min-height: 0;
          overflow: auto;
          padding-right: 12px;
        }
        @media (max-width: 820px) {
          .station-mfd-grid {
            grid-template-columns: 1fr;
            overflow: auto;
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
          overflow: 'hidden',
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
              flexShrink: 0,
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

          {comGhost && (
            <div
              style={{
                flexShrink: 0,
                marginBottom: 14,
                padding: '8px 12px',
                border: '1px solid rgba(140, 120, 180, 0.35)',
                background: 'rgba(12, 8, 20, 0.55)',
                fontSize: 11,
                letterSpacing: '0.08em',
                color: 'rgba(190, 175, 230, 0.78)',
                fontStyle: 'italic',
              }}
            >
              COM · INTERCEPT — {comGhost}
            </div>
          )}

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
                  margin: '0 0 18px',
                  fontSize: 'clamp(14px, 1.4vw, 17px)',
                  lineHeight: 1.5,
                  color: 'rgba(180, 210, 230, 0.75)',
                  letterSpacing: '0.04em',
                  maxWidth: 440,
                }}
              >
                Sell haulage, repair the hull, outfit weapons, then undock when
                ready.
              </p>

              <CommsPortrait
                stationName={stationName}
                nyxTopicUnlocked={nyxTopicUnlocked}
                nyxHyperionLead={nyxHyperionLead}
                nyxWhisperHeard={nyxWhisperHeard}
                onKronosLead={onKronosLead}
              />

              {ghostBerth && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    marginBottom: 28,
                    fontSize: 10,
                    letterSpacing: '0.14em',
                  }}
                >
                  {(['01', '02', '03'] as const).map((pad) => (
                    <span
                      key={pad}
                      style={{
                        border: '1px solid rgba(120, 190, 230, 0.28)',
                        padding: '5px 10px',
                        color: 'rgba(160, 200, 230, 0.65)',
                        background: 'rgba(0, 0, 0, 0.22)',
                      }}
                    >
                      BERTH {pad} · OPEN
                    </span>
                  ))}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={() => setPlaqueOpen((v) => !v)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setPlaqueOpen((v) => !v)
                      }
                    }}
                    style={{
                      border: '1px solid rgba(120, 100, 160, 0.28)',
                      padding: '5px 10px',
                      background: 'rgba(12, 8, 20, 0.35)',
                      color: 'rgba(150, 130, 190, 0.55)',
                      textDecoration: plaqueOpen ? 'none' : 'line-through',
                      textDecorationColor: 'rgba(120, 100, 160, 0.35)',
                      animation: 'stationBlink 2.4s step-end infinite',
                      cursor: 'pointer',
                    }}
                  >
                    {plaqueOpen
                      ? `BERTH 04 · ${GHOST_BERTH_PLAQUE}`
                      : `BERTH 04 · ${GHOST_BERTH_LABEL}`}
                  </span>
                </div>
              )}

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
                    HULL
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      color: hullPct < 35 ? '#ff8a8a' : '#9ef0c8',
                    }}
                  >
                    {Math.round(hp)} / {Math.round(maxHp)}
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
                minHeight: 0,
                height: '100%',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  marginBottom: 14,
                }}
              >
                {DESKS.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className="station-desk-tab"
                    data-active={desk === d.id}
                    onClick={() => setDesk(d.id)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              {desk === 'cargo' ? (
                <>
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

                  <div className="station-desk-scroll">
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
                </>
              ) : (
                <>
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
                    <span>STATION SERVICES</span>
                    <span>BAY 03</span>
                  </div>

                  <div className="station-desk-scroll">
                    <div
                      style={{
                        padding: '14px 0',
                        borderBottom: '1px solid rgba(120, 190, 230, 0.08)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 12,
                          alignItems: 'baseline',
                          marginBottom: 8,
                        }}
                      >
                        <div style={{ color: '#c8e8ff', fontSize: 16 }}>
                          Hull repair
                        </div>
                        <div style={{ color: '#ffd78a', fontSize: 15 }}>
                          {damage > 0
                            ? `₡ ${formatCredits(cost)}`
                            : 'NO CHARGE'}
                        </div>
                      </div>
                      <p
                        style={{
                          margin: '0 0 12px',
                          fontSize: 13,
                          lineHeight: 1.45,
                          color: 'rgba(160, 200, 230, 0.55)',
                          letterSpacing: '0.03em',
                        }}
                      >
                        {damage > 0
                          ? `Restore ${damage} integrity · ${hullPct}% hull remaining`
                          : 'Hull plates are nominal — no bay work required.'}
                      </p>
                      <div
                        aria-hidden
                        style={{
                          height: 6,
                          marginBottom: 14,
                          background: 'rgba(0, 0, 0, 0.45)',
                          border: '1px solid rgba(120, 190, 230, 0.2)',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.max(0, Math.min(100, hullPct))}%`,
                            background:
                              hullPct < 35
                                ? 'linear-gradient(90deg, #c04040, #ff8a8a)'
                                : 'linear-gradient(90deg, #2a8a5a, #9ef0c8)',
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        className="station-btn repair-btn"
                        disabled={!canRepair}
                        onClick={onRepair}
                        style={{
                          appearance: 'none',
                          width: '100%',
                          border: '1px solid rgba(120, 255, 180, 0.55)',
                          background: 'rgba(120, 255, 180, 0.1)',
                          color: '#9ef0c8',
                          padding: '12px 16px',
                          fontSize: 13,
                          letterSpacing: '0.14em',
                          textTransform: 'uppercase',
                          fontFamily: font,
                          cursor: canRepair ? 'pointer' : 'default',
                        }}
                      >
                        {damage <= 0
                          ? 'Hull intact'
                          : credits < cost
                            ? 'Insufficient credits'
                            : `Repair hull · ₡ ${formatCredits(cost)}`}
                      </button>
                    </div>

                    <div
                      style={{
                        marginTop: 16,
                        paddingTop: 14,
                        borderTop: '1px dashed rgba(120, 190, 230, 0.2)',
                        fontSize: 11,
                        letterSpacing: '0.18em',
                        color: 'rgba(160, 200, 230, 0.55)',
                        marginBottom: 8,
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>ARMOR</span>
                      <span>
                        {armorTier >= ARMOR_MAX_TIER
                          ? 'MAX PLATING'
                          : `TIER ${armorTier}/${ARMOR_MAX_TIER}`}
                      </span>
                    </div>

                    {ARMOR_TIERS.map((tier) => {
                      const owned = armorTier >= tier.tier
                      const isNext = armorTier + 1 === tier.tier
                      const canBuy =
                        isNext && credits >= tier.cost
                      let status = `₡ ${formatCredits(tier.cost)}`
                      let buttonLabel = `Install · ₡ ${formatCredits(tier.cost)}`
                      if (owned) {
                        status = `${tier.maxHp} HP`
                        buttonLabel = 'Installed'
                      } else if (!isNext) {
                        status = 'LOCKED'
                        buttonLabel = 'Requires prior tier'
                      } else if (credits < tier.cost) {
                        buttonLabel = 'Insufficient credits'
                      }

                      return (
                        <div
                          key={tier.id}
                          style={{
                            padding: '14px 0',
                            borderBottom:
                              '1px solid rgba(120, 190, 230, 0.08)',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: 12,
                              alignItems: 'baseline',
                              marginBottom: 8,
                            }}
                          >
                            <div style={{ color: '#c8e8ff', fontSize: 16 }}>
                              {tier.label}
                            </div>
                            <div
                              style={{
                                color: owned ? '#9ef0c8' : '#ffd78a',
                                fontSize: 15,
                              }}
                            >
                              {status}
                            </div>
                          </div>
                          <p
                            style={{
                              margin: '0 0 12px',
                              fontSize: 13,
                              lineHeight: 1.45,
                              color: 'rgba(160, 200, 230, 0.55)',
                              letterSpacing: '0.03em',
                            }}
                          >
                            {tier.blurb}
                            {isNext
                              ? ' Bonus integrity is applied on install.'
                              : ''}
                          </p>
                          <button
                            type="button"
                            className="station-btn armor-btn"
                            disabled={!canBuy}
                            onClick={() => onBuy(tier.id)}
                            style={{
                              appearance: 'none',
                              width: '100%',
                              border: '1px solid rgba(220, 190, 140, 0.55)',
                              background: 'rgba(200, 170, 120, 0.1)',
                              color: '#e8d0a8',
                              padding: '12px 16px',
                              fontSize: 13,
                              letterSpacing: '0.14em',
                              textTransform: 'uppercase',
                              fontFamily: font,
                              cursor: canBuy ? 'pointer' : 'default',
                            }}
                          >
                            {buttonLabel}
                          </button>
                        </div>
                      )
                    })}

                    <div
                      style={{
                        marginTop: 16,
                        paddingTop: 14,
                        borderTop: '1px dashed rgba(120, 190, 230, 0.2)',
                        fontSize: 11,
                        letterSpacing: '0.18em',
                        color: 'rgba(160, 200, 230, 0.55)',
                        marginBottom: 8,
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>PROPULSION</span>
                      <span>
                        {thrusterOwned ? 'ADV THRUSTER' : 'STOCK DRIVES'}
                      </span>
                    </div>

                    {THRUSTER_SHOP.map((item) => {
                      const owned = item.id === THRUSTER_MOD_ID && thrusterOwned
                      const canBuy = canBuyThrusterUnlock(
                        credits,
                        thrusterOwned,
                      )
                      let status = `₡ ${formatCredits(item.cost ?? THRUSTER_UNLOCK_COST)}`
                      let buttonLabel = 'Purchase'
                      if (owned) {
                        status = 'INSTALLED'
                        buttonLabel = 'Owned'
                      } else if (!canBuy && (item.cost ?? 0) > credits) {
                        buttonLabel = 'Insufficient credits'
                      } else {
                        buttonLabel = `Install · ₡ ${formatCredits(item.cost ?? 0)}`
                      }

                      return (
                        <div
                          key={item.id}
                          style={{
                            padding: '14px 0',
                            borderBottom: '1px solid rgba(120, 190, 230, 0.08)',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: 12,
                              alignItems: 'baseline',
                              marginBottom: 8,
                            }}
                          >
                            <div style={{ color: '#c8e8ff', fontSize: 16 }}>
                              {item.label}
                            </div>
                            <div
                              style={{
                                color: owned ? '#9ef0c8' : '#ffd78a',
                                fontSize: 15,
                              }}
                            >
                              {status}
                            </div>
                          </div>
                          <p
                            style={{
                              margin: '0 0 12px',
                              fontSize: 13,
                              lineHeight: 1.45,
                              color: 'rgba(160, 200, 230, 0.55)',
                              letterSpacing: '0.03em',
                            }}
                          >
                            {item.blurb} Bind: C.
                          </p>
                          <button
                            type="button"
                            className="station-btn weapon-btn"
                            disabled={!canBuy}
                            onClick={() => onBuy(item.id)}
                            style={{
                              appearance: 'none',
                              width: '100%',
                              border: '1px solid rgba(90, 208, 255, 0.55)',
                              background: 'rgba(90, 208, 255, 0.1)',
                              color: '#9ad8ff',
                              padding: '12px 16px',
                              fontSize: 13,
                              letterSpacing: '0.14em',
                              textTransform: 'uppercase',
                              fontFamily: font,
                              cursor: canBuy ? 'pointer' : 'default',
                            }}
                          >
                            {buttonLabel}
                          </button>
                        </div>
                      )
                    })}

                    <div
                      style={{
                        marginTop: 16,
                        paddingTop: 14,
                        borderTop: '1px dashed rgba(120, 190, 230, 0.2)',
                        fontSize: 11,
                        letterSpacing: '0.18em',
                        color: 'rgba(160, 200, 230, 0.55)',
                        marginBottom: 8,
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>SENSORS</span>
                      <span>
                        {sensorsOwned ? 'LONG-RANGE' : 'STOCK ARRAY'}
                      </span>
                    </div>

                    {SENSOR_SHOP.map((item) => {
                      const owned = item.id === SENSOR_MOD_ID && sensorsOwned
                      const canBuy = canBuySensorUnlock(credits, sensorsOwned)
                      let status = `₡ ${formatCredits(item.cost ?? SENSOR_UNLOCK_COST)}`
                      let buttonLabel = 'Purchase'
                      if (owned) {
                        status = 'INSTALLED'
                        buttonLabel = 'Owned'
                      } else if (!canBuy && (item.cost ?? 0) > credits) {
                        buttonLabel = 'Insufficient credits'
                      } else {
                        buttonLabel = `Install · ₡ ${formatCredits(item.cost ?? 0)}`
                      }

                      return (
                        <div
                          key={item.id}
                          style={{
                            padding: '14px 0',
                            borderBottom: '1px solid rgba(120, 190, 230, 0.08)',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: 12,
                              alignItems: 'baseline',
                              marginBottom: 8,
                            }}
                          >
                            <div style={{ color: '#c8e8ff', fontSize: 16 }}>
                              {item.label}
                            </div>
                            <div
                              style={{
                                color: owned ? '#9ef0c8' : '#ffd78a',
                                fontSize: 15,
                              }}
                            >
                              {status}
                            </div>
                          </div>
                          <p
                            style={{
                              margin: '0 0 12px',
                              fontSize: 13,
                              lineHeight: 1.45,
                              color: 'rgba(160, 200, 230, 0.55)',
                              letterSpacing: '0.03em',
                            }}
                          >
                            {item.blurb}
                          </p>
                          <button
                            type="button"
                            className="station-btn weapon-btn"
                            disabled={!canBuy}
                            onClick={() => onBuy(item.id)}
                            style={{
                              appearance: 'none',
                              width: '100%',
                              border: '1px solid rgba(160, 220, 180, 0.55)',
                              background: 'rgba(120, 210, 160, 0.1)',
                              color: '#9ef0c8',
                              padding: '12px 16px',
                              fontSize: 13,
                              letterSpacing: '0.14em',
                              textTransform: 'uppercase',
                              fontFamily: font,
                              cursor: canBuy ? 'pointer' : 'default',
                            }}
                          >
                            {buttonLabel}
                          </button>
                        </div>
                      )
                    })}

                    <div
                      style={{
                        marginTop: 16,
                        paddingTop: 14,
                        borderTop: '1px dashed rgba(120, 190, 230, 0.2)',
                        fontSize: 11,
                        letterSpacing: '0.18em',
                        color: 'rgba(160, 200, 230, 0.55)',
                        marginBottom: 8,
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>ORDNANCE</span>
                      <span>
                        {torpedoOwned
                          ? `${torpedoAmmo}/${TORPEDO_MAX_AMMO} TUBES`
                          : 'NO LAUNCHER'}
                      </span>
                    </div>

                    {WEAPON_SHOP.map((item) => {
                      const isUnlock = item.id === TORPEDO_WEAPON_ID
                      const isReload = item.id === TORPEDO_RELOAD_ID
                      const ownedUnlock = isUnlock && torpedoOwned
                      const canBuy = isUnlock
                        ? canBuyTorpedoUnlock(credits, torpedoOwned)
                        : isReload
                          ? canBuyTorpedoReload(
                              credits,
                              torpedoOwned,
                              torpedoAmmo,
                            )
                          : false
                      let status = `₡ ${formatCredits(item.cost ?? 0)}`
                      let buttonLabel = 'Purchase'
                      if (ownedUnlock) {
                        status = 'INSTALLED'
                        buttonLabel = 'Owned'
                      } else if (isReload && !torpedoOwned) {
                        status = 'REQUIRES LAUNCHER'
                        buttonLabel = 'Locked'
                      } else if (isReload && reloadSlots <= 0) {
                        status = 'MAGAZINES FULL'
                        buttonLabel = 'Full'
                      } else if (!canBuy && (item.cost ?? 0) > credits) {
                        buttonLabel = 'Insufficient credits'
                      } else if (isReload) {
                        buttonLabel = `Reload +1 · ₡ ${formatCredits(item.cost ?? 0)}`
                      } else if (isUnlock) {
                        buttonLabel = `Install · ₡ ${formatCredits(item.cost ?? 0)}`
                      }

                      return (
                        <div
                          key={item.id}
                          style={{
                            padding: '14px 0',
                            borderBottom: '1px solid rgba(120, 190, 230, 0.08)',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: 12,
                              alignItems: 'baseline',
                              marginBottom: 8,
                            }}
                          >
                            <div style={{ color: '#c8e8ff', fontSize: 16 }}>
                              {item.label}
                            </div>
                            <div
                              style={{
                                color: ownedUnlock ? '#9ef0c8' : '#ffd78a',
                                fontSize: 15,
                              }}
                            >
                              {status}
                            </div>
                          </div>
                          <p
                            style={{
                              margin: '0 0 12px',
                              fontSize: 13,
                              lineHeight: 1.45,
                              color: 'rgba(160, 200, 230, 0.55)',
                              letterSpacing: '0.03em',
                            }}
                          >
                            {item.blurb}
                            {isUnlock && !torpedoOwned
                              ? ' Includes a full magazine.'
                              : ''}
                          </p>
                          <button
                            type="button"
                            className="station-btn weapon-btn"
                            disabled={!canBuy}
                            onClick={() => onBuy(item.id)}
                            style={{
                              appearance: 'none',
                              width: '100%',
                              border: '1px solid rgba(90, 208, 255, 0.55)',
                              background: 'rgba(90, 208, 255, 0.1)',
                              color: '#9ad8ff',
                              padding: '12px 16px',
                              fontSize: 13,
                              letterSpacing: '0.14em',
                              textTransform: 'uppercase',
                              fontFamily: font,
                              cursor: canBuy ? 'pointer' : 'default',
                            }}
                          >
                            {buttonLabel}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          <div
            style={{
              marginTop: 'auto',
              paddingTop: 18,
              flexShrink: 0,
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
