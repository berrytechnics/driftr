type DamageFlashProps = {
  /** Bumps when the player takes hull damage */
  flashKey: number
  active: boolean
}

/** Brief red vignette when the player ship is hit. */
export function DamageFlash({ flashKey, active }: DamageFlashProps) {
  if (!active || flashKey === 0) return null

  // Remount on each hit so the CSS animation always restarts cleanly.
  return (
    <div
      key={flashKey}
      className="damage-flash"
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 7,
        background:
          'radial-gradient(ellipse at center, transparent 35%, rgba(180, 20, 30, 0.75) 100%)',
      }}
    />
  )
}
