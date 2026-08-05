import { useProgress } from '@react-three/drei'
import { useEffect, useState } from 'react'

const logoUrl = `${import.meta.env.BASE_URL}driftr.png`
const font = "'Share Tech Mono', ui-monospace, monospace"

/** Minimum time on screen so the animation can read even on a warm cache. */
const MIN_MS = 1400
/** Hard cap so a stuck loader never traps the player. */
const MAX_MS = 10000
const FADE_MS = 550

type LoadingScreenProps = {
  onFinished: () => void
}

/**
 * Full-viewport boot splash — tracks drei/three LoadingManager progress,
 * then fades out once assets settle.
 */
export function LoadingScreen({ onFinished }: LoadingScreenProps) {
  const { active, progress, loaded } = useProgress()
  const [minElapsed, setMinElapsed] = useState(false)
  const [forceDone, setForceDone] = useState(false)
  const [seenLoad, setSeenLoad] = useState(false)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const min = window.setTimeout(() => setMinElapsed(true), MIN_MS)
    const max = window.setTimeout(() => setForceDone(true), MAX_MS)
    // Warm the start/pause menu chunk while the splash runs
    void import('@/ui/PauseMenu')
    return () => {
      window.clearTimeout(min)
      window.clearTimeout(max)
    }
  }, [])

  useEffect(() => {
    if (active || loaded > 0) setSeenLoad(true)
  }, [active, loaded])

  const assetsReady = forceDone || (seenLoad && !active)

  // Start the fade once boot conditions are met (don't gate on `fading` —
  // that re-run would clear the finish timer in cleanup).
  useEffect(() => {
    if (!minElapsed || !assetsReady) return
    setFading(true)
  }, [minElapsed, assetsReady])

  useEffect(() => {
    if (!fading) return
    const t = window.setTimeout(onFinished, FADE_MS)
    return () => window.clearTimeout(t)
  }, [fading, onFinished])

  const shown = Math.min(100, Math.max(progress, seenLoad && !active ? 100 : 0))

  return (
    <div
      aria-busy={!fading}
      aria-live="polite"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'grid',
        placeItems: 'center',
        background: '#000000',
        fontFamily: font,
        color: '#d7e6df',
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease`,
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      <style>{`
        @keyframes bootPulse {
          0%, 100% { opacity: 0.88; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.03); }
        }
        @keyframes bootScan {
          0% { transform: translateY(-120%); }
          100% { transform: translateY(120%); }
        }
        @keyframes bootGlow {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 0.55; }
        }
        @keyframes bootBlink {
          0%, 40% { opacity: 1; }
          50%, 90% { opacity: 0.3; }
          100% { opacity: 1; }
        }
        @keyframes bootBar {
          0% { background-position: 0% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>

      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 28,
          padding: 24,
        }}
      >
        {/* Soft brand glow behind the mark */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '18%',
            width: 'min(420px, 70vw)',
            height: 'min(420px, 70vw)',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(255, 196, 92, 0.14) 0%, transparent 68%)',
            animation: 'bootGlow 2.8s ease-in-out infinite',
            pointerEvents: 'none',
          }}
        />

        <div
          style={{
            position: 'relative',
            width: 'min(320px, 72vw)',
            overflow: 'hidden',
            animation: 'bootPulse 2.4s ease-in-out infinite',
          }}
        >
          <img
            src={logoUrl}
            alt="Driftr"
            width={1254}
            height={1254}
            style={{
              display: 'block',
              width: '100%',
              height: 'auto',
            }}
          />
          {/* Scan sweep across the logo */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              overflow: 'hidden',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                height: '28%',
                background:
                  'linear-gradient(180deg, transparent, rgba(255, 214, 140, 0.14), transparent)',
                animation: 'bootScan 2.2s linear infinite',
              }}
            />
          </div>
        </div>

        <div
          style={{
            width: 'min(280px, 68vw)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            alignItems: 'stretch',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 12,
              letterSpacing: '0.22em',
              color: 'rgba(255, 196, 92, 0.85)',
            }}
          >
            <span style={{ animation: 'bootBlink 1.4s step-end infinite' }}>
              INITIALIZING
            </span>
            <span>{Math.round(shown)}%</span>
          </div>
          <div
            style={{
              height: 3,
              background: 'rgba(255, 196, 92, 0.12)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${shown}%`,
                background:
                  'linear-gradient(90deg, #c4892a, #ffc45c, #ffe2a8, #ffc45c, #c4892a)',
                backgroundSize: '200% 100%',
                animation: 'bootBar 1.6s linear infinite',
                transition: 'width 0.2s ease-out',
                boxShadow: '0 0 12px rgba(255, 196, 92, 0.45)',
              }}
            />
          </div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: '0.16em',
              color: 'rgba(160, 210, 195, 0.45)',
              textAlign: 'center',
            }}
          >
            FLT-OS · BOOT SEQ
          </div>
        </div>
      </div>
    </div>
  )
}
