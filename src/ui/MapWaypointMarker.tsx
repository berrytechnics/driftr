import { useEffect, useRef, type RefObject } from 'react'
import type { MapWaypointState } from '@/map/mapWaypoint'

type MapWaypointMarkerProps = {
  waypointRef: RefObject<MapWaypointState>
  active: boolean
}

/**
 * Flight HUD marker for a body picked on the system map.
 * On-screen: labeled diamond. Off-screen: edge chevron.
 */
export function MapWaypointMarker({
  waypointRef,
  active,
}: MapWaypointMarkerProps) {
  const layer = useRef<HTMLDivElement>(null)
  const mark = useRef<HTMLDivElement>(null)
  const label = useRef<HTMLSpanElement>(null)
  const edge = useRef<HTMLDivElement>(null)
  const edgeSvg = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!active) {
      if (mark.current) mark.current.style.opacity = '0'
      if (edge.current) edge.current.style.opacity = '0'
      return
    }

    let frame = 0
    const loop = () => {
      const wp = waypointRef.current
      const on = mark.current
      const off = edge.current
      const svg = edgeSvg.current
      const text = label.current
      if (on && off && svg && text) {
        if (!wp.show || !wp.name) {
          on.style.opacity = '0'
          off.style.opacity = '0'
        } else {
          text.textContent = wp.name
          if (wp.onScreen) {
            on.style.opacity = '0.95'
            on.style.transform = `translate(${wp.x}px, ${wp.y}px)`
            off.style.opacity = '0'
          } else {
            on.style.opacity = '0'
            off.style.opacity = '0.95'
            off.style.transform = `translate(${wp.x}px, ${wp.y}px)`
            svg.style.transform = `translate(-50%, -50%) rotate(${wp.angle}rad)`
          }
        }
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [active, waypointRef])

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
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      }}
    >
      {/* On-screen pip */}
      <div
        ref={mark}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          opacity: 0,
          willChange: 'transform, opacity',
          transform: 'translate(-9999px, -9999px)',
        }}
      >
        <div
          style={{
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <rect
              x="9"
              y="1.5"
              width="10"
              height="10"
              rx="1"
              transform="rotate(45 9 9)"
              fill="none"
              stroke="#ffcc66"
              strokeWidth="1.6"
            />
            <circle cx="9" cy="9" r="1.6" fill="#ffcc66" />
          </svg>
          <span
            ref={label}
            style={{
              color: '#ffe6a8',
              fontSize: 11,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              textShadow: '0 1px 4px rgba(0,0,0,0.9)',
              whiteSpace: 'nowrap',
            }}
          />
        </div>
      </div>

      {/* Off-screen edge chevron */}
      <div
        ref={edge}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          opacity: 0,
          willChange: 'transform, opacity',
        }}
      >
        <svg
          ref={edgeSvg}
          width="32"
          height="24"
          viewBox="0 0 32 24"
          style={{
            display: 'block',
            transform: 'translate(-50%, -50%)',
            filter: 'drop-shadow(0 0 4px rgba(255, 204, 102, 0.75))',
          }}
        >
          <polygon
            points="30,12 5,2 10,12 5,22"
            fill="#ffcc66"
            stroke="#3a2808"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  )
}
