import { useEffect, useRef } from 'react'

const WATCHED = [
  'KeyW',
  'KeyS',
  'KeyQ',
  'KeyE',
  'KeyF',
  'KeyT',
  'KeyJ',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ShiftLeft',
  'ShiftRight',
] as const

export type KeyCode = (typeof WATCHED)[number]

export function useKeyboard() {
  const keys = useRef<Record<string, boolean>>({})

  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      keys.current[event.code] = true
      if (WATCHED.includes(event.code as KeyCode)) event.preventDefault()
    }
    const onUp = (event: KeyboardEvent) => {
      keys.current[event.code] = false
    }
    const clear = () => {
      keys.current = {}
    }

    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', clear)
    }
  }, [])

  return keys
}
