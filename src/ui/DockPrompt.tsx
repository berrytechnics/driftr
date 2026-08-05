type DockPromptProps = {
  stationName?: string
  onDock: () => void
}

const font = "'Share Tech Mono', ui-monospace, monospace"

/** Approach offer while near the station berth. */
export function DockPrompt({
  stationName = 'Thalassa Station',
  onDock,
}: DockPromptProps) {
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: '14%',
        transform: 'translateX(-50%)',
        zIndex: 15,
        pointerEvents: 'none',
        fontFamily: font,
        textAlign: 'center',
        userSelect: 'none',
      }}
    >
      <style>{`
        @keyframes dockPulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }
      `}</style>
      <div
        style={{
          padding: '14px 22px 16px',
          border: '1px solid rgba(120, 210, 255, 0.45)',
          background: 'rgba(4, 12, 20, 0.82)',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.45)',
          color: '#d8eefc',
          minWidth: 280,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: '0.2em',
            color: 'rgba(140, 210, 255, 0.75)',
            marginBottom: 6,
            animation: 'dockPulse 1.8s ease-in-out infinite',
          }}
        >
          BERTH IN RANGE
        </div>
        <div
          style={{
            fontSize: 18,
            letterSpacing: '0.08em',
            color: '#c8e8ff',
            marginBottom: 10,
          }}
        >
          {stationName}
        </div>
        <button
          type="button"
          onClick={onDock}
          style={{
            pointerEvents: 'auto',
            appearance: 'none',
            border: '1px solid rgba(120, 210, 255, 0.7)',
            background: 'rgba(120, 210, 255, 0.12)',
            color: '#b8e0ff',
            padding: '10px 18px',
            fontSize: 14,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            fontFamily: font,
            cursor: 'pointer',
          }}
        >
          Dock  ·  F
        </button>
      </div>
    </div>
  )
}
