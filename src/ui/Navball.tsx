import { useEffect, useMemo, useRef, type RefObject } from 'react'
import type { AttitudeHudState } from '@/ship/attitudeHud'

const SIZE = 118
const R = SIZE / 2
/** Pitch at ±90° scrolls the horizon strip this many px */
const PITCH_TRAVEL = R * 1.85
/** Pixels of strip travel for a full 360° heading */
const HDG_CYCLE = SIZE * 2.4
/**
 * Wide enough that after max pitch/heading scroll (plus roll diagonals)
 * the ball never reveals the empty frame behind the strip.
 */
const STRIP_W = HDG_CYCLE * 3 + SIZE * 2.4
const STRIP_H = PITCH_TRAVEL * 2 + SIZE * 2.2
const HDG_TRAVEL = HDG_CYCLE
const MARKER_R = R - 14

const SKY = '#3a6ea5'
const HORIZON = '#e8eef4'
const GROUND = '#5c4030'

const PITCH_MARKS = [-80, -70, -60, -50, -40, -30, -20, -10, 10, 20, 30, 40, 50, 60, 70, 80]
const PITCH_LABELS = new Set([-60, -30, 30, 60])
const HDG_MAJORS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]

function projectLocal(
  x: number,
  y: number,
  z: number,
): { ox: number; oy: number; opacity: number } | null {
  const forward = -z
  if (forward <= 0.04) return null
  const radial = Math.hypot(x, y)
  const ang = Math.atan2(radial, forward)
  const u = Math.min(1, ang / (Math.PI / 2))
  const ux = radial > 1e-8 ? x / radial : 0
  const uy = radial > 1e-8 ? y / radial : 0
  return {
    ox: ux * u * MARKER_R,
    oy: -uy * u * MARKER_R,
    opacity: forward > 0.15 ? 1 : 0.55,
  }
}

function placeMarker(
  el: HTMLDivElement | null,
  x: number,
  y: number,
  z: number,
) {
  if (!el) return
  const p = projectLocal(x, y, z)
  if (!p) {
    el.style.display = 'none'
    return
  }
  el.style.display = 'block'
  el.style.opacity = String(p.opacity)
  el.style.transform = `translate(calc(-50% + ${p.ox}px), calc(-50% + ${p.oy}px))`
}

/**
 * KSP-style attitude ball — ecliptic horizon, degree ladder, sun / away markers.
 * Polls `attitudeRef` via rAF so it stays smooth without React telemetry churn.
 */
