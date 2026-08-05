import { useEffect, useState } from 'react'
import {
  getAudioSettings,
  setMusicVolume,
  setSfxVolume,
  subscribeAudioSettings,
} from '@/audio/audioSettings'

type PauseMenuProps = {
  mode: 'start' | 'paused'
  onResume: () => void
}

const controls = [
  ['Mouse / arrows', 'Steer'],
  ['LMB / F', 'Fire cannons'],
  ['W / S', 'Thrust / brake'],
  ['Q / E', 'Roll'],
  ['Shift', 'Boost'],
  ['Hold M', 'System map'],
  ['Esc', 'Pause / resume'],
] as const

const font = "'Share Tech Mono', ui-monospace, monospace"
const logoUrl = `${import.meta.env.BASE_URL}driftr.png`

function VolumeSlider({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  const pct = Math.round(value * 100)
  return (
    <label
      style={{
        display: 'grid',
        gridTemplateColumns: '72px 1fr 44px',
        alignItems: 'center',
        gap: 12,
        fontSize: 13,
        letterSpacing: '0.12em',
      }}
    >
      <span style={{ color: 'rgba(160, 210, 195, 0.65)' }}>{label}</span>
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
          textAlign: 'right',
          color: pct === 0 ? 'rgba(160, 210, 195, 0.4)' : '#9ef0c8',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {pct === 0 ? 'OFF' : `${pct}%`}
      </span>
    </label>
  )
}

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
        borderTop: top ? '2px solid rgba(255, 196, 92, 0.85)' : undefined,
        borderBottom: bottom ? '2px solid rgba(255, 196, 92, 0.85)' : undefined,
        borderLeft: left ? '2px solid rgba(255, 196, 92, 0.85)' : undefined,
        borderRight: right ? '2px solid rgba(255, 196, 92, 0.85)' : undefined,
      }}
    />
  )
}

