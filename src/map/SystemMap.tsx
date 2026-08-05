import { useEffect, useRef, useState, type RefObject } from 'react'
import type { MapSnapshot } from '@/map/systemMap'

type SystemMapProps = {
  snapshotRef: RefObject<MapSnapshot>
  /** Only listen for M while the player is in flight */
  active: boolean
}

const VIEW = 960
const PAD = 48

function mapRadius(size: number, isStar: boolean, isMoon = false) {
  // Keep the star clearly larger than any planet on the map
  if (isStar) return Math.min(30, 10 + size * 0.35)
  if (isMoon) return Math.min(8, 2.8 + size * 1.35)
  return Math.min(16, 3 + size * 0.5)
}

function SystemMapView({ snapshot }: { snapshot: MapSnapshot }) {
  const planets = snapshot.bodies.filter((b) => b.kind !== 'moon')
  const moons = snapshot.bodies.filter((b) => b.kind === 'moon')
  const planetOrbits = planets.map((b) => Math.hypot(b.x, b.z))
  const maxOrbit = Math.max(
    snapshot.beltOuter * 1.08,
    ...planetOrbits.map((r) => r * 1.12),
    120,
  )
  const scale = (VIEW / 2 - PAD) / maxOrbit
  const toX = (x: number) => VIEW / 2 + x * scale
  const toY = (z: number) => VIEW / 2 + z * scale

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      style={{ display: 'block' }}
    >
      {/* Soft grid */}
      {[0.25, 0.5, 0.75, 1].map((t) => (
        <circle
          key={t}
          cx={VIEW / 2}
          cy={VIEW / 2}
          r={maxOrbit * t * scale}
          fill="none"
          stroke="rgba(120, 150, 190, 0.1)"
          strokeWidth={1}
        />
      ))}

      {/* Asteroid belt annulus */}
      <path
        fillRule="evenodd"
        fill="rgba(180, 160, 130, 0.16)"
        stroke="rgba(200, 180, 140, 0.4)"
        strokeWidth={1}
        d={[
          `M ${VIEW / 2 - snapshot.beltOuter * scale} ${VIEW / 2}`,
          `a ${snapshot.beltOuter * scale} ${snapshot.beltOuter * scale} 0 1 0 ${snapshot.beltOuter * scale * 2} 0`,
          `a ${snapshot.beltOuter * scale} ${snapshot.beltOuter * scale} 0 1 0 ${-snapshot.beltOuter * scale * 2} 0`,
          `M ${VIEW / 2 - snapshot.beltInner * scale} ${VIEW / 2}`,
          `a ${snapshot.beltInner * scale} ${snapshot.beltInner * scale} 0 1 1 ${snapshot.beltInner * scale * 2} 0`,
          `a ${snapshot.beltInner * scale} ${snapshot.beltInner * scale} 0 1 1 ${-snapshot.beltInner * scale * 2} 0`,
        ].join(' ')}
      />

      {/* Planet orbit guides (moons omit heliocentric rings) */}
      {planetOrbits.map((r, i) => (
        <circle
          key={`orbit-${i}`}
          cx={VIEW / 2}
          cy={VIEW / 2}
          r={Math.max(r, 1) * scale}
          fill="none"
          stroke="rgba(140, 170, 210, 0.22)"
          strokeWidth={1}
          strokeDasharray="3 5"
        />
      ))}

      {/* Belt label */}
      <text
        x={VIEW / 2}
        y={VIEW / 2 - ((snapshot.beltInner + snapshot.beltOuter) / 2) * scale}
        textAnchor="middle"
        fill="rgba(200, 180, 140, 0.8)"
        fontSize={14}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
      >
        Asteroid Belt
      </text>

      {/* Star */}
      <circle
        cx={VIEW / 2}
        cy={VIEW / 2}
        r={mapRadius(snapshot.starSize, true) + 8}
        fill={snapshot.starColor}
        opacity={0.2}
      />
      <circle
        cx={VIEW / 2}
        cy={VIEW / 2}
        r={mapRadius(snapshot.starSize, true)}
        fill={snapshot.starColor}
      />
      <text
        x={VIEW / 2}
        y={VIEW / 2 + mapRadius(snapshot.starSize, true) + 22}
        textAnchor="middle"
        fill="#ffe6a8"
        fontSize={18}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontWeight={600}
      >
        {snapshot.starName}
      </text>

      {/* Planets */}
      {planets.map((body) => {
        const cx = toX(body.x)
        const cy = toY(body.z)
        const r = mapRadius(body.size, false)
        const labelAway = Math.hypot(body.x, body.z) > 1e-3
        const lx = labelAway ? body.x / Math.hypot(body.x, body.z) : 1
        const lz = labelAway ? body.z / Math.hypot(body.x, body.z) : 0
        const labelX = toX(body.x + lx * (body.size + 36))
        const labelY = toY(body.z + lz * (body.size + 36))

        return (
          <g key={body.name}>
            <circle cx={cx} cy={cy} r={r + 3} fill={body.color} opacity={0.25} />
            <circle cx={cx} cy={cy} r={r} fill={body.color} />
            <text
              x={labelX}
              y={labelY}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#e8eef6"
              fontSize={15}
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              fontWeight={600}
              stroke="rgba(0, 0, 10, 0.75)"
              strokeWidth={3}
              paintOrder="stroke fill"
            >
              {body.name}
            </text>
          </g>
        )
      })}

      {/* Moons — readable labels with halo stroke */}
      {moons.map((body, i) => {
        const cx = toX(body.x)
        const cy = toY(body.z)
        const r = mapRadius(body.size, false, true)
        // Alternate label side so clustered moons stay legible
        const side = i % 2 === 0 ? 1 : -1
        const labelAway = Math.hypot(body.x, body.z) > 1e-3
        const lx = labelAway ? body.x / Math.hypot(body.x, body.z) : 1
        const lz = labelAway ? body.z / Math.hypot(body.x, body.z) : 0
        // Perpendicular nudge + outward offset
        const labelX = toX(body.x + lx * (body.size + 22) + -lz * side * 18)
        const labelY = toY(body.z + lz * (body.size + 22) + lx * side * 18)

        return (
          <g key={body.name}>
            <circle cx={cx} cy={cy} r={r + 2} fill={body.color} opacity={0.35} />
            <circle cx={cx} cy={cy} r={r} fill={body.color} />
            <text
              x={labelX}
              y={labelY}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#f2f6fc"
              fontSize={14}
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              fontWeight={600}
              stroke="rgba(0, 0, 12, 0.85)"
              strokeWidth={3.5}
              paintOrder="stroke fill"
            >
              {body.name}
            </text>
          </g>
        )
      })}

      {/* Ship — triangle tip is forward */}
      {snapshot.ship && (
        <g
          transform={`translate(${toX(snapshot.ship.x)} ${toY(snapshot.ship.z)}) rotate(${snapshot.ship.heading})`}
        >
          <polygon
            points="0,-8 7,8 -7,8"
            fill="#7ee787"
            stroke="#0a120c"
            strokeWidth={1}
          />
        </g>
      )}

      {/* Bandit */}
      {snapshot.bandit && (
        <g
          transform={`translate(${toX(snapshot.bandit.x)} ${toY(snapshot.bandit.z)})`}
        >
          <circle
            r={7}
            fill="#ff2a3a"
            stroke="#3a0008"
            strokeWidth={1.5}
          />
          <text
            x={10}
            y={4}
            fill="#ff8a94"
            fontSize={11}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontWeight={600}
            stroke="rgba(0, 0, 12, 0.85)"
            strokeWidth={3}
            paintOrder="stroke fill"
          >
            Bandit
          </text>
        </g>
      )}
    </svg>
  )
}

