import { useEffect, useRef, useState, type RefObject } from 'react'
import type { MapSnapshot } from '@/map/systemMap'

type SystemMapProps = {
  snapshotRef: RefObject<MapSnapshot>
  /** Only listen for M while the player is in flight */
  active: boolean
}

const VIEW = 960
const PAD = 48
const FONT = '600 15px ui-monospace, SFMono-Regular, Menlo, monospace'
const FONT_SM = '600 14px ui-monospace, SFMono-Regular, Menlo, monospace'
const FONT_TINY = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace'
const FONT_LABEL = '14px ui-monospace, SFMono-Regular, Menlo, monospace'

function mapRadius(size: number, isStar: boolean, isMoon = false) {
  if (isStar) return Math.min(30, 10 + size * 0.35)
  if (isMoon) return Math.min(8, 2.8 + size * 1.35)
  return Math.min(16, 3 + size * 0.5)
}

function strokeFillText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fill: string,
  stroke = 'rgba(0, 0, 10, 0.75)',
  lineWidth = 3,
) {
  ctx.lineWidth = lineWidth
  ctx.strokeStyle = stroke
  ctx.strokeText(text, x, y)
  ctx.fillStyle = fill
  ctx.fillText(text, x, y)
}

/** Imperative canvas map — mutates every frame while held (no React reconciliation). */
function drawMap(ctx: CanvasRenderingContext2D, snapshot: MapSnapshot) {
  const planets = snapshot.bodies.filter((b) => b.kind !== 'moon')
  const moons = snapshot.bodies.filter((b) => b.kind === 'moon')
  const planetOrbits = planets.map((b) => Math.hypot(b.x, b.z))
  const maxOrbit = Math.max(
    snapshot.beltOuter * 1.08,
    ...planetOrbits.map((r) => r * 1.12),
    120,
  )
  const scale = (VIEW / 2 - PAD) / maxOrbit
  const cx = VIEW / 2
  const cy = VIEW / 2
  const toX = (x: number) => cx + x * scale
  const toY = (z: number) => cy + z * scale

  ctx.clearRect(0, 0, VIEW, VIEW)

  // Soft grid
  for (const t of [0.25, 0.5, 0.75, 1]) {
    ctx.beginPath()
    ctx.arc(cx, cy, maxOrbit * t * scale, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(120, 150, 190, 0.1)'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // Asteroid belt annulus
  const outerR = snapshot.beltOuter * scale
  const innerR = snapshot.beltInner * scale
  ctx.beginPath()
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2, false)
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true)
  ctx.fillStyle = 'rgba(180, 160, 130, 0.16)'
  ctx.fill('evenodd')
  ctx.beginPath()
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(200, 180, 140, 0.4)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2)
  ctx.stroke()

  // Planet orbit guides
  ctx.setLineDash([3, 5])
  ctx.strokeStyle = 'rgba(140, 170, 210, 0.22)'
  for (const r of planetOrbits) {
    ctx.beginPath()
    ctx.arc(cx, cy, Math.max(r, 1) * scale, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.setLineDash([])

  // Belt label
  ctx.font = FONT_LABEL
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = 'rgba(200, 180, 140, 0.8)'
  ctx.fillText(
    'Asteroid Belt',
    cx,
    cy - ((snapshot.beltInner + snapshot.beltOuter) / 2) * scale,
  )

  // Star
  const starR = mapRadius(snapshot.starSize, true)
  ctx.beginPath()
  ctx.arc(cx, cy, starR + 8, 0, Math.PI * 2)
  ctx.fillStyle = snapshot.starColor
  ctx.globalAlpha = 0.2
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.beginPath()
  ctx.arc(cx, cy, starR, 0, Math.PI * 2)
  ctx.fillStyle = snapshot.starColor
  ctx.fill()
  ctx.font = '600 18px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.fillStyle = '#ffe6a8'
  ctx.fillText(snapshot.starName, cx, cy + starR + 22)

  // Planets
  ctx.textBaseline = 'middle'
  for (const body of planets) {
    const px = toX(body.x)
    const py = toY(body.z)
    const r = mapRadius(body.size, false)
    const hyp = Math.hypot(body.x, body.z)
    const lx = hyp > 1e-3 ? body.x / hyp : 1
    const lz = hyp > 1e-3 ? body.z / hyp : 0
    const labelX = toX(body.x + lx * (body.size + 36))
    const labelY = toY(body.z + lz * (body.size + 36))

    ctx.beginPath()
    ctx.arc(px, py, r + 3, 0, Math.PI * 2)
    ctx.fillStyle = body.color
    ctx.globalAlpha = 0.25
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.arc(px, py, r, 0, Math.PI * 2)
    ctx.fillStyle = body.color
    ctx.fill()

    ctx.font = FONT
    strokeFillText(ctx, body.name, labelX, labelY, '#e8eef6')
  }

  // Moons
  moons.forEach((body, i) => {
    const px = toX(body.x)
    const py = toY(body.z)
    const r = mapRadius(body.size, false, true)
    const side = i % 2 === 0 ? 1 : -1
    const hyp = Math.hypot(body.x, body.z)
    const lx = hyp > 1e-3 ? body.x / hyp : 1
    const lz = hyp > 1e-3 ? body.z / hyp : 0
    const labelX = toX(body.x + lx * (body.size + 22) + -lz * side * 18)
    const labelY = toY(body.z + lz * (body.size + 22) + lx * side * 18)

    ctx.beginPath()
    ctx.arc(px, py, r + 2, 0, Math.PI * 2)
    ctx.fillStyle = body.color
    ctx.globalAlpha = 0.35
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.arc(px, py, r, 0, Math.PI * 2)
    ctx.fillStyle = body.color
    ctx.fill()

    ctx.font = FONT_SM
    strokeFillText(ctx, body.name, labelX, labelY, '#f2f6fc', 'rgba(0, 0, 12, 0.85)', 3.5)
  })

  // Ship — triangle tip is forward
  if (snapshot.ship) {
    const sx = toX(snapshot.ship.x)
    const sy = toY(snapshot.ship.z)
    const rad = (snapshot.ship.heading * Math.PI) / 180
    ctx.save()
    ctx.translate(sx, sy)
    ctx.rotate(rad)
    ctx.beginPath()
    ctx.moveTo(0, -8)
    ctx.lineTo(7, 8)
    ctx.lineTo(-7, 8)
    ctx.closePath()
    ctx.fillStyle = '#7ee787'
    ctx.strokeStyle = '#0a120c'
    ctx.lineWidth = 1
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }

  // Bandits
  for (const bandit of snapshot.bandits) {
    const bx = toX(bandit.x)
    const by = toY(bandit.z)
    ctx.beginPath()
    ctx.arc(bx, by, 7, 0, Math.PI * 2)
    ctx.fillStyle = '#ff2a3a'
    ctx.strokeStyle = '#3a0008'
    ctx.lineWidth = 1.5
    ctx.fill()
    ctx.stroke()
    ctx.font = FONT_TINY
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    strokeFillText(ctx, 'Bandit', bx + 10, by + 4, '#ff8a94', 'rgba(0, 0, 12, 0.85)', 3)
  }

  // Friendly patrols
  for (const patrol of snapshot.patrols) {
    const px = toX(patrol.x)
    const py = toY(patrol.z)
    ctx.beginPath()
    ctx.arc(px, py, 6, 0, Math.PI * 2)
    ctx.fillStyle = '#4ec4ff'
    ctx.strokeStyle = '#062030'
    ctx.lineWidth = 1.5
    ctx.fill()
    ctx.stroke()
    ctx.font = FONT_TINY
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    strokeFillText(ctx, 'Patrol', px + 10, py + 4, '#9ad8ff', 'rgba(0, 0, 12, 0.85)', 3)
  }
}

export function SystemMap({ snapshotRef, active }: SystemMapProps) {
  const [holding, setHolding] = useState(false)
  const holdingRef = useRef(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

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
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let frame = 0
    const loop = () => {
      drawMap(ctx, snapshotRef.current)
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [holding, snapshotRef])

  if (!active || !holding) return null

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
          <canvas
            ref={canvasRef}
            width={VIEW}
            height={VIEW}
            style={{ display: 'block', width: '100%', height: '100%' }}
          />
        </div>
      </div>
    </div>
  )
}
