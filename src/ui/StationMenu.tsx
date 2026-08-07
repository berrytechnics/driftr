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
  TORPEDO_MAG_MAX_TIER,
  TORPEDO_MAG_TIERS,
  TORPEDO_RELOAD_ID,
  TORPEDO_WEAPON_ID,
  WEAPON_SHOP,
  canBuySensorUnlock,
  canBuyThrusterUnlock,
  canBuyTorpedoMagTier,
  canBuyTorpedoReload,
  canBuyTorpedoUnlock,
  maxAmmoForTorpedoMagTier,
  missingHp,
  repairCost,
  torpedoReloadSlots,
  type StationDesk,
} from '@/loot/shop'
import { STATION_NAMES } from '@/game/systemConfig'
import {
  VOID_SYSTEM_BADGES,
  vesperExpeditionProfile,
  voidRemnantProfile,
} from '@/lore/voidAncestors'
import {
  ALT_TUG_BERTH_LABEL,
  ALT_TUG_CREW_LOG,
  ALT_TUG_FOOTNOTE,
  ALT_TUG_OFFLINE_BLURB,
  ALT_TUG_OFFLINE_DESK_NOTE,
  ALT_TUG_OFFLINE_DESK_TITLE,
  ALT_TUG_OFFLINE_STATUS,
  GHOST_BERTH_LABEL,
  GHOST_BERTH_PLAQUE,
  NYX_BERTH_OFFLINE_LABEL,
  NYX_COM_GHOST,
  NYX_OFFLINE_BLURB,
  NYX_OFFLINE_DESK_NOTE,
  NYX_OFFLINE_DESK_TITLE,
  NYX_OFFLINE_STATUS,
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
  torpedoMagTier: number
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
  /** Saw the apo ghost pad — Kronos can clarify the belt omen */
  nyxDerelictSeen?: boolean
  onSell: (kind: MaterialKind) => void
  onSellAll: () => void
  onRepair: () => void
  onBuy: (id: string) => void
  onUndock: () => void
  /** COM ghost / topic unlock from dock-side lore rolls */
  onNyxTopicClue?: () => void
  onKronosLead?: () => void
  /** Cargo + hull repair only — no outfit desks (alternate Nyx Station). */
  limitedServices?: boolean
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
  color = 'rgba(120, 210, 255, 0.85)',
}: {
  top?: boolean
  left?: boolean
  right?: boolean
  bottom?: boolean
  color?: string
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
        borderTop: top ? `2px solid ${color}` : undefined,
        borderBottom: bottom ? `2px solid ${color}` : undefined,
        borderLeft: left ? `2px solid ${color}` : undefined,
        borderRight: right ? `2px solid ${color}` : undefined,
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
  torpedoMagTier,
  thrusterOwned,
  sensorsOwned,
  ghostBerth = false,
  nyxWhisperHeard = false,
  nyxTopicUnlocked = false,
  nyxHyperionLead = false,
  nyxDerelictSeen = false,
  onSell,
  onSellAll,
  onRepair,
  onBuy,
  onUndock,
  onNyxTopicClue,
  onKronosLead,
  limitedServices = false,
}: StationMenuProps) {
  const [desk, setDesk] = useState<StationDesk>('cargo')
  const [plaqueOpen, setPlaqueOpen] = useState(false)
  const [comGhost, setComGhost] = useState<string | null>(null)
  const voidProfile = voidRemnantProfile(stationName)
  const expeditionProfile = vesperExpeditionProfile(stationName)
  const offline =
    stationName === STATION_NAMES.nyx ||
    stationName === STATION_NAMES.nyxTug ||
    !!voidProfile ||
    !!expeditionProfile
  const isTugOffline = stationName === STATION_NAMES.nyxTug
  const isVoidOffline = !!voidProfile
  const isExpeditionOffline = !!expeditionProfile
  /** Ancestor MFD language — remnant pads or the Vesper Gatewright hull. */
  const isAncestorOffline = isVoidOffline || isExpeditionOffline
  /** Alt-system Nyx Station — berths 01–03 dark, 04 clear. */
  const isNyxAlt = stationName === STATION_NAMES.nyxAlt
  const offlineBlurb = isVoidOffline
    ? voidProfile.blurb
    : isExpeditionOffline
      ? expeditionProfile.blurb
      : isTugOffline
        ? ALT_TUG_OFFLINE_BLURB
        : NYX_OFFLINE_BLURB
  const offlineStatus = isVoidOffline
    ? voidProfile.status
    : isExpeditionOffline
      ? expeditionProfile.status
      : isTugOffline
        ? ALT_TUG_OFFLINE_STATUS
        : NYX_OFFLINE_STATUS
  const offlineDeskTitle = isVoidOffline
    ? voidProfile.deskTitle
    : isExpeditionOffline
      ? expeditionProfile.deskTitle
      : isTugOffline
        ? ALT_TUG_OFFLINE_DESK_TITLE
        : NYX_OFFLINE_DESK_TITLE
  const offlineDeskNote = isVoidOffline
    ? voidProfile.deskNote
    : isExpeditionOffline
      ? expeditionProfile.deskNote
      : isTugOffline
        ? ALT_TUG_OFFLINE_DESK_NOTE
        : NYX_OFFLINE_DESK_NOTE
  const offlinePlatformLabel = isVoidOffline
    ? voidProfile.platformLabel
    : isExpeditionOffline
      ? expeditionProfile.platformLabel
      : isTugOffline
        ? 'DERELICT HULL'
        : 'GHOST PLATFORM'
  const units = cargoUnits(cargo)
  const holdValue = cargoValue(cargo)
  const damage = missingHp(hp, maxHp)
  const cost = repairCost(hp, maxHp)
  const hullPct = maxHp > 0 ? Math.round((hp / maxHp) * 100) : 0
  const canRepair = !offline && damage > 0 && credits >= cost
  const reloadSlots = torpedoReloadSlots(
    torpedoAmmo,
    maxAmmoForTorpedoMagTier(torpedoMagTier),
  )
  const torpedoMaxAmmo = maxAmmoForTorpedoMagTier(torpedoMagTier)

  const accent = offline
    ? 'rgba(170, 150, 110, 0.55)'
    : 'rgba(120, 210, 255, 0.85)'
  const accentSoft = offline
    ? 'rgba(150, 135, 105, 0.28)'
    : 'rgba(120, 190, 230, 0.22)'
  const textMain = offline ? '#d8d0c0' : '#d7e6df'
  const textBright = offline ? '#e8e0d0' : '#c8e8ff'
  const textMuted = offline
    ? 'rgba(160, 148, 120, 0.65)'
    : 'rgba(160, 200, 230, 0.75)'
  const textFaint = offline
    ? 'rgba(140, 128, 100, 0.45)'
    : 'rgba(160, 200, 230, 0.4)'

  useEffect(() => {
    if (isAncestorOffline) return
    if (!(ghostBerth || nyxWhisperHeard)) return
    if (!rollNyxComGhost()) return
    setComGhost(NYX_COM_GHOST)
    onNyxTopicClue?.()
    const hide = window.setTimeout(() => setComGhost(null), 6500)
    return () => window.clearTimeout(hide)
  }, [ghostBerth, nyxWhisperHeard, onNyxTopicClue, isAncestorOffline])

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
        color: textMain,
        userSelect: 'none',
        background: offline
          ? `
          radial-gradient(ellipse 70% 55% at 50% 42%, rgba(24, 20, 12, 0.45) 0%, rgba(0, 0, 0, 0.82) 70%),
          linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 18%, transparent 82%, rgba(0,0,0,0.75) 100%)
        `
          : `
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
          background: ${offline ? 'rgba(170, 150, 110, 0.18)' : 'rgba(120, 210, 255, 0.22)'} !important;
          box-shadow: inset 0 0 0 1px ${offline ? 'rgba(170, 150, 110, 0.65)' : 'rgba(120, 210, 255, 0.75)'},
            0 0 18px ${offline ? 'rgba(140, 120, 80, 0.14)' : 'rgba(120, 210, 255, 0.18)'};
        }
        .station-btn:active {
          background: ${offline ? 'rgba(170, 150, 110, 0.28)' : 'rgba(120, 210, 255, 0.3)'} !important;
        }
        .station-btn:disabled {
          opacity: 0.35;
          cursor: default !important;
          box-shadow: none !important;
          background: ${offline ? 'rgba(120, 110, 90, 0.05)' : 'rgba(120, 210, 255, 0.05)'} !important;
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
          border: 1px solid ${accentSoft};
          background: rgba(0, 0, 0, 0.2);
          color: ${textFaint};
          padding: 8px 14px;
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          font-family: ${font};
          cursor: ${offline ? 'default' : 'pointer'};
        }
        .station-desk-tab[data-active="true"] {
          color: ${offline ? '#d8c8a8' : '#b8e0ff'};
          border-color: ${offline ? 'rgba(170, 150, 110, 0.45)' : 'rgba(120, 210, 255, 0.55)'};
          background: ${offline ? 'rgba(170, 150, 110, 0.1)' : 'rgba(120, 210, 255, 0.12)'};
        }
        .station-desk-tab:hover:not([data-active="true"]) {
          color: ${offline ? 'rgba(200, 185, 150, 0.75)' : 'rgba(200, 230, 255, 0.85)'};
          border-color: ${offline ? 'rgba(170, 150, 110, 0.35)' : 'rgba(120, 210, 255, 0.4)'};
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
          border: offline ? '3px solid #1a1814' : '3px solid #152028',
          boxShadow: offline
            ? `
            0 0 0 1px rgba(170, 150, 110, 0.22),
            0 0 0 8px #0a0908,
            0 0 0 9px rgba(140, 120, 90, 0.1),
            0 30px 80px rgba(0, 0, 0, 0.8),
            inset 0 0 60px rgba(30, 24, 12, 0.4)
          `
            : `
            0 0 0 1px rgba(120, 210, 255, 0.28),
            0 0 0 8px #080c10,
            0 0 0 9px rgba(120, 210, 255, 0.12),
            0 30px 80px rgba(0, 0, 0, 0.75),
            inset 0 0 60px rgba(0, 30, 50, 0.35)
          `,
          background: offline
            ? 'linear-gradient(180deg, rgba(22, 18, 14, 0.96) 0%, rgba(6, 5, 4, 0.98) 100%)'
            : 'linear-gradient(180deg, rgba(14, 28, 40, 0.95) 0%, rgba(5, 10, 16, 0.97) 100%)',
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
              background: offline
                ? 'linear-gradient(180deg, transparent, rgba(160, 140, 90, 0.04), transparent)'
                : 'linear-gradient(180deg, transparent, rgba(120, 200, 255, 0.06), transparent)',
              animation: offline
                ? 'stationScan 9s linear infinite'
                : 'stationScan 5.5s linear infinite',
            }}
          />
        </div>

        <Corner top left color={accent} />
        <Corner top right color={accent} />
        <Corner bottom left color={accent} />
        <Corner bottom right color={accent} />

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
              borderBottom: `1px solid ${accentSoft}`,
              fontSize: 12,
              letterSpacing: '0.14em',
              color: textMuted,
            }}
          >
            <span>{offline ? 'DOCK-MFD · OFFLINE' : 'DOCK-MFD · COMMERCE'}</span>
            <span
              style={{
                color: offline ? '#b0a078' : '#7ec8ff',
                animation: 'stationBlink 1.6s step-end infinite',
              }}
            >
              {offline ? offlineStatus : '● HARD-DOCK'}
            </span>
            <span>{offline ? 'NO ATC' : 'ATC CLEAR'}</span>
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
                  color: offline
                    ? 'rgba(170, 150, 110, 0.65)'
                    : 'rgba(120, 210, 255, 0.75)',
                  marginBottom: 8,
                }}
              >
                {offline ? offlinePlatformLabel : 'ORBITAL PLATFORM'}
              </div>
              <h1
                style={{
                  margin: '0 0 10px',
                  fontSize: 'clamp(28px, 4.5vw, 48px)',
                  fontWeight: 400,
                  letterSpacing: '0.1em',
                  color: textBright,
                  textShadow: offline
                    ? '0 0 18px rgba(140, 120, 80, 0.2)'
                    : '0 0 18px rgba(120, 210, 255, 0.28)',
                }}
              >
                {stationName.toUpperCase()}
              </h1>
              <p
                style={{
                  margin: '0 0 18px',
                  fontSize: 'clamp(14px, 1.4vw, 17px)',
                  lineHeight: 1.5,
                  color: offline
                    ? 'rgba(170, 155, 125, 0.7)'
                    : 'rgba(180, 210, 230, 0.75)',
                  letterSpacing: '0.04em',
                  maxWidth: 440,
                }}
              >
                {offline
                  ? offlineBlurb
                  : limitedServices
                    ? 'Cargo exchange and hull bay only. Outfit desks are dark on this pad.'
                    : 'Sell haulage, repair the hull, outfit weapons, then undock when ready.'}
              </p>

              <CommsPortrait
                stationName={stationName}
                nyxTopicUnlocked={nyxTopicUnlocked}
                nyxHyperionLead={nyxHyperionLead}
                nyxWhisperHeard={nyxWhisperHeard}
                nyxDerelictSeen={nyxDerelictSeen}
                onKronosLead={onKronosLead}
              />

              {isVoidOffline ? (
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
                  {VOID_SYSTEM_BADGES.map((badge) => {
                    const here = voidProfile.id === badge.id
                    return (
                      <span
                        key={badge.id}
                        style={{
                          border: here
                            ? '1px solid rgba(140, 120, 90, 0.35)'
                            : `1px solid ${accentSoft}`,
                          padding: '5px 10px',
                          color: here
                            ? 'rgba(170, 150, 110, 0.65)'
                            : 'rgba(140, 128, 100, 0.45)',
                          background: here
                            ? 'rgba(18, 14, 8, 0.45)'
                            : 'rgba(0, 0, 0, 0.22)',
                          textDecoration: here ? 'none' : 'line-through',
                          textDecorationColor: here
                            ? undefined
                            : 'rgba(120, 110, 90, 0.4)',
                          animation: here
                            ? 'stationBlink 2.4s step-end infinite'
                            : undefined,
                        }}
                      >
                        {badge.label} · COLD
                      </span>
                    )
                  })}
                </div>
              ) : isExpeditionOffline ? (
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
                  {expeditionProfile.badges.map((badge) => {
                    const here = badge.id === 'hull'
                    return (
                      <span
                        key={badge.id}
                        style={{
                          border: here
                            ? '1px solid rgba(140, 120, 90, 0.35)'
                            : `1px solid ${accentSoft}`,
                          padding: '5px 10px',
                          color: here
                            ? 'rgba(170, 150, 110, 0.65)'
                            : 'rgba(140, 128, 100, 0.45)',
                          background: here
                            ? 'rgba(18, 14, 8, 0.45)'
                            : 'rgba(0, 0, 0, 0.22)',
                          textDecoration: here ? 'none' : 'line-through',
                          textDecorationColor: here
                            ? undefined
                            : 'rgba(120, 110, 90, 0.4)',
                          animation: here
                            ? 'stationBlink 2.4s step-end infinite'
                            : undefined,
                        }}
                      >
                        {badge.label} · COLD
                      </span>
                    )
                  })}
                </div>
              ) : isTugOffline ? (
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
                  <span
                    style={{
                      border: '1px solid rgba(140, 120, 90, 0.35)',
                      padding: '5px 10px',
                      background: 'rgba(18, 14, 8, 0.45)',
                      color: 'rgba(170, 150, 110, 0.65)',
                      animation: 'stationBlink 2.4s step-end infinite',
                    }}
                  >
                    {ALT_TUG_BERTH_LABEL}
                  </span>
                </div>
              ) : (
                (ghostBerth || offline || isNyxAlt) && (
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
                          border: `1px solid ${accentSoft}`,
                          padding: '5px 10px',
                          color:
                            offline || isNyxAlt
                              ? 'rgba(140, 128, 100, 0.45)'
                              : 'rgba(160, 200, 230, 0.65)',
                          background: 'rgba(0, 0, 0, 0.22)',
                          textDecoration:
                            offline || isNyxAlt ? 'line-through' : undefined,
                          textDecorationColor:
                            offline || isNyxAlt
                              ? 'rgba(120, 110, 90, 0.4)'
                              : undefined,
                        }}
                      >
                        {offline
                          ? `BERTH ${pad} · COLD`
                          : isNyxAlt
                            ? `BERTH ${pad} · NO COMMS`
                            : `BERTH ${pad} · OPEN`}
                      </span>
                    ))}
                    {isNyxAlt ? (
                      <span
                        style={{
                          border: '1px solid rgba(100, 200, 160, 0.45)',
                          padding: '5px 10px',
                          background: 'rgba(8, 28, 20, 0.4)',
                          color: 'rgba(140, 230, 190, 0.85)',
                        }}
                      >
                        BERTH 04 · ONLINE
                      </span>
                    ) : (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (offline) return
                          setPlaqueOpen((v) => !v)
                        }}
                        onKeyDown={(e) => {
                          if (offline) return
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setPlaqueOpen((v) => !v)
                          }
                        }}
                        style={{
                          border: offline
                            ? '1px solid rgba(140, 120, 90, 0.35)'
                            : '1px solid rgba(120, 100, 160, 0.28)',
                          padding: '5px 10px',
                          background: offline
                            ? 'rgba(18, 14, 8, 0.45)'
                            : 'rgba(12, 8, 20, 0.35)',
                          color: offline
                            ? 'rgba(170, 150, 110, 0.65)'
                            : 'rgba(150, 130, 190, 0.55)',
                          textDecoration:
                            offline || plaqueOpen ? 'none' : 'line-through',
                          textDecorationColor: offline
                            ? 'rgba(140, 120, 90, 0.4)'
                            : 'rgba(120, 100, 160, 0.35)',
                          animation: 'stationBlink 2.4s step-end infinite',
                          cursor: offline ? 'default' : 'pointer',
                        }}
                      >
                        {offline
                          ? `BERTH 04 · ${NYX_BERTH_OFFLINE_LABEL}`
                          : plaqueOpen
                            ? `BERTH 04 · ${GHOST_BERTH_PLAQUE}`
                            : `BERTH 04 · ${GHOST_BERTH_LABEL}`}
                      </span>
                    )}
                  </div>
                )
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
                    border: offline
                      ? '1px solid rgba(170, 150, 110, 0.3)'
                      : '1px solid rgba(255, 196, 92, 0.35)',
                    background: 'rgba(0, 0, 0, 0.28)',
                    padding: '12px 14px',
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: '0.18em',
                      color: offline
                        ? 'rgba(170, 150, 110, 0.55)'
                        : 'rgba(255, 196, 92, 0.65)',
                      marginBottom: 6,
                    }}
                  >
                    CREDITS
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      color: offline ? '#c8b890' : '#ffd78a',
                    }}
                  >
                    ₡ {formatCredits(credits)}
                  </div>
                </div>
                <div
                  style={{
                    border: `1px solid ${accentSoft}`,
                    background: 'rgba(0, 0, 0, 0.28)',
                    padding: '12px 14px',
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: '0.18em',
                      color: textFaint,
                      marginBottom: 6,
                    }}
                  >
                    HULL
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      color: hullPct < 35 ? '#ff8a8a' : offline ? '#b8a888' : '#9ef0c8',
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
                  border: offline
                    ? '1px solid rgba(170, 150, 110, 0.7)'
                    : '1px solid rgba(120, 210, 255, 0.75)',
                  background: offline
                    ? 'rgba(170, 150, 110, 0.1)'
                    : 'rgba(120, 210, 255, 0.1)',
                  color: offline ? '#d8c8a8' : '#b8e0ff',
                  padding: '16px 22px',
                  fontSize: 16,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  fontFamily: font,
                  cursor: 'pointer',
                  boxShadow: offline
                    ? 'inset 0 0 0 1px rgba(170, 150, 110, 0.18)'
                    : 'inset 0 0 0 1px rgba(120, 210, 255, 0.2)',
                }}
              >
                ▲  Undock / Jettison
              </button>
              <p
                style={{
                  margin: '12px 0 0',
                  fontSize: 12,
                  color: textFaint,
                  letterSpacing: '0.06em',
                }}
              >
                {offline
                  ? 'Manual release only — no station tow, no clearances'
                  : 'Safety push clears the berth before free flight resumes'}
              </p>
            </div>

            <div
              style={{
                border: `1px solid ${accentSoft}`,
                background: offline
                  ? 'rgba(10, 8, 5, 0.55)'
                  : 'rgba(0, 8, 14, 0.45)',
                padding: '16px 18px 14px',
                minHeight: 0,
                height: '100%',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {offline ? (
                <>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 11,
                      letterSpacing: '0.18em',
                      color: textFaint,
                      marginBottom: 12,
                      paddingBottom: 10,
                      borderBottom: `1px dashed ${accentSoft}`,
                    }}
                  >
                    <span>{offlineDeskTitle}</span>
                    <span>
                      {isTugOffline || isAncestorOffline
                        ? 'BUFFER · PARTIAL'
                        : 'BUS · DEAD'}
                    </span>
                  </div>
                  <div className="station-desk-scroll">
                    <p
                      style={{
                        margin: '0 0 18px',
                        fontSize: 14,
                        lineHeight: 1.55,
                        color: 'rgba(170, 155, 125, 0.75)',
                        letterSpacing: '0.03em',
                      }}
                    >
                      {offlineDeskNote}
                    </p>
                    {isVoidOffline ? (
                      <>
                        <div
                          style={{
                            display: 'grid',
                            gap: 8,
                            marginBottom: 18,
                            paddingBottom: 14,
                            borderBottom: '1px solid rgba(120, 110, 90, 0.18)',
                          }}
                        >
                          {voidProfile.stats.map((row) => (
                            <div
                              key={row.label}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 16,
                                fontSize: 11,
                                letterSpacing: '0.1em',
                              }}
                            >
                              <span style={{ color: 'rgba(140, 128, 100, 0.65)' }}>
                                {row.label}
                              </span>
                              <span style={{ color: textBright }}>{row.value}</span>
                            </div>
                          ))}
                        </div>
                        {voidProfile.logs.map((entry) => (
                          <div
                            key={entry.stamp}
                            style={{
                              padding: '14px 0',
                              borderBottom:
                                '1px solid rgba(120, 110, 90, 0.12)',
                            }}
                          >
                            <div
                              style={{
                                fontSize: 10,
                                letterSpacing: '0.16em',
                                color: 'rgba(170, 150, 110, 0.55)',
                                marginBottom: 8,
                              }}
                            >
                              {entry.stamp}
                            </div>
                            <p
                              style={{
                                margin: 0,
                                fontSize: 13,
                                lineHeight: 1.55,
                                color: textBright,
                                letterSpacing: '0.02em',
                              }}
                            >
                              {entry.body}
                            </p>
                          </div>
                        ))}
                        <p
                          style={{
                            margin: '22px 0 0',
                            fontSize: 12,
                            lineHeight: 1.5,
                            color: 'rgba(140, 128, 100, 0.5)',
                            fontStyle: 'italic',
                            letterSpacing: '0.04em',
                          }}
                        >
                          {voidProfile.footnote}
                        </p>
                      </>
                    ) : isExpeditionOffline ? (
                      <>
                        <div
                          style={{
                            display: 'grid',
                            gap: 8,
                            marginBottom: 18,
                            paddingBottom: 14,
                            borderBottom: '1px solid rgba(120, 110, 90, 0.18)',
                          }}
                        >
                          {expeditionProfile.stats.map((row) => (
                            <div
                              key={row.label}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 16,
                                fontSize: 11,
                                letterSpacing: '0.1em',
                              }}
                            >
                              <span style={{ color: 'rgba(140, 128, 100, 0.65)' }}>
                                {row.label}
                              </span>
                              <span style={{ color: textBright }}>{row.value}</span>
                            </div>
                          ))}
                        </div>
                        {expeditionProfile.logs.map((entry) => (
                          <div
                            key={entry.stamp}
                            style={{
                              padding: '14px 0',
                              borderBottom:
                                '1px solid rgba(120, 110, 90, 0.12)',
                            }}
                          >
                            <div
                              style={{
                                fontSize: 10,
                                letterSpacing: '0.16em',
                                color: 'rgba(170, 150, 110, 0.55)',
                                marginBottom: 8,
                              }}
                            >
                              {entry.stamp}
                            </div>
                            <p
                              style={{
                                margin: 0,
                                fontSize: 13,
                                lineHeight: 1.55,
                                color: textBright,
                                letterSpacing: '0.02em',
                              }}
                            >
                              {entry.body}
                            </p>
                          </div>
                        ))}
                        <p
                          style={{
                            margin: '22px 0 0',
                            fontSize: 12,
                            lineHeight: 1.5,
                            color: 'rgba(140, 128, 100, 0.5)',
                            fontStyle: 'italic',
                            letterSpacing: '0.04em',
                          }}
                        >
                          {expeditionProfile.footnote}
                        </p>
                      </>
                    ) : isTugOffline ? (
                      <>
                        {ALT_TUG_CREW_LOG.map((entry) => (
                          <div
                            key={entry.stamp}
                            style={{
                              padding: '14px 0',
                              borderBottom:
                                '1px solid rgba(120, 110, 90, 0.12)',
                            }}
                          >
                            <div
                              style={{
                                fontSize: 10,
                                letterSpacing: '0.16em',
                                color: 'rgba(170, 150, 110, 0.55)',
                                marginBottom: 8,
                              }}
                            >
                              {entry.stamp}
                            </div>
                            <p
                              style={{
                                margin: 0,
                                fontSize: 13,
                                lineHeight: 1.55,
                                color: textBright,
                                letterSpacing: '0.02em',
                              }}
                            >
                              {entry.body}
                            </p>
                          </div>
                        ))}
                        <p
                          style={{
                            margin: '22px 0 0',
                            fontSize: 12,
                            lineHeight: 1.5,
                            color: 'rgba(140, 128, 100, 0.5)',
                            fontStyle: 'italic',
                            letterSpacing: '0.04em',
                          }}
                        >
                          {ALT_TUG_FOOTNOTE}
                        </p>
                      </>
                    ) : (
                      <>
                        {(
                          [
                            ['CARGO EXCHANGE', 'LIFTS LOCKED'],
                            ['HULL REPAIR', 'BAY SEALED'],
                            ['ARMOR / OUTFIT', 'NO POWER'],
                            ['PROPULSION DESK', 'NO POWER'],
                            ['ORDNANCE', 'MAGAZINE COLD'],
                            ['ATC / COMMS', 'NO CARRIER'],
                          ] as const
                        ).map(([label, status]) => (
                          <div
                            key={label}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: 12,
                              alignItems: 'baseline',
                              padding: '12px 0',
                              borderBottom:
                                '1px solid rgba(120, 110, 90, 0.12)',
                              fontSize: 13,
                            }}
                          >
                            <span style={{ color: textBright }}>{label}</span>
                            <span
                              style={{
                                color: 'rgba(150, 130, 100, 0.55)',
                                letterSpacing: '0.12em',
                                fontSize: 11,
                              }}
                            >
                              {status}
                            </span>
                          </div>
                        ))}
                        <p
                          style={{
                            margin: '22px 0 0',
                            fontSize: 12,
                            lineHeight: 1.5,
                            color: 'rgba(140, 128, 100, 0.5)',
                            fontStyle: 'italic',
                            letterSpacing: '0.04em',
                          }}
                        >
                          Nyx dust woke the berth. Everything else stayed shut.
                        </p>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <>
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

                    {!limitedServices && (
                      <>
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
                          ? `${torpedoAmmo}/${torpedoMaxAmmo} TUBES`
                          : 'NO LAUNCHER'}
                      </span>
                    </div>

                    {WEAPON_SHOP.filter(
                      (item) => item.id === TORPEDO_WEAPON_ID,
                    ).map((item) => {
                      const ownedUnlock = torpedoOwned
                      const canBuy = canBuyTorpedoUnlock(credits, torpedoOwned)
                      let status = `₡ ${formatCredits(item.cost ?? 0)}`
                      let buttonLabel = 'Purchase'
                      if (ownedUnlock) {
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
                            {!torpedoOwned ? ' Includes a full magazine.' : ''}
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

                    {torpedoOwned && (
                      <>
                        <div
                          style={{
                            marginTop: 8,
                            paddingTop: 14,
                            borderTop: '1px dashed rgba(120, 190, 230, 0.15)',
                            fontSize: 11,
                            letterSpacing: '0.18em',
                            color: 'rgba(160, 200, 230, 0.55)',
                            marginBottom: 8,
                            display: 'flex',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span>MAGAZINE</span>
                          <span>
                            {torpedoMagTier >= TORPEDO_MAG_MAX_TIER
                              ? 'MAX RACKS'
                              : `TIER ${torpedoMagTier}/${TORPEDO_MAG_MAX_TIER}`}
                          </span>
                        </div>

                        {TORPEDO_MAG_TIERS.map((tier) => {
                          const owned = torpedoMagTier >= tier.tier
                          const isNext = torpedoMagTier + 1 === tier.tier
                          const canBuy =
                            isNext &&
                            canBuyTorpedoMagTier(
                              credits,
                              torpedoOwned,
                              torpedoMagTier,
                            )
                          let status = `₡ ${formatCredits(tier.cost)}`
                          let buttonLabel = `Install · ₡ ${formatCredits(tier.cost)}`
                          if (owned) {
                            status = `${tier.maxAmmo} TUBES`
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
                                  ? ' New tubes are loaded on install.'
                                  : ''}
                              </p>
                              <button
                                type="button"
                                className="station-btn weapon-btn"
                                disabled={!canBuy}
                                onClick={() => onBuy(tier.id)}
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
                      </>
                    )}

                    {WEAPON_SHOP.filter(
                      (item) => item.id === TORPEDO_RELOAD_ID,
                    ).map((item) => {
                      const canBuy = canBuyTorpedoReload(
                        credits,
                        torpedoOwned,
                        torpedoAmmo,
                        torpedoMaxAmmo,
                      )
                      let status = `₡ ${formatCredits(item.cost ?? 0)}`
                      let buttonLabel = 'Purchase'
                      if (!torpedoOwned) {
                        status = 'REQUIRES LAUNCHER'
                        buttonLabel = 'Locked'
                      } else if (reloadSlots <= 0) {
                        status = 'MAGAZINES FULL'
                        buttonLabel = 'Full'
                      } else if (!canBuy && (item.cost ?? 0) > credits) {
                        buttonLabel = 'Insufficient credits'
                      } else {
                        buttonLabel = `Reload +1 · ₡ ${formatCredits(item.cost ?? 0)}`
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
                                color: '#ffd78a',
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
                      </>
                    )}
                  </div>
                </>
              )}
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
              color: textFaint,
            }}
          >
            <span>{offline ? 'DRIFTR · COLD DOCK' : 'DRIFTR · DOCKED'}</span>
            <span>HOLD M · SYSTEM MAP</span>
          </div>
        </div>
      </div>
    </div>
  )
}