export function SystemMap({ snapshotRef, active }: SystemMapProps) {
  const [holding, setHolding] = useState(false)
  const [, setTick] = useState(0)
  const holdingRef = useRef(false)

  useEffect(() => {
    if (!active) {
      holdingRef.current = false
      setHolding(false)
      return
    }

    const onDown = (event: KeyboardEvent) => {
      if (event.code !== 'KeyM' || event.repeat) return
      event.preventDefault()
      holdingRef.current = true
      setHolding(true)
    }
    const onUp = (event: KeyboardEvent) => {
      if (event.code !== 'KeyM') return
      holdingRef.current = false
      setHolding(false)
    }
    const clear = () => {
      holdingRef.current = false
      setHolding(false)
    }

    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', clear)
    }
  }, [active])

  useEffect(() => {
    if (!holding) return
    let frame = 0
    const loop = () => {
      setTick((t) => t + 1)
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [holding])

  if (!active || !holding) return null

  const snapshot = snapshotRef.current

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        // Above the pause MFD so the map works while paused
        zIndex: 25,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(0, 0, 10, 0.55)',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          width: 'min(calc(100vh - 40px), calc(100vw - 40px))',
          height: 'min(calc(100vh - 40px), calc(100vw - 40px))',
          padding: 'clamp(16px, 2vw, 28px)',
          boxSizing: 'border-box',
          border: '1px solid rgba(255, 204, 102, 0.28)',
          background:
            'radial-gradient(ellipse at center, rgba(12, 20, 36, 0.94) 0%, rgba(0, 0, 10, 0.96) 75%)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.55)',
          color: '#e8eef8',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 10,
            padding: '0 4px',
          }}
        >
          <div
            style={{
              fontSize: 16,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#ffcc66',
            }}
          >
            System Map
          </div>
          <div style={{ fontSize: 13, color: 'rgba(201, 209, 217, 0.55)' }}>
            Hold M
          </div>
        </div>
        <div style={{ width: '100%', height: 'calc(100% - 36px)' }}>
          <SystemMapView snapshot={snapshot} />
        </div>
      </div>
    </div>
  )
}
