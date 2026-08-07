import { useEffect, useRef } from 'react'
import {
  getControlSettings,
  subscribeControlSettings,
} from '@/ship/controlSettings'
import {
  flightCursorClientPoint,
  flightCursorPos,
  resetFlightCursor,
} from '@/ui/flightCursorState'

const HOVER_CLASS = 'flight-cursor-hover'

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const desc = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )
  desc?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function setRangeFromClientX(input: HTMLInputElement, clientX: number) {
  const rect = input.getBoundingClientRect()
  if (rect.width <= 0) return
  const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  const min = Number(input.min || 0)
  const max = Number(input.max || 1)
  const step = Number(input.step || 0)
  let next = min + t * (max - min)
  if (step > 0) {
    next = Math.round((next - min) / step) * step + min
  }
  next = Math.min(max, Math.max(min, next))
  setNativeInputValue(input, String(next))
}

function pickTarget(clientX: number, clientY: number, ignore: Element | null) {
  const stack = document.elementsFromPoint(clientX, clientY)
  for (const el of stack) {
    if (ignore && (el === ignore || ignore.contains(el))) continue
    return el
  }
  return null
}

function isLevaNode(el: Element) {
  return !!(
    el.closest('#leva__root') ||
    el.closest('[class*="leva-"]') ||
    el.closest('[data-leva-panel]')
  )
}

function hoverable(el: Element | null) {
  if (!el || !(el instanceof Element)) return null
  const hit = el.closest(
    [
      'button',
      'a',
      'label',
      'input',
      'select',
      'textarea',
      '[role="button"]',
      '[role="slider"]',
      '[role="checkbox"]',
      '.cockpit-btn',
      '.cockpit-btn-danger',
      '.cockpit-slider',
      '#leva__root',
      '[class*="leva-"]',
    ].join(', '),
  ) as HTMLElement | null
  return hit
}

function pointerOpts(
  clientX: number,
  clientY: number,
  buttons: number,
  extra: PointerEventInit = {},
): PointerEventInit {
  return {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    screenX: clientX,
    screenY: clientY,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    button: buttons > 0 ? 0 : -1,
    buttons,
    ...extra,
  }
}

/**
 * Virtual HUD cursor while the OS pointer is locked — moves with mouse /
 * trackpad deltas without unlocking for the system cursor.
 * When `interactive`, LMB synthesizes clicks / slider drags on the HUD / Leva.
 */
