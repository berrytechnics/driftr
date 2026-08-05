import { useEffect, useRef } from 'react'

type DamageFlashProps = {
  /** Bumps when the player takes hull damage */
  flashKey: number
  active: boolean
}

/** Brief red vignette when the player ship is hit. */
export function DamageFlash({ flashKey, active }: DamageFlashProps) {
  const el = useRef<HTMLDivElement>(null)
  const prevKey = useRef(0)

  useEffect(() => {
    if (!active || flashKey === 0 || flashKey === prevKey.current) return
    prevKey.current = flashKey
    const node = el.current
    if (!node) return
    node.style.opacity = '0.55'
    const fade = window.setTimeout(() => {
      if (node) node.style.opacity = '0'
    }, 40)
    return () => window.clearTimeout(fade)
  }, [flashKey, active])

  if (!active) return null

  return (
    <div
      ref={el}
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 7,
        opacity: 0,
        transition: 'opacity 0.28s ease-out',
        background:
          'radial-gradient(ellipse at center, transparent 35%, rgba(180, 20, 30, 0.75) 100%)',
      }}
    />
  )
}