export function Navball({
  attitudeRef,
  active,
}: {
  attitudeRef: RefObject<AttitudeHudState>
  active: boolean
}) {
  const horizonRef = useRef<HTMLDivElement>(null)
  const rollRef = useRef<HTMLDivElement>(null)
  const progradeRef = useRef<HTMLDivElement>(null)
  const sunRef = useRef<HTMLDivElement>(null)
  const awayRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLSpanElement>(null)
  const awayTextRef = useRef<HTMLSpanElement>(null)

  const pitchMarks = useMemo(
    () =>
      PITCH_MARKS.map((deg) => {
        const yPct =
          50 - (deg / 90) * (PITCH_TRAVEL / STRIP_H) * 100
        const major = PITCH_LABELS.has(deg)
        return { deg, yPct, major }
      }),
    [],
  )

  const hdgMarks = useMemo(() => {
    // Three wraps so scrolling heading never shows an empty edge
    const marks: { deg: number; xPct: number; major: boolean }[] = []
    for (let wrap = -1; wrap <= 1; wrap++) {
      for (let d = 0; d < 360; d += 10) {
        const world = ((d + wrap * 360) % 360 + 360) % 360
        const x =
          50 +
          ((d + wrap * 360) / 360) * (HDG_TRAVEL / STRIP_W) * 100
        marks.push({
          deg: world,
          xPct: x,
          major: HDG_MAJORS.includes(world),
        })
      }
    }
    return marks
  }, [])

  useEffect(() => {
    if (!active) return
    let id = 0
    const tick = () => {
      const a = attitudeRef.current
      const horizon = horizonRef.current
      const roll = rollRef.current
      const heading = headingRef.current
      const awayText = awayTextRef.current
      if (horizon && roll && heading && awayText) {
        const pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, a.pitch))
        const pitchPx = (-pitch / (Math.PI / 2)) * PITCH_TRAVEL
        let hdg = ((a.heading % 360) + 360) % 360
        // Scroll so current heading sits at center of the strip
        const hdgPx = (hdg / 360) * HDG_TRAVEL
        roll.style.transform = `rotate(${a.roll}rad)`
        horizon.style.transform = `translate(calc(-50% + ${-hdgPx}px), calc(-50% + ${pitchPx}px))`

        if (a.speed > 0.5) {
          placeMarker(
            progradeRef.current,
            a.progradeX,
            a.progradeY,
            a.progradeZ,
          )
        } else if (progradeRef.current) {
          progradeRef.current.style.display = 'none'
        }

        placeMarker(sunRef.current, a.sunX, a.sunY, a.sunZ)
        // Anti-sun = radial out from Sol (pointing away)
        placeMarker(awayRef.current, -a.sunX, -a.sunY, -a.sunZ)

        heading.textContent = `HDG ${String(Math.round(hdg)).padStart(3, '0')}`
        const away = Math.round(a.awayAngle)
        awayText.textContent = `AWAY ${String(away).padStart(3, '0')}°`
        awayText.style.color =
          away <= 15
            ? '#ffe6a8'
            : away >= 165
              ? '#ffcc66'
              : 'rgba(201,209,217,0.7)'
      }
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [active, attitudeRef])

  if (!active) return null

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        right: 16,
        bottom: 16,
        width: SIZE,
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 6,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        textShadow: '0 1px 4px rgba(0,0,0,0.85)',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: SIZE,
          height: SIZE,
          borderRadius: '50%',
          overflow: 'hidden',
          boxShadow:
            '0 0 0 2px rgba(201,209,217,0.35), inset 0 0 18px rgba(0,0,0,0.55), 0 4px 14px rgba(0,0,0,0.45)',
          background: SKY,
        }}
      >
        <div
          ref={rollRef}
          style={{
            position: 'absolute',
            inset: '-20%',
            willChange: 'transform',
          }}
        >
          <div
            ref={horizonRef}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: STRIP_W,
              height: STRIP_H,
              willChange: 'transform',
              // Hard sky / ground split — thin crisp horizon, no soft blend
              background: [
                `linear-gradient(`,
                `${SKY} 0%,`,
                `${SKY} calc(50% - 1px),`,
                `${HORIZON} calc(50% - 1px),`,
                `${HORIZON} calc(50% + 1px),`,
                `${GROUND} calc(50% + 1px),`,
                `${GROUND} 100%)`,
              ].join(''),
            }}
          >
            {/* Pitch ladder + degree labels */}
            {pitchMarks.map(({ deg, yPct, major }) => (
              <div
                key={`p${deg}`}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: `${yPct}%`,
                  width: major ? 40 : 18,
                  height: 1,
                  marginLeft: major ? -20 : -9,
                  background: major
                    ? 'rgba(255,255,255,0.5)'
                    : 'rgba(255,255,255,0.28)',
                }}
              >
                {major && (
                  <span
                    style={{
                      position: 'absolute',
                      left: -22,
                      top: -6,
                      fontSize: 8,
                      color: 'rgba(255,255,255,0.7)',
                      fontWeight: 600,
                    }}
                  >
                    {Math.abs(deg)}
                  </span>
                )}
                {major && (
                  <span
                    style={{
                      position: 'absolute',
                      right: -22,
                      top: -6,
                      fontSize: 8,
                      color: 'rgba(255,255,255,0.7)',
                      fontWeight: 600,
                    }}
                  >
                    {Math.abs(deg)}
                  </span>
                )}
              </div>
            ))}

            {/* Heading degree marks along the horizon */}
            {hdgMarks.map(({ deg, xPct, major }, i) => (
              <div
                key={`h${i}`}
                style={{
                  position: 'absolute',
                  left: `${xPct}%`,
                  top: '50%',
                  width: 1,
                  height: major ? 14 : 7,
                  marginTop: major ? -7 : -3.5,
                  background: major
                    ? 'rgba(255,255,255,0.55)'
                    : 'rgba(255,255,255,0.28)',
                }}
              >
                {major && (
                  <span
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: -11,
                      transform: 'translateX(-50%)',
                      fontSize: 7,
                      fontWeight: 600,
                      color: 'rgba(255,255,255,0.72)',
                      letterSpacing: -0.3,
                    }}
                  >
                    {deg === 0 ? 'N' : deg}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Glass vignette — light so sky/ground stay solid */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background:
              'radial-gradient(circle at 34% 28%, rgba(255,255,255,0.1), transparent 45%, rgba(0,0,0,0.22) 100%)',
            pointerEvents: 'none',
          }}
        />

        {/* Bore sight */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 18,
            height: 1,
            marginLeft: -9,
            marginTop: -0.5,
            background: 'rgba(255,255,255,0.85)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 1,
            height: 10,
            marginLeft: -0.5,
            marginTop: -5,
            background: 'rgba(255,255,255,0.85)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 5,
            height: 5,
            marginLeft: -2.5,
            marginTop: -2.5,
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.75)',
            boxSizing: 'border-box',
          }}
        />

        {/* Prograde */}
        <div
          ref={progradeRef}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 12,
            height: 12,
            display: 'none',
            willChange: 'transform',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <circle
              cx="6"
              cy="6"
              r="4.2"
              fill="none"
              stroke="#7ee787"
              strokeWidth="1.4"
            />
            <circle cx="6" cy="6" r="1.2" fill="#7ee787" />
          </svg>
        </div>

        {/* Sun (pointing toward Sol) */}
        <div
          ref={sunRef}
          title="Toward Sol"
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 14,
            height: 14,
            display: 'none',
            willChange: 'transform',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14">
            <circle cx="7" cy="7" r="3.2" fill="#ffcc66" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
              const rad = (deg * Math.PI) / 180
              const x1 = 7 + Math.cos(rad) * 4.2
              const y1 = 7 + Math.sin(rad) * 4.2
              const x2 = 7 + Math.cos(rad) * 6.2
              const y2 = 7 + Math.sin(rad) * 6.2
              return (
                <line
                  key={deg}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#ffcc66"
                  strokeWidth="1.1"
                  strokeLinecap="round"
                />
              )
            })}
          </svg>
        </div>

        {/* Away from sun (radial-out) */}
        <div
          ref={awayRef}
          title="Away from Sol"
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 14,
            height: 14,
            display: 'none',
            willChange: 'transform',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14">
            <circle
              cx="7"
              cy="7"
              r="5"
              fill="none"
              stroke="#ffe6a8"
              strokeWidth="1.3"
            />
            <line
              x1="3.2"
              y1="3.2"
              x2="10.8"
              y2="10.8"
              stroke="#ffe6a8"
              strokeWidth="1.3"
            />
            <line
              x1="10.8"
              y1="3.2"
              x2="3.2"
              y2="10.8"
              stroke="#ffe6a8"
              strokeWidth="1.3"
            />
          </svg>
        </div>
      </div>

      <div
        style={{
          marginTop: 6,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
          color: 'rgba(201,209,217,0.75)',
          fontSize: 10,
          letterSpacing: 0.04,
        }}
      >
        <span ref={headingRef}>HDG 000</span>
        <span ref={awayTextRef}>AWAY 000°</span>
      </div>
    </div>
  )
}
