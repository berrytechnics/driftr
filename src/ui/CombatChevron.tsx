import { useEffect, useRef, type RefObject } from 'react'
import type { CombatHudState } from '@/combat/combatHud'

type CombatChevronProps = {
  hudRef: RefObject<CombatHudState>
  active: boolean
}

const EDGE_INSET_PX = 22

/** Red edge chevron pointing at off-screen combatants while engaged. */
export function CombatChevron({ hudRef, active }: CombatChevronProps) {
  const layer = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!active) {
      if (root.current) root.current.style.opacity = '0'
      return
    }

    let frame = 0
    const loop = () => {
      const el = root.current
      const mark = svg.current
      const host = layer.current
      const hud = hudRef.current
      if (el && mark && host) {
        if (hud.showChevron && hud.engaged) {
          // Re-clamp to this overlay's box so a canvas/DOM size mismatch
          // can never leave the chevron floating in the middle.
          const w = host.clientWidth
          const h = host.clientHeight
          const cx = w * 0.5
          const cy = h * 0.5
          let dx = hud.x - cx
          let dy = hud.y - cy
          if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) dy = 1
          const halfW = Math.max(1, cx - EDGE_INSET_PX)
          const halfH = Math.max(1, cy - EDGE_INSET_PX)
          const tx = Math.abs(dx) > 1e-8 ? halfW / Math.abs(dx) : Number.POSITIVE_INFINITY
          const ty = Math.abs(dy) > 1e-8 ? halfH / Math.abs(dy) : Number.POSITIVE_INFINITY
          const t = Math.min(tx, ty)
          const x = cx + dx * t
          const y = cy + dy * t
          const angle = Math.atan2(dy, dx)

          el.style.opacity = '0.95'
          el.style.transform = `translate(${x}px, ${y}px)`
          mark.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`
        } else {
          el.style.opacity = '0'
        }
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [active, hudRef])

  if (!active) return null

  return (
    <div
      ref={layer}
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 6,
        overflow: 'hidden',
      }}
    >
      <div
        ref={root}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          opacity: 0,
          willChange: 'transform, opacity',
          margin: 0,
        }}
      >
        <svg
          ref={svg}
          width="36"
          height="28"
          viewBox="0 0 36 28"
          style={{
            display: 'block',
            transform: 'translate(-50%, -50%)',
            filter: 'drop-shadow(0 0 4px rgba(255, 40, 50, 0.85))',
          }}
        >
          {/* Tip points +X (toward combatant after rotation) */}
          <polygon
            points="34,14 6,2 12,14 6,26"
            fill="#ff2a3a"
            stroke="#3a0008"
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  )
}
