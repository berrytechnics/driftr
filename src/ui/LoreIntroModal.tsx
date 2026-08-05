import { useState } from 'react'

const font = "'Share Tech Mono', ui-monospace, monospace"

type LoreIntroModalProps = {
  onContinue: (dontShowAgain: boolean) => void
}

/** First-load briefing — Sol lane life and the Nyx Transit vanishing. */
export function LoreIntroModal({ onContinue }: LoreIntroModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(true)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lore-intro-title"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 40,
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        fontFamily: font,
        color: '#d7e6df',
        userSelect: 'none',
        background: `
          radial-gradient(ellipse 70% 55% at 50% 42%, rgba(12, 28, 32, 0.45) 0%, rgba(0, 0, 0, 0.78) 70%),
          linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 18%, transparent 82%, rgba(0,0,0,0.75) 100%)
        `,
      }}
    >
      <div
        style={{
          width: 'min(560px, 100%)',
          maxHeight: 'min(86vh, 720px)',
          overflow: 'auto',
          border: '1px solid rgba(120, 200, 180, 0.35)',
          background: 'rgba(4, 12, 14, 0.92)',
          boxShadow: '0 0 40px rgba(0, 0, 0, 0.55)',
          padding: '22px 24px 20px',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: '0.2em',
            color: 'rgba(160, 210, 195, 0.6)',
            marginBottom: 8,
          }}
        >
          BRIEFING · SOL ARCHIVE
        </div>
        <h1
          id="lore-intro-title"
          style={{
            margin: '0 0 16px',
            fontSize: 'clamp(22px, 3.5vw, 30px)',
            fontWeight: 400,
            letterSpacing: '0.14em',
            color: '#ffe2a8',
            textShadow: '0 0 18px rgba(255, 196, 92, 0.25)',
          }}
        >
          DRIFTR
        </h1>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            fontSize: 14,
            lineHeight: 1.55,
            letterSpacing: '0.03em',
            color: 'rgba(200, 220, 212, 0.88)',
            marginBottom: 22,
          }}
        >
          <p style={{ margin: 0 }}>
            Sol is smaller than memory claims, but the work is the same: haul
            from the belt, sell at the stations, stay alive between them.
          </p>
          <p style={{ margin: 0 }}>
            You fly a lone ship through a compressed system — Hermes scorched
            close to the sun, Ares and Boreas inward, Thalassa greening beside
            the asteroid belt, Kronos and Ouranos holding the outer lanes. Three
            outposts keep civilization lit: Ares Station in the heat, Thalassa
            Station by the rocks, Kronos Station over the gas. Ore, ice, and rare
            alloy pay the bills. Bandits hunt the haul; blue patrols pretend the
            lane stays honest. Outfit the hull, light the advanced thruster, and
            the black between berths gets shorter — or quieter.
          </p>
          <p style={{ margin: 0 }}>
            Farther out, Nyx refuses to behave. When the dwarf was first charted,
            the surveyors read a simple orbit and raised{' '}
            <span style={{ color: 'rgba(190, 175, 230, 0.95)' }}>
              Nyx Transit
            </span>{' '}
            to meet her. They did not know the ellipse. At apoapsis Nyx ran
            beyond any craft of that age. Help could not follow. When Nyx finally
            swung home, there was nothing waiting in her sky: no wreck, no beacon,
            no debris field. The station was gone without a trace. Only ghosts of
            bureaucracy remain — a struck transit pad on some dock boards, a
            corrupt comlog, rumors of shapes and whispers where the berth should
            have been.
          </p>
          <p
            style={{
              margin: 0,
              color: 'rgba(255, 215, 138, 0.85)',
              letterSpacing: '0.06em',
            }}
          >
            Mine. Fight. Dock. Drift. The lore is what you find when you leave
            the belt and the dark starts answering.
          </p>
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 18,
            fontSize: 13,
            letterSpacing: '0.08em',
            color: 'rgba(160, 210, 195, 0.75)',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            style={{
              width: 16,
              height: 16,
              accentColor: '#c8a86a',
              cursor: 'pointer',
            }}
          />
          Don&apos;t show next time
        </label>

        <button
          type="button"
          className="cockpit-btn"
          onClick={() => onContinue(dontShowAgain)}
          style={{
            appearance: 'none',
            width: '100%',
            border: '1px solid rgba(255, 196, 92, 0.75)',
            background: 'rgba(255, 196, 92, 0.1)',
            color: '#ffd78a',
            padding: '12px 20px',
            fontSize: 15,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            fontFamily: font,
            cursor: 'pointer',
            boxShadow: 'inset 0 0 0 1px rgba(255, 196, 92, 0.2)',
          }}
        >
          Continue
        </button>
      </div>
    </div>
  )
}
