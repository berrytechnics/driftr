import { useEffect, useRef } from 'react'

/** Small upper-left FPS readout; updates the DOM without React re-renders. */
export function FpsCounter() {
  const labelRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let frames = 0
    let last = performance.now()
    let raf = 0

    const tick = (now: number) => {
      frames += 1
      const elapsed = now - last
      if (elapsed >= 500) {
        const fps = Math.round((frames * 1000) / elapsed)
        const el = labelRef.current
        if (el) el.textContent = `${fps} FPS`
        frames = 0
        last = now
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div
      style={{
        position: 'absolute',
        left: 16,
        top: 16,
        color: 'rgba(201, 209, 217, 0.55)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 12,
        lineHeight: 1,
        pointerEvents: 'none',
        userSelect: 'none',
        textShadow: '0 1px 4px rgba(0,0,0,0.85)',
        zIndex: 6,
      }}
    >
      <span ref={labelRef}>-- FPS</span>
    </div>
  )
}
