/** Screen-center reticle — lasers fire along ship forward / view. */
export function Crosshair({
  overheated,
  dead,
  torpedoOwned = false,
  torpedoLock = 0,
  torpedoAmmo = 0,
}: {
  overheated: boolean
  dead: boolean
  torpedoOwned?: boolean
  /** 0–1 seeker lock progress */
  torpedoLock?: number
  torpedoAmmo?: number
}) {
  const color = dead ? '#ff7b72' : overheated ? '#ff7b72' : '#ff6a4a'
  const opacity = dead ? 0.25 : overheated ? 0.45 : 0.85
  const lock = Math.max(0, Math.min(1, torpedoLock))
  const locked = lock >= 1 && torpedoAmmo > 0
  const locking = torpedoOwned && !dead && lock > 0.02 && torpedoAmmo > 0
  const lockColor = locked ? '#7dffc8' : '#5ad0ff'
  const circumference = 2 * Math.PI * 16
  const dash = circumference * lock

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
        width="44"
        height="44"
        viewBox="0 0 44 44"
        style={{ opacity, overflow: 'visible' }}
      >
        {locking && (
          <circle
            cx="22"
            cy="22"
            r="16"
            fill="none"
            stroke={lockColor}
            strokeWidth={locked ? 1.8 : 1.35}
            strokeDasharray={`${dash} ${circumference}`}
            strokeLinecap="butt"
            transform="rotate(-90 22 22)"
            opacity={locked ? 0.95 : 0.7}
          />
        )}
        <circle
          cx="22"
          cy="22"
          r="10"
          fill="none"
          stroke={color}
          strokeWidth="1.1"
          opacity="0.55"
        />
        <circle cx="22" cy="22" r="1.35" fill={color} />
        {/* Gaps at center so the pip stays clear */}
        <line
          x1="22"
          y1="10"
          x2="22"
          y2="16"
          stroke={color}
          strokeWidth="1.25"
        />
        <line
          x1="22"
          y1="28"
          x2="22"
          y2="34"
          stroke={color}
          strokeWidth="1.25"
        />
        <line
          x1="10"
          y1="22"
          x2="16"
          y2="22"
          stroke={color}
          strokeWidth="1.25"
        />
        <line
          x1="28"
          y1="22"
          x2="34"
          y2="22"
          stroke={color}
          strokeWidth="1.25"
        />
      </svg>
    </div>
  )
}
