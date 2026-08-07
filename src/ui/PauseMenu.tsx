import { useEffect, useState } from "react";
import {
  getAudioSettings,
  setMusicVolume,
  setSfxVolume,
  subscribeAudioSettings,
} from "@/audio/audioSettings";
import { cargoUnits, formatCredits, type CargoHold } from "@/loot/economy";
import { ARMOR_MAX_TIER, armorTierLabel, maxAmmoForTorpedoMagTier } from "@/loot/shop";
import { buildNyxJournal, NIGHT_SHARD_STATUS_LABEL } from "@/lore/easterEggs";
import {
  appendGatewrightJournal,
  buildVoidJournal,
} from "@/lore/voidAncestors";
import {
  CONTROL_SENS_MAX,
  CONTROL_SENS_MIN,
  getControlSettings,
  setCursorSensitivity,
  setInvertPitch,
  setInvertRoll,
  setInvertYaw,
  setPitchSensitivity,
  setRollSensitivity,
  setYawSensitivity,
  subscribeControlSettings,
} from "@/ship/controlSettings";
import {
  getGraphicsSettings,
  setGraphicsQuality,
  subscribeGraphicsSettings,
  type GraphicsQuality,
} from "@/game/graphicsSettings";

export type PauseShipStatus = {
  hp: number;
  maxHp: number;
  armorTier: number;
  credits: number;
  cargo: CargoHold;
  torpedoOwned: boolean;
  torpedoAmmo: number;
  torpedoMagTier: number;
  thrusterOwned: boolean;
  sensorsOwned: boolean;
  heat: number;
  overheated: boolean;
  speed: number;
  altitude: number;
  nightShards?: number;
  nyxTopicUnlocked?: boolean;
  nyxHyperionLead?: boolean;
  nyxHyperionRumorHeard?: boolean;
  nyxFoundEmpty?: boolean;
  nyxWhisperHeard?: boolean;
  nyxComlogUnlocked?: boolean;
  nyxCorridorUnlocked?: boolean;
  nyxDerelictSeen?: boolean;
  nyxTugSeen?: boolean;
  nyxCassiniSeen?: boolean;
  nyxGateSeen?: boolean;
  vesperGatewrightSeen?: boolean;
  vesperGatewrightDocked?: boolean;
  nyxDualAshDone?: boolean;
  voidFreeportSeen?: boolean;
  voidFreeportDocked?: boolean;
  voidCradleSeen?: boolean;
  voidCradleDocked?: boolean;
  voidArchSeen?: boolean;
  voidArchDocked?: boolean;
  voidSiphonSeen?: boolean;
  voidSiphonDocked?: boolean;
};

type PauseMenuProps = {
  mode: "start" | "paused";
  onResume: () => void;
  /** Wipe credits, upgrades, cargo, lore — returns to flight-ready. */
  onResetProgress?: () => void;
  /** Close the browser tab / window. */
  onExit?: () => void;
  /** Player-optional Leva cheat / admin panel. */
  cheatsEnabled?: boolean;
  onToggleCheats?: () => void;
  ship?: PauseShipStatus | null;
};

const controls = [
  ["← / →", "Roll"],
  ["↑ / ↓", "Pitch"],
  ["Q / E", "Yaw"],
  ["W / S", "Thrust / brake"],
  ["Shift", "Boost"],
  ["F", "Fire · dock"],
  ["T", "Torpedo"],
  ["C", "Cruise thruster"],
  ["J", "Jettison cargo"],
  ["M", "System map"],
  ["P", "Pause (pointer locked)"],
  ["Esc", "Unlock / pause"],
  ["Mouse", "HUD cursor"],
] as const;

const font = "'Share Tech Mono', ui-monospace, monospace";
const logoUrl = `${import.meta.env.BASE_URL}driftr.png`;

function VolumeSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const pct = Math.round(value * 100);
  return (
    <label
      style={{
        display: "grid",
        gridTemplateColumns: "64px 1fr 40px",
        alignItems: "center",
        gap: 8,
        fontSize: 13,
        letterSpacing: "0.12em",
      }}
    >
      <span style={{ color: "rgba(160, 210, 195, 0.65)" }}>{label}</span>
      <input
        type="range"
        className="cockpit-slider"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${label} volume`}
      />
      <span
        style={{
          textAlign: "right",
          color: pct === 0 ? "rgba(160, 210, 195, 0.4)" : "#9ef0c8",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {pct === 0 ? "OFF" : `${pct}%`}
      </span>
    </label>
  );
}

function SensSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const pct = Math.round(value * 100);
  return (
    <label
      style={{
        display: "grid",
        gridTemplateColumns: "64px 1fr 48px",
        alignItems: "center",
        gap: 8,
        fontSize: 13,
        letterSpacing: "0.12em",
      }}
    >
      <span style={{ color: "rgba(160, 210, 195, 0.65)" }}>{label}</span>
      <input
        type="range"
        className="cockpit-slider"
        min={CONTROL_SENS_MIN}
        max={CONTROL_SENS_MAX}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${label} sensitivity`}
      />
      <span
        style={{
          textAlign: "right",
          color: "#9ef0c8",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {pct}%
      </span>
    </label>
  );
}

function InvertToggle({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="cockpit-btn"
      onClick={onToggle}
      aria-pressed={active}
      style={{
        appearance: "none",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "center",
        gap: 8,
        width: "100%",
        border: active
          ? "1px solid rgba(255, 196, 92, 0.65)"
          : "1px solid rgba(120, 200, 180, 0.28)",
        background: active
          ? "rgba(255, 196, 92, 0.12)"
          : "rgba(0, 8, 10, 0.35)",
        color: active ? "#ffd78a" : "rgba(160, 210, 195, 0.75)",
        padding: "8px 10px",
        fontSize: 12,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        fontFamily: font,
        cursor: "pointer",
        textAlign: "left",
        boxShadow: active
          ? "inset 0 0 0 1px rgba(255, 196, 92, 0.18)"
          : "none",
      }}
    >
      <span>{label}</span>
      <span style={{ color: active ? "#9ef0c8" : "rgba(160, 210, 195, 0.45)" }}>
        {active ? "ON" : "OFF"}
      </span>
    </button>
  );
}

function Corner({
  top,
  left,
  right,
  bottom,
}: {
  top?: boolean;
  left?: boolean;
  right?: boolean;
  bottom?: boolean;
}) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        width: 22,
        height: 22,
        top: top ? 10 : undefined,
        bottom: bottom ? 10 : undefined,
        left: left ? 10 : undefined,
        right: right ? 10 : undefined,
        borderTop: top ? "2px solid rgba(255, 196, 92, 0.85)" : undefined,
        borderBottom: bottom ? "2px solid rgba(255, 196, 92, 0.85)" : undefined,
        borderLeft: left ? "2px solid rgba(255, 196, 92, 0.85)" : undefined,
        borderRight: right ? "2px solid rgba(255, 196, 92, 0.85)" : undefined,
      }}
    />
  );
}

