/** Screen-center reticle — lasers fire along ship forward / view. */
export function Crosshair({
  overheated,
  dead,
}: {
  overheated: boolean
  dead: boolean
}) {
  const color = dead ? '#ff7b72' : overheated ? '#ff7b72' : '#ff6a4a'
  const opacity = dead ? 0.25 : overheated ? 0.45 : 0.85

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 5,
      }}
    >
      <svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        style={{ opacity, overflow: 'visible' }}
      >
        <circle
          cx="14"
          cy="14"
          r="10"
          fill="none"
          stroke={color}
          strokeWidth="1.1"
          opacity="0.55"
        />
        <circle cx="14" cy="14" r="1.35" fill={color} />
        {/* Gaps at center so the pip stays clear */}
        <line x1="14" y1="2" x2="14" y2="8" stroke={color} strokeWidth="1.25" />
        <line
          x1="14"
          y1="20"
          x2="14"
          y2="26"
          stroke={color}
          strokeWidth="1.25"
        />
        <line x1="2" y1="14" x2="8" y2="14" stroke={color} strokeWidth="1.25" />
        <line
          x1="20"
          y1="14"
          x2="26"
          y2="14"
          stroke={color}
          strokeWidth="1.25"
        />
      </svg>
    </div>
  )
}
