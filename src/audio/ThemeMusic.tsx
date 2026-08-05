import { useControls } from 'leva'
import { useEffect, useRef } from 'react'
import musicUrl from '@/assets/audio/music_the_mountain_space.mp3?url'
import stationUrl from '@/assets/audio/station.mp3?url'
import { unlockAudio } from '@/audio/gameAudio'

let themeAudio: HTMLAudioElement | null = null
let stationAudio: HTMLAudioElement | null = null

/** Call from a click handler so the browser allows playback. */
export function tryPlayTheme() {
  unlockAudio()
  void themeAudio?.play().catch(() => {})
}

/** Call when docking — user gesture unlocks station ambience. */
export function tryPlayStation() {
  unlockAudio()
  themeAudio?.pause()
  void stationAudio?.play().catch(() => {})
}

type ThemeMusicProps = {
  /** Playing only while in-flight (not on start/pause screens). */
  playing: boolean
  /** While docked, swap to station ambience. */
  docked?: boolean
}

/** Looping theme / station tracks with Leva play/volume controls. */
export function ThemeMusic({ playing, docked = false }: ThemeMusicProps) {
  const themeRef = useRef<HTMLAudioElement | null>(null)
  const stationRef = useRef<HTMLAudioElement | null>(null)

  const { enabled, volume } = useControls('Music', {
    enabled: { value: true, label: 'Play theme' },
    volume: { value: 0.4, min: 0, max: 1, step: 0.01 },
  })

  useEffect(() => {
    const theme = new Audio(musicUrl)
    theme.loop = true
    theme.preload = 'auto'
    themeRef.current = theme
    themeAudio = theme

    const station = new Audio(stationUrl)
    station.loop = true
    station.preload = 'auto'
    stationRef.current = station
    stationAudio = station

    return () => {
      theme.pause()
      theme.removeAttribute('src')
      theme.load()
      station.pause()
      station.removeAttribute('src')
      station.load()
      if (themeAudio === theme) themeAudio = null
      if (stationAudio === station) stationAudio = null
      themeRef.current = null
      stationRef.current = null
    }
  }, [])

  useEffect(() => {
    const theme = themeRef.current
    const station = stationRef.current
    if (theme) theme.volume = volume
    if (station) station.volume = volume
  }, [volume])

  useEffect(() => {
    const theme = themeRef.current
    const station = stationRef.current
    if (!theme || !station) return

    if (!enabled) {
      theme.pause()
      station.pause()
      return
    }

    if (docked) {
      theme.pause()
      void station.play().catch(() => {
        // Unlocked via tryPlayStation() on the Dock click.
      })
    } else {
      station.pause()
      if (playing) {
        void theme.play().catch(() => {
          // Autoplay blocked until Launch/Resume click calls tryPlayTheme().
        })
      } else {
        theme.pause()
      }
    }
  }, [enabled, playing, docked])

  return null
}