export function PauseMenu({
  mode,
  onResume,
  onResetProgress,
  onExit,
  cheatsEnabled = false,
  onToggleCheats,
  ship = null,
}: PauseMenuProps) {
  const isPaused = mode === "paused";
  const stamp = isPaused ? "HOLD" : "STBY";
  const title = isPaused ? "SYSTEMS HOLD" : "FLIGHT READY";
  const subtitle = isPaused
    ? "Pilot input suspended · simulation frozen"
    : "Acquire stick lock to depart Thalassa station";
  const [audio, setAudio] = useState(getAudioSettings);
  const [controlsSens, setControlsSens] = useState(getControlSettings);
  const [graphics, setGraphics] = useState(getGraphicsSettings);
  const [journalOpen, setJournalOpen] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);

  useEffect(() => subscribeAudioSettings(setAudio), []);
  useEffect(() => subscribeControlSettings(setControlsSens), []);
  useEffect(() => subscribeGraphicsSettings(setGraphics), []);

  const journal = ship
    ? [
        ...buildNyxJournal({
          nightShards: ship.nightShards ?? 0,
          nyxTopicUnlocked: !!ship.nyxTopicUnlocked,
          nyxHyperionLead: !!ship.nyxHyperionLead,
          nyxHyperionRumorHeard: !!ship.nyxHyperionRumorHeard,
          nyxFoundEmpty: !!ship.nyxFoundEmpty,
          nyxWhisperHeard: !!ship.nyxWhisperHeard,
          nyxComlogUnlocked: !!ship.nyxComlogUnlocked,
          nyxCorridorUnlocked: !!ship.nyxCorridorUnlocked,
          nyxDerelictSeen: !!ship.nyxDerelictSeen,
          nyxTugSeen: !!ship.nyxTugSeen,
          nyxCassiniSeen: !!ship.nyxCassiniSeen,
          nyxGateSeen: !!ship.nyxGateSeen,
          nyxDualAshDone: !!ship.nyxDualAshDone,
        }),
        ...appendGatewrightJournal(
          {
            vesperGatewrightSeen: !!ship.vesperGatewrightSeen,
            vesperGatewrightDocked: !!ship.vesperGatewrightDocked,
          },
          [],
        ),
        ...buildVoidJournal({
          voidFreeportSeen: !!ship.voidFreeportSeen,
          voidFreeportDocked: !!ship.voidFreeportDocked,
          voidCradleSeen: !!ship.voidCradleSeen,
          voidCradleDocked: !!ship.voidCradleDocked,
          voidArchSeen: !!ship.voidArchSeen,
          voidArchDocked: !!ship.voidArchDocked,
          voidSiphonSeen: !!ship.voidSiphonSeen,
          voidSiphonDocked: !!ship.voidSiphonDocked,
        }),
      ]
    : [];

  const hullPct =
    ship && ship.maxHp > 0 ? Math.round((ship.hp / ship.maxHp) * 100) : null;
  const hold = ship ? cargoUnits(ship.cargo) : 0;
  const plating = ship ? armorTierLabel(ship.armorTier) : "—";
  const hullReadout =
    ship && hullPct != null ? (ship.hp <= 0 ? "LOST" : `${hullPct}%`) : "—";
  const heatReadout = ship
    ? ship.overheated
      ? "HOT"
      : `${Math.round(ship.heat * 100)}%`
    : "—";
  const linkReadout = isPaused ? "HOLD" : "IDLE";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 20,
        display: "grid",
        placeItems: "center",
        padding: "clamp(6px, 1.2vh, 12px)",
        fontFamily: font,
        color: "#d7e6df",
        userSelect: "none",
        pointerEvents: "none",
        background: `
          radial-gradient(ellipse 70% 55% at 50% 42%, rgba(12, 28, 32, 0.35) 0%, rgba(0, 0, 0, 0.72) 70%),
          linear-gradient(180deg, rgba(0,0,0,0.55) 0%, transparent 18%, transparent 82%, rgba(0,0,0,0.7) 100%)
        `,
      }}
    >
      <style>{`
        @keyframes cockpitBlink {
          0%, 40% { opacity: 1; }
          50%, 90% { opacity: 0.25; }
          100% { opacity: 1; }
        }
        @keyframes cockpitScan {
          0% { top: -35%; }
          100% { top: 100%; }
        }
        .cockpit-btn:hover,
        .cockpit-btn.flight-cursor-hover {
          background: rgba(255, 196, 92, 0.2) !important;
          box-shadow: inset 0 0 0 1px rgba(255, 196, 92, 0.7),
            0 0 18px rgba(255, 196, 92, 0.15);
        }
        .cockpit-btn:active {
          background: rgba(255, 196, 92, 0.28) !important;
        }
        .cockpit-btn-danger:hover,
        .cockpit-btn-danger.flight-cursor-hover {
          background: rgba(255, 100, 90, 0.18) !important;
          box-shadow: inset 0 0 0 1px rgba(255, 120, 100, 0.65),
            0 0 14px rgba(255, 80, 70, 0.12);
        }
        .cockpit-btn-danger:active {
          background: rgba(255, 100, 90, 0.28) !important;
        }
        .cockpit-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 4px;
          border-radius: 0;
          background: rgba(120, 200, 180, 0.18);
          outline: none;
          cursor: pointer;
        }
        .cockpit-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 18px;
          background: #ffd078;
          border: 1px solid rgba(255, 196, 92, 0.9);
          box-shadow: 0 0 10px rgba(255, 196, 92, 0.35);
          cursor: pointer;
        }
        .cockpit-slider::-moz-range-thumb {
          width: 14px;
          height: 18px;
          background: #ffd078;
          border: 1px solid rgba(255, 196, 92, 0.9);
          box-shadow: 0 0 10px rgba(255, 196, 92, 0.35);
          border-radius: 0;
          cursor: pointer;
        }
        .cockpit-slider::-moz-range-track {
          height: 4px;
          background: rgba(120, 200, 180, 0.18);
        }
        @keyframes cockpitLogoIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .pause-mfd-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.55fr) minmax(0, 0.75fr);
          gap: clamp(10px, 1.6vw, 28px);
          align-items: stretch;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }
        .pause-mfd-main {
          min-width: 0;
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .pause-mfd-rail {
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-width: 0;
          min-height: 0;
          overflow: auto;
          overscroll-behavior: contain;
          padding-right: 2px;
        }
        .pause-mfd-shell {
          position: relative;
          width: min(1400px, calc(100vw - 24px));
          height: min(920px, calc(100dvh - 24px));
          max-height: calc(100dvh - 24px);
          overflow: hidden;
          pointer-events: auto;
          border-radius: 6px;
          border: 3px solid #1a2422;
          box-shadow:
            0 0 0 1px rgba(255, 196, 92, 0.25),
            0 0 0 8px #0a0e0d,
            0 0 0 9px rgba(255, 196, 92, 0.12),
            0 30px 80px rgba(0, 0, 0, 0.75),
            inset 0 0 60px rgba(0, 40, 35, 0.35);
          background:
            linear-gradient(180deg, rgba(18, 36, 34, 0.94) 0%, rgba(6, 12, 14, 0.97) 100%);
        }
        .pause-mfd-body {
          position: relative;
          z-index: 1;
          padding: clamp(10px, 1.6vh, 24px) clamp(12px, 2vw, 40px);
          height: 100%;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          min-height: 0;
          overflow: hidden;
        }
        .pause-mfd-footer {
          flex: none;
          margin-top: 8px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding-top: 4px;
          background: linear-gradient(180deg, transparent, rgba(6, 12, 14, 0.92) 28%);
        }
        @media (max-width: 900px) {
          .pause-mfd-grid {
            grid-template-columns: 1fr;
            align-items: start;
            overflow: auto;
          }
          .pause-mfd-rail {
            max-height: min(48dvh, 440px);
          }
        }
        @media (max-height: 760px) {
          .pause-mfd-shell {
            height: calc(100dvh - 16px);
            max-height: calc(100dvh - 16px);
            width: min(1400px, calc(100vw - 16px));
          }
          .pause-mfd-body {
            padding: 10px 12px 12px;
          }
        }
        @media (max-width: 640px), (max-height: 640px) {
          .pause-ctrl-map {
            max-height: 160px;
            overflow: auto;
          }
        }
      `}</style>

      {/* Canopy frame rails */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `
            linear-gradient(90deg, rgba(0,0,0,0.65) 0%, transparent 12%, transparent 88%, rgba(0,0,0,0.65) 100%),
            linear-gradient(0deg, rgba(0,0,0,0.55) 0%, transparent 14%, transparent 86%, rgba(0,0,0,0.5) 100%)
          `,
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "8%",
          right: "8%",
          top: "6%",
          height: 1,
          background:
            "linear-gradient(90deg, transparent, rgba(255,196,92,0.35), transparent)",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "10%",
          right: "10%",
          bottom: "7%",
          height: 1,
          background:
            "linear-gradient(90deg, transparent, rgba(120,200,180,0.25), transparent)",
        }}
      />

      {/* MFD / cockpit screen — nearly full viewport */}
      <div className="pause-mfd-shell">
        {/* Scanlines */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            opacity: 0.12,
            background:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.45) 2px, rgba(0,0,0,0.45) 4px)",
            zIndex: 2,
          }}
        />
        {/* Sweep */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            overflow: "hidden",
            zIndex: 2,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              height: "35%",
              background:
                "linear-gradient(180deg, transparent, rgba(120, 220, 190, 0.05), transparent)",
              animation: "cockpitScan 5.5s linear infinite",
            }}
          />
        </div>

        <Corner top left />
        <Corner top right />
        <Corner bottom left />
        <Corner bottom right />

        <div className="pause-mfd-body">
          {/* Top status strip */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexShrink: 0,
              marginBottom: 10,
              paddingBottom: 8,
              borderBottom: "1px solid rgba(120, 200, 180, 0.18)",
              fontSize: 12,
              letterSpacing: "0.14em",
              color: "rgba(160, 210, 195, 0.7)",
            }}
          >
            <span>MFD-01 · HELM</span>
            <span
              style={{
                color: isPaused ? "#ff8f6b" : "#7dffb3",
                animation: "cockpitBlink 1.6s step-end infinite",
              }}
            >
              ● {stamp}
            </span>
            <span>CH-7 SECURE</span>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              flexShrink: 0,
              fontSize: 11,
              letterSpacing: "0.2em",
              color: "rgba(255, 196, 92, 0.75)",
              marginBottom: 4,
            }}
          >
            <span>NAV</span>
            <span>COM</span>
            <span>WPN</span>
            <span>ENG</span>
          </div>

          <div className="pause-mfd-grid">
            <div className="pause-mfd-main">
              <h1
                style={{
                  margin: "4px 0 6px",
                  fontSize: "clamp(28px, 4.2vw, 48px)",
                  fontWeight: 400,
                  letterSpacing: "0.12em",
                  color: "#ffe2a8",
                  textShadow: "0 0 18px rgba(255, 196, 92, 0.25)",
                }}
              >
                {title}
              </h1>
              <p
                style={{
                  margin: "0 0 14px",
                  fontSize: "clamp(13px, 1.3vw, 16px)",
                  lineHeight: 1.35,
                  color: "rgba(180, 210, 200, 0.75)",
                  letterSpacing: "0.04em",
                  maxWidth: 520,
                }}
              >
                {subtitle}
              </p>

              {/* Live ship instruments */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                {(
                  [
                    [
                      "HULL",
                      hullReadout,
                      hullPct != null && hullPct < 35 ? "#ff8a8a" : "#9ef0c8",
                    ],
                    [
                      "GUNS",
                      heatReadout,
                      ship?.overheated ? "#ff8a8a" : "#9ef0c8",
                    ],
                    ["LINK", linkReadout, "#9ef0c8"],
                  ] as const
                ).map(([label, value, color]) => (
                  <div
                    key={label}
                    style={{
                      border: "1px solid rgba(120, 200, 180, 0.22)",
                      background: "rgba(0, 0, 0, 0.28)",
                      padding: "8px 12px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.18em",
                        color: "rgba(160, 210, 195, 0.55)",
                        marginBottom: 2,
                      }}
                    >
                      {label}
                    </div>
                    <div style={{ fontSize: 20, color }}>{value}</div>
                  </div>
                ))}
              </div>

              {ship && (
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    border: "1px solid rgba(120, 200, 180, 0.2)",
                    background: "rgba(0, 8, 10, 0.4)",
                    padding: "8px 12px 10px",
                    overflow: "auto",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 11,
                      letterSpacing: "0.18em",
                      color: "rgba(160, 210, 195, 0.55)",
                      marginBottom: 6,
                      paddingBottom: 5,
                      borderBottom: "1px dashed rgba(120, 200, 180, 0.18)",
                    }}
                  >
                    <span>SHIP STATUS</span>
                    <span>
                      {ship.armorTier > 0
                        ? `ARMOR ${ship.armorTier}/${ARMOR_MAX_TIER}`
                        : "STOCK FIT"}
                    </span>
                  </div>
                  {(
                    [
                      [
                        "Integrity",
                        `${Math.round(ship.hp)} / ${Math.round(ship.maxHp)}`,
                      ],
                      ["Plating", plating],
                      ["Credits", `₡ ${formatCredits(ship.credits)}`],
                      [
                        "Cargo",
                        hold > 0
                          ? `${hold} u · ${ship.cargo.ore} ore · ${ship.cargo.ice} ice · ${ship.cargo.alloy} alloy`
                          : "Empty",
                      ],
                      [
                        "Torpedoes",
                        ship.torpedoOwned
                          ? `${ship.torpedoAmmo}/${maxAmmoForTorpedoMagTier(ship.torpedoMagTier)} tubes`
                          : "Not installed",
                      ],
                      [
                        "Thruster",
                        ship.thrusterOwned ? "Advanced (C)" : "Not installed",
                      ],
                      [
                        "Sensors",
                        ship.sensorsOwned ? "Long-range" : "Stock array",
                      ],
                      ...(ship.nightShards && ship.nightShards > 0
                        ? ([
                            [
                              NIGHT_SHARD_STATUS_LABEL,
                              String(ship.nightShards),
                            ],
                          ] as const)
                        : []),
                      ...(isPaused
                        ? ([
                            ["Speed", `${ship.speed.toFixed(0)} u/s`],
                            ["Altitude", `${ship.altitude.toFixed(0)}`],
                          ] as const)
                        : []),
                    ] as const
                  ).map(([label, value]) => (
                    <div
                      key={label}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "100px 1fr",
                        gap: 8,
                        fontSize: 13,
                        lineHeight: 1.42,
                        color: "rgba(210, 230, 220, 0.88)",
                      }}
                    >
                      <span style={{ color: "rgba(160, 210, 195, 0.5)" }}>
                        {label}
                      </span>
                      <span
                        style={{
                          color:
                            label === "Credits"
                              ? "#ffd78a"
                              : label === "Torpedoes" && ship.torpedoOwned
                                ? "#9ad8ff"
                                : label === "Thruster" && ship.thrusterOwned
                                  ? "#9ef0c8"
                                  : label === "Sensors" && ship.sensorsOwned
                                    ? "#9ef0c8"
                                    : label === NIGHT_SHARD_STATUS_LABEL
                                      ? "rgba(180, 160, 220, 0.9)"
                                      : "rgba(210, 230, 220, 0.88)",
                        }}
                      >
                        {value}
                      </span>
                    </div>
                  ))}
                  {journal.length > 0 && (
                    <div
                      style={{
                        marginTop: 8,
                        border: "1px solid rgba(140, 120, 180, 0.4)",
                        background: "rgba(12, 8, 18, 0.5)",
                        color: "rgba(190, 175, 230, 0.9)",
                        fontFamily: font,
                        fontSize: 12,
                        letterSpacing: "0.1em",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setJournalOpen((v) => !v)}
                        aria-expanded={journalOpen}
                        style={{
                          appearance: "none",
                          width: "100%",
                          textAlign: "left",
                          border: "none",
                          background: "transparent",
                          color: "inherit",
                          fontFamily: "inherit",
                          fontSize: "inherit",
                          letterSpacing: "inherit",
                          padding: "8px 10px",
                          cursor: "pointer",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 8,
                          }}
                        >
                          <span>SIGNAL JOURNAL · NYX</span>
                          <span style={{ opacity: 0.55 }}>
                            {journalOpen ? "▲" : "▼"} {journal.length}
                          </span>
                        </div>
                      </button>
                      {journalOpen && (
                        <div
                          style={{
                            padding: "0 10px 10px",
                            display: "flex",
                            flexDirection: "column",
                            gap: 10,
                          }}
                        >
                          {journal.map((entry) => (
                            <div
                              key={entry.id}
                              style={{
                                borderTop: "1px solid rgba(140, 120, 180, 0.2)",
                                paddingTop: 8,
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 10,
                                  letterSpacing: "0.14em",
                                  textTransform: "uppercase",
                                  color: "rgba(170, 155, 210, 0.7)",
                                  marginBottom: 4,
                                }}
                              >
                                {entry.title}
                              </div>
                              <div
                                style={{
                                  fontSize: 12,
                                  letterSpacing: "0.04em",
                                  color: "rgba(190, 180, 220, 0.82)",
                                  lineHeight: 1.45,
                                  fontStyle: "italic",
                                }}
                              >
                                {entry.body}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Controls + audio — right rail */}
            <div className="pause-mfd-rail">
              <div
                className="pause-ctrl-map"
                style={{
                  border: "1px solid rgba(120, 200, 180, 0.2)",
                  background: "rgba(0, 8, 10, 0.45)",
                  padding: "8px 10px 6px",
                  boxSizing: "border-box",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 10,
                    letterSpacing: "0.16em",
                    color: "rgba(160, 210, 195, 0.55)",
                    marginBottom: 4,
                    paddingBottom: 4,
                    borderBottom: "1px dashed rgba(120, 200, 180, 0.18)",
                  }}
                >
                  <span>CTRL MAP</span>
                  <span>INPUT MATRIX</span>
                </div>
                {controls.map(([key, action], i) => (
                  <div
                    key={key}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "20px 1fr 1fr",
                      gap: 6,
                      fontSize: "clamp(10px, 0.9vw, 12px)",
                      lineHeight: 1.55,
                      color: "rgba(210, 230, 220, 0.88)",
                      borderBottom:
                        i === controls.length - 1
                          ? "none"
                          : "1px solid rgba(120, 200, 180, 0.06)",
                    }}
                  >
                    <span style={{ color: "rgba(160, 210, 195, 0.35)" }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span style={{ color: "#ffd078" }}>{key}</span>
                    <span
                      style={{
                        textAlign: "right",
                        color: "rgba(180, 210, 200, 0.7)",
                      }}
                    >
                      {action}
                    </span>
                  </div>
                ))}
              </div>

              <div
                style={{
                  border: "1px solid rgba(120, 200, 180, 0.2)",
                  background: "rgba(0, 8, 10, 0.4)",
                  padding: "10px 12px 12px",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    color: "rgba(160, 210, 195, 0.55)",
                    marginBottom: 8,
                    paddingBottom: 5,
                    borderBottom: "1px dashed rgba(120, 200, 180, 0.18)",
                  }}
                >
                  <span>AUDIO</span>
                  <span>GAIN BUS</span>
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  <VolumeSlider
                    label="MUSIC"
                    value={audio.music}
                    onChange={setMusicVolume}
                  />
                  <VolumeSlider
                    label="SFX"
                    value={audio.sfx}
                    onChange={setSfxVolume}
                  />
                </div>
              </div>

              <div
                style={{
                  border: "1px solid rgba(120, 200, 180, 0.2)",
                  background: "rgba(0, 8, 10, 0.4)",
                  padding: "10px 12px 12px",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    color: "rgba(160, 210, 195, 0.55)",
                    marginBottom: 8,
                    paddingBottom: 5,
                    borderBottom: "1px dashed rgba(120, 200, 180, 0.18)",
                  }}
                >
                  <span>CONTROLS</span>
                  <span>SENSITIVITY</span>
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  <SensSlider
                    label="PITCH"
                    value={controlsSens.pitch}
                    onChange={setPitchSensitivity}
                  />
                  <SensSlider
                    label="YAW"
                    value={controlsSens.yaw}
                    onChange={setYawSensitivity}
                  />
                  <SensSlider
                    label="ROLL"
                    value={controlsSens.roll}
                    onChange={setRollSensitivity}
                  />
                  <SensSlider
                    label="CURSOR"
                    value={controlsSens.cursor}
                    onChange={setCursorSensitivity}
                  />
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 8,
                      marginTop: 2,
                    }}
                  >
                    <InvertToggle
                      label="Invert pitch"
                      active={controlsSens.invertPitch}
                      onToggle={() =>
                        setInvertPitch(!controlsSens.invertPitch)
                      }
                    />
                    <InvertToggle
                      label="Invert yaw"
                      active={controlsSens.invertYaw}
                      onToggle={() => setInvertYaw(!controlsSens.invertYaw)}
                    />
                    <InvertToggle
                      label="Invert roll"
                      active={controlsSens.invertRoll}
                      onToggle={() => setInvertRoll(!controlsSens.invertRoll)}
                    />
                  </div>
                </div>
              </div>

              <div
                style={{
                  border: "1px solid rgba(120, 200, 180, 0.2)",
                  background: "rgba(0, 8, 10, 0.4)",
                  padding: "10px 12px 12px",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    color: "rgba(160, 210, 195, 0.55)",
                    marginBottom: 8,
                    paddingBottom: 5,
                    borderBottom: "1px dashed rgba(120, 200, 180, 0.18)",
                  }}
                >
                  <span>GRAPHICS</span>
                  <span>QUALITY</span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 8,
                  }}
                >
                  {(
                    [
                      ["low", "LOW"],
                      ["medium", "MED"],
                      ["high", "HIGH"],
                    ] as const
                  ).map(([id, label]) => {
                    const active = graphics.quality === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        className="cockpit-btn"
                        onClick={() =>
                          setGraphicsQuality(id as GraphicsQuality)
                        }
                        style={{
                          appearance: "none",
                          border: active
                            ? "1px solid rgba(255, 196, 92, 0.75)"
                            : "1px solid rgba(120, 200, 180, 0.28)",
                          background: active
                            ? "rgba(255, 196, 92, 0.14)"
                            : "rgba(0, 8, 10, 0.35)",
                          color: active
                            ? "#ffd78a"
                            : "rgba(160, 210, 195, 0.7)",
                          padding: "9px 8px",
                          fontSize: 12,
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                          fontFamily: font,
                          cursor: "pointer",
                          boxShadow: active
                            ? "inset 0 0 0 1px rgba(255, 196, 92, 0.2)"
                            : "none",
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    letterSpacing: "0.08em",
                    color: "rgba(160, 210, 195, 0.45)",
                    lineHeight: 1.45,
                  }}
                >
                  Resolution · bloom · texture filter
                </div>
              </div>
            </div>
          </div>

          <div className="pause-mfd-footer">
            <button
              type="button"
              className="cockpit-btn"
              onClick={onResume}
              style={{
                appearance: "none",
                width: "100%",
                border: "1px solid rgba(255, 196, 92, 0.75)",
                background: "rgba(255, 196, 92, 0.1)",
                color: "#ffd78a",
                padding: "11px 20px",
                fontSize: 15,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                fontFamily: font,
                cursor: "pointer",
                boxShadow: "inset 0 0 0 1px rgba(255, 196, 92, 0.2)",
              }}
            >
              {isPaused ? "▶  Resume flight" : "▶  Engage / Launch"}
            </button>
            {onExit ? (
              <button
                type="button"
                className="cockpit-btn-danger"
                onClick={onExit}
                style={{
                  appearance: "none",
                  width: "100%",
                  border: "1px solid rgba(255, 120, 100, 0.55)",
                  background: "rgba(255, 80, 70, 0.08)",
                  color: "#ffb0a8",
                  padding: "11px 20px",
                  fontSize: 13,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  fontFamily: font,
                  cursor: "pointer",
                  boxShadow: "inset 0 0 0 1px rgba(255, 120, 100, 0.15)",
                }}
              >
                Exit game
              </button>
            ) : null}
            <div
              className="pause-mfd-grid"
              style={{
                flex: "none",
                overflow: "visible",
              }}
            >
              {onResetProgress ? (
                <button
                  type="button"
                  className="cockpit-btn-danger"
                  onClick={() => {
                    if (!resetArmed) {
                      setResetArmed(true);
                      return;
                    }
                    setResetArmed(false);
                    onResetProgress();
                  }}
                  onBlur={() => setResetArmed(false)}
                  style={{
                    appearance: "none",
                    width: "100%",
                    border: resetArmed
                      ? "1px solid rgba(255, 120, 100, 0.85)"
                      : "1px solid rgba(120, 200, 180, 0.28)",
                    background: resetArmed
                      ? "rgba(255, 80, 70, 0.14)"
                      : "rgba(0, 8, 10, 0.35)",
                    color: resetArmed ? "#ffb0a8" : "rgba(160, 210, 195, 0.7)",
                    padding: "11px 16px",
                    fontSize: 13,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    fontFamily: font,
                    cursor: "pointer",
                    boxShadow: resetArmed
                      ? "inset 0 0 0 1px rgba(255, 120, 100, 0.25)"
                      : "none",
                  }}
                >
                  {resetArmed ? "Confirm wipe save" : "Reset progress"}
                </button>
              ) : (
                <div aria-hidden />
              )}
              {onToggleCheats ? (
                <button
                  type="button"
                  className="cockpit-btn"
                  onClick={onToggleCheats}
                  style={{
                    appearance: "none",
                    width: "100%",
                    border: cheatsEnabled
                      ? "1px solid rgba(255, 196, 92, 0.55)"
                      : "1px solid rgba(120, 200, 180, 0.28)",
                    background: cheatsEnabled
                      ? "rgba(255, 196, 92, 0.12)"
                      : "rgba(0, 8, 10, 0.35)",
                    color: cheatsEnabled
                      ? "#ffd78a"
                      : "rgba(160, 210, 195, 0.7)",
                    padding: "11px 16px",
                    fontSize: 13,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    fontFamily: font,
                    cursor: "pointer",
                    boxShadow: cheatsEnabled
                      ? "inset 0 0 0 1px rgba(255, 196, 92, 0.2)"
                      : "none",
                  }}
                >
                  {cheatsEnabled ? "Hide cheat menu" : "Enable cheat menu"}
                </button>
              ) : (
                <div aria-hidden />
              )}
            </div>
          </div>

          <div
            style={{
              flexShrink: 0,
              marginTop: 8,
              paddingTop: 6,
              borderTop: "1px solid rgba(120, 200, 180, 0.12)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              gap: 16,
              fontSize: 12,
              letterSpacing: "0.12em",
              color: "rgba(160, 210, 195, 0.4)",
            }}
          >
            <img
              src={logoUrl}
              alt="Driftr"
              width={1254}
              height={1254}
              style={{
                display: "block",
                width: "clamp(44px, 5vw, 60px)",
                height: "auto",
                animation: "cockpitLogoIn 0.55s ease-out both",
              }}
            />
            <span>v0.1 FLT-OS</span>
          </div>
        </div>
      </div>
    </div>
  );
}