export function PauseMenu({ mode, onResume }: PauseMenuProps) {
  const isPaused = mode === 'paused'
  const stamp = isPaused ? 'HOLD' : 'STBY'
  const title = isPaused ? 'SYSTEMS HOLD' : 'FLIGHT READY'
  const subtitle = isPaused
    ? 'Pilot input suspended · simulation frozen'
    : 'Acquire stick lock to depart Thalassa station'
  const [audio, setAudio] = useState(getAudioSettings)

  useEffect(() => subscribeAudioSettings(setAudio), [])

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 20,
        display: 'grid',
        placeItems: 'center',
        padding: 12,
        fontFamily: font,
        color: '#d7e6df',
        userSelect: 'none',
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
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
        .cockpit-btn:hover {
          background: rgba(255, 196, 92, 0.2) !important;
          box-shadow: inset 0 0 0 1px rgba(255, 196, 92, 0.7),
            0 0 18px rgba(255, 196, 92, 0.15);
        }
        .cockpit-btn:active {
          background: rgba(255, 196, 92, 0.28) !important;
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
          grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
          gap: clamp(24px, 4vw, 56px);
          align-items: start;
          flex: 1;
          min-height: 0;
        }
        @media (max-width: 820px) {
          .pause-mfd-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      {/* Canopy frame rails */}
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
        aria-hidden
        style={{
          position: 'absolute',
          left: '8%',
          right: '8%',
          top: '6%',
          height: 1,
          background:
            'linear-gradient(90deg, transparent, rgba(255,196,92,0.35), transparent)',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: '10%',
          right: '10%',
          bottom: '7%',
          height: 1,
          background:
            'linear-gradient(90deg, transparent, rgba(120,200,180,0.25), transparent)',
        }}
      />

      {/* MFD / cockpit screen — nearly full viewport */}
      <div
        style={{
          position: 'relative',
          width: 'calc(100vw - 40px)',
          height: 'calc(100vh - 40px)',
          maxWidth: 1400,
          overflow: 'auto',
          borderRadius: 6,
          border: '3px solid #1a2422',
          boxShadow: `
            0 0 0 1px rgba(255, 196, 92, 0.25),
            0 0 0 8px #0a0e0d,
            0 0 0 9px rgba(255, 196, 92, 0.12),
            0 30px 80px rgba(0, 0, 0, 0.75),
            inset 0 0 60px rgba(0, 40, 35, 0.35)
          `,
          background: `
            linear-gradient(180deg, rgba(18, 36, 34, 0.94) 0%, rgba(6, 12, 14, 0.97) 100%)
          `,
        }}
      >
        {/* Scanlines */}
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
        {/* Sweep */}
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
                'linear-gradient(180deg, transparent, rgba(120, 220, 190, 0.05), transparent)',
              animation: 'cockpitScan 5.5s linear infinite',
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
          {/* Top status strip */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              marginBottom: 18,
              paddingBottom: 12,
              borderBottom: '1px solid rgba(120, 200, 180, 0.18)',
              fontSize: 12,
              letterSpacing: '0.14em',
              color: 'rgba(160, 210, 195, 0.7)',
            }}
          >
            <span>MFD-01 · HELM</span>
            <span
              style={{
                color: isPaused ? '#ff8f6b' : '#7dffb3',
                animation: 'cockpitBlink 1.6s step-end infinite',
              }}
            >
              ● {stamp}
            </span>
            <span>CH-7 SECURE</span>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 11,
              letterSpacing: '0.2em',
              color: 'rgba(255, 196, 92, 0.75)',
              marginBottom: 8,
            }}
          >
            <span>NAV</span>
            <span>COM</span>
            <span>WPN</span>
            <span>ENG</span>
          </div>

          <div className="pause-mfd-grid">
            <div>
              <h1
                style={{
                  margin: '10px 0 10px',
                  fontSize: 'clamp(32px, 5vw, 52px)',
                  fontWeight: 400,
                  letterSpacing: '0.12em',
                  color: '#ffe2a8',
                  textShadow: '0 0 18px rgba(255, 196, 92, 0.25)',
                }}
              >
                {title}
              </h1>
              <p
                style={{
                  margin: '0 0 28px',
                  fontSize: 'clamp(14px, 1.4vw, 17px)',
                  lineHeight: 1.5,
                  color: 'rgba(180, 210, 200, 0.75)',
                  letterSpacing: '0.04em',
                  maxWidth: 420,
                }}
              >
                {subtitle}
              </p>

              {/* Fake instrument readouts */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 10,
                  marginBottom: 28,
                }}
              >
                {[
                  ['HULL', '100%'],
                  ['FUEL', 'OK'],
                  ['LINK', isPaused ? 'HOLD' : 'IDLE'],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    style={{
                      border: '1px solid rgba(120, 200, 180, 0.22)',
                      background: 'rgba(0, 0, 0, 0.28)',
                      padding: '12px 14px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        letterSpacing: '0.18em',
                        color: 'rgba(160, 210, 195, 0.55)',
                        marginBottom: 6,
                      }}
                    >
                      {label}
                    </div>
                    <div style={{ fontSize: 20, color: '#9ef0c8' }}>{value}</div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="cockpit-btn"
                onClick={onResume}
                style={{
                  appearance: 'none',
                  width: '100%',
                  border: '1px solid rgba(255, 196, 92, 0.75)',
                  background: 'rgba(255, 196, 92, 0.1)',
                  color: '#ffd78a',
                  padding: '16px 22px',
                  fontSize: 16,
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  fontFamily: font,
                  cursor: 'pointer',
                  boxShadow: 'inset 0 0 0 1px rgba(255, 196, 92, 0.2)',
                }}
              >
                {isPaused ? '▶  Resume flight' : '▶  Engage / Launch'}
              </button>

              <div
                style={{
                  marginTop: 22,
                  border: '1px solid rgba(120, 200, 180, 0.2)',
                  background: 'rgba(0, 8, 10, 0.4)',
                  padding: '14px 16px 16px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 11,
                    letterSpacing: '0.18em',
                    color: 'rgba(160, 210, 195, 0.55)',
                    marginBottom: 14,
                    paddingBottom: 10,
                    borderBottom: '1px dashed rgba(120, 200, 180, 0.18)',
                  }}
                >
                  <span>AUDIO</span>
                  <span>GAIN BUS</span>
                </div>
                <div style={{ display: 'grid', gap: 14 }}>
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
            </div>

            {/* Controls as MFD list */}
            <div
              style={{
                border: '1px solid rgba(120, 200, 180, 0.2)',
                background: 'rgba(0, 8, 10, 0.45)',
                padding: '16px 18px 14px',
                height: '100%',
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 11,
                  letterSpacing: '0.18em',
                  color: 'rgba(160, 210, 195, 0.55)',
                  marginBottom: 12,
                  paddingBottom: 10,
                  borderBottom: '1px dashed rgba(120, 200, 180, 0.18)',
                }}
              >
                <span>CTRL MAP</span>
                <span>INPUT MATRIX</span>
              </div>
              {controls.map(([key, action], i) => (
                <div
                  key={key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '28px 1fr 1fr',
                    gap: 12,
                    fontSize: 'clamp(13px, 1.2vw, 16px)',
                    lineHeight: 2,
                    color: 'rgba(210, 230, 220, 0.88)',
                    borderBottom:
                      i === controls.length - 1
                        ? 'none'
                        : '1px solid rgba(120, 200, 180, 0.06)',
                  }}
                >
                  <span style={{ color: 'rgba(160, 210, 195, 0.35)' }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{ color: '#ffd078' }}>{key}</span>
                  <span
                    style={{
                      textAlign: 'right',
                      color: 'rgba(180, 210, 200, 0.7)',
                    }}
                  >
                    {action}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              marginTop: 'auto',
              paddingTop: 18,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              gap: 16,
              fontSize: 11,
              letterSpacing: '0.12em',
              color: 'rgba(160, 210, 195, 0.4)',
            }}
          >
            <img
              src={logoUrl}
              alt="Driftr"
              width={1254}
              height={1254}
              style={{
                display: 'block',
                width: 'clamp(88px, 12vw, 128px)',
                height: 'auto',
                animation: 'cockpitLogoIn 0.55s ease-out both',
              }}
            />
            <span>v0.1 FLT-OS</span>
          </div>
        </div>
      </div>
    </div>
  )
}
