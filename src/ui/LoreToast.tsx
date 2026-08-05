import { useEffect, useState } from 'react'

const font = "'Share Tech Mono', ui-monospace, monospace"
const SHOW_MS = 4200

type LoreToastProps = {
  message: string | null
  /** Bump to re-show the same string. */
  flashKey?: number
  /** Clear parent state when the toast finishes so remounts don't replay it. */
  onDismissed?: () => void
}

/** Brief centered cockpit log line for lore discoveries. */
export function LoreToast({
  message,
  flashKey = 0,
  onDismissed,
}: LoreToastProps) {
  const [visible, setVisible] = useState(false)
  const [text, setText] = useState('')

  useEffect(() => {
    if (!message) {
      setVisible(false)
      return
    }
    setText(message)
    setVisible(true)
    const hide = window.setTimeout(() => {
      setVisible(false)
      onDismissed?.()
    }, SHOW_MS)
    return () => window.clearTimeout(hide)
  }, [message, flashKey, onDismissed])

  if (!visible || !text) return null

  return (
    <div
      aria-live="polite"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: '18%',
        zIndex: 12,
        display: 'grid',
        placeItems: 'center',
        pointerEvents: 'none',
        fontFamily: font,
        animation: 'loreToastIn 0.55s ease-out',
      }}
    >
      <style>{`
        @keyframes loreToastIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div
        style={{
          padding: '10px 22px',
          border: '1px solid rgba(140, 120, 180, 0.45)',
          background: 'rgba(8, 6, 14, 0.72)',
          color: 'rgba(210, 195, 240, 0.92)',
          letterSpacing: '0.22em',
          fontSize: 13,
          textShadow: '0 0 14px rgba(120, 90, 180, 0.35)',
        }}
      >
        {text}
      </div>
    </div>
  )
}