export function FlightCursor({
  active,
  interactive = false,
}: {
  active: boolean
  /** Soft-pause / cheats: allow the pip to operate UI under the lock */
  interactive?: boolean
}) {
  const pipRef = useRef<HTMLDivElement>(null)
  const hoverRef = useRef<HTMLElement | null>(null)
  const dragRangeRef = useRef<HTMLInputElement | null>(null)
  const dragElRef = useRef<HTMLElement | null>(null)
  const cursorSens = useRef(getControlSettings().cursor)

  useEffect(() => {
    return subscribeControlSettings((s) => {
      cursorSens.current = s.cursor
    })
  }, [])

  useEffect(() => {
    const pip = pipRef.current
    if (!pip) return

    const place = () => {
      pip.style.left = `${flightCursorPos.x * 100}%`
      pip.style.top = `${flightCursorPos.y * 100}%`
    }

    const clearHover = () => {
      if (hoverRef.current) {
        hoverRef.current.classList.remove(HOVER_CLASS)
        hoverRef.current = null
      }
    }

    const syncHover = () => {
      if (!interactive || !document.pointerLockElement) {
        clearHover()
        return
      }
      const { clientX, clientY } = flightCursorClientPoint()
      const next = hoverable(pickTarget(clientX, clientY, pip))
      if (next === hoverRef.current) return
      clearHover()
      if (next) {
        next.classList.add(HOVER_CLASS)
        hoverRef.current = next
      }
    }

    const reset = () => {
      resetFlightCursor()
      place()
      clearHover()
      dragRangeRef.current = null
      dragElRef.current = null
    }

    const syncVisible = () => {
      const show = active && !!document.pointerLockElement
      pip.style.opacity = show ? '1' : '0'
      if (!show) reset()
    }

    const onMove = (event: MouseEvent) => {
      if (!active || !document.pointerLockElement) return
      const w = Math.max(window.innerWidth, 1)
      const h = Math.max(window.innerHeight, 1)
      const sens = cursorSens.current
      flightCursorPos.x = Math.min(
        1,
        Math.max(0, flightCursorPos.x + (event.movementX * sens) / w),
      )
      flightCursorPos.y = Math.min(
        1,
        Math.max(0, flightCursorPos.y + (event.movementY * sens) / h),
      )
      place()
      const { clientX, clientY } = flightCursorClientPoint()
      const range = dragRangeRef.current
      if (range) {
        setRangeFromClientX(range, clientX)
        return
      }
      const dragEl = dragElRef.current
      if (dragEl) {
        const opts = pointerOpts(clientX, clientY, 1)
        dragEl.dispatchEvent(new PointerEvent('pointermove', opts))
        dragEl.dispatchEvent(
          new MouseEvent('mousemove', {
            bubbles: true,
            cancelable: true,
            clientX,
            clientY,
            button: 0,
            buttons: 1,
            movementX: event.movementX,
            movementY: event.movementY,
          }),
        )
        return
      }
      syncHover()
    }

    const onMouseDown = (event: MouseEvent) => {
      if (!interactive || !active) return
      if (event.button !== 0) return
      if (!document.pointerLockElement) return
      event.preventDefault()
      event.stopPropagation()
      const { clientX, clientY } = flightCursorClientPoint()
      const raw = pickTarget(clientX, clientY, pip)
      if (!raw) return

      // Prefer semantic targets; fall back to the topmost node (Leva drag grips)
      const target =
        hoverable(raw) ??
        (isLevaNode(raw) ? (raw as HTMLElement) : (raw as HTMLElement))

      if (target instanceof HTMLInputElement && target.type === 'range') {
        dragRangeRef.current = target
        setRangeFromClientX(target, clientX)
        return
      }

      dragElRef.current = target
      const opts = pointerOpts(clientX, clientY, 1)
      target.dispatchEvent(new PointerEvent('pointerdown', opts))
      target.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          button: 0,
          buttons: 1,
        }),
      )
      if (target instanceof HTMLElement && typeof target.focus === 'function') {
        try {
          target.focus({ preventScroll: true })
        } catch {
          /* ignore */
        }
      }
    }

    const onMouseUp = (event: MouseEvent) => {
      if (!interactive || !active) return
      if (event.button !== 0) return
      if (
        !document.pointerLockElement &&
        !dragRangeRef.current &&
        !dragElRef.current
      ) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const { clientX, clientY } = flightCursorClientPoint()
      const range = dragRangeRef.current
      if (range) {
        setRangeFromClientX(range, clientX)
        dragRangeRef.current = null
        return
      }

      const dragEl = dragElRef.current
      dragElRef.current = null
      const raw = pickTarget(clientX, clientY, pip)
      const target =
        dragEl ??
        hoverable(raw) ??
        (raw ? (raw as HTMLElement) : null)
      if (!target) return

      const opts = pointerOpts(clientX, clientY, 0)
      target.dispatchEvent(new PointerEvent('pointerup', opts))
      target.dispatchEvent(
        new MouseEvent('mouseup', {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          button: 0,
          buttons: 0,
        }),
      )
      target.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          button: 0,
          buttons: 0,
        }),
      )
    }

    syncVisible()
    document.addEventListener('pointerlockchange', syncVisible)
    document.addEventListener('mousemove', onMove)
    window.addEventListener('mousedown', onMouseDown, true)
    window.addEventListener('mouseup', onMouseUp, true)
    window.addEventListener('resize', place)
    return () => {
      clearHover()
      document.removeEventListener('pointerlockchange', syncVisible)
      document.removeEventListener('mousemove', onMove)
      window.removeEventListener('mousedown', onMouseDown, true)
      window.removeEventListener('mouseup', onMouseUp, true)
      window.removeEventListener('resize', place)
    }
  }, [active, interactive])

  return (
    <div
      ref={pipRef}
      aria-hidden
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: 18,
        height: 18,
        marginLeft: -9,
        marginTop: -9,
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 40,
        opacity: 0,
        transition: 'opacity 120ms linear',
      }}
    >
      <svg width="18" height="18" viewBox="0 0 18 18">
        <circle
          cx="9"
          cy="9"
          r="7"
          fill="none"
          stroke="rgba(210, 225, 240, 0.92)"
          strokeWidth="1.25"
        />
        <circle cx="9" cy="9" r="1.4" fill="rgba(210, 225, 240, 0.95)" />
        <line
          x1="9"
          y1="1"
          x2="9"
          y2="4.2"
          stroke="rgba(210, 225, 240, 0.85)"
          strokeWidth="1.1"
        />
        <line
          x1="9"
          y1="13.8"
          x2="9"
          y2="17"
          stroke="rgba(210, 225, 240, 0.85)"
          strokeWidth="1.1"
        />
        <line
          x1="1"
          y1="9"
          x2="4.2"
          y2="9"
          stroke="rgba(210, 225, 240, 0.85)"
          strokeWidth="1.1"
        />
        <line
          x1="13.8"
          y1="9"
          x2="17"
          y2="9"
          stroke="rgba(210, 225, 240, 0.85)"
          strokeWidth="1.1"
        />
      </svg>
    </div>
  )
}
