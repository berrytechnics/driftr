import { useEffect, useRef, useState } from 'react'
import musicUrl from '@/assets/audio/music_the_mountain_space.mp3?url'
import stationUrl from '@/assets/audio/station.mp3?url'
import {
  getMusicVolume,
  subscribeAudioSettings,
} from '@/audio/audioSettings'
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
  void ensureStationAudio().play().catch(() => {})
}

function ensureStationAudio() {
  if (stationAudio) return stationAudio
  const station = new Audio(stationUrl)
  station.loop = true
  station.preload = 'auto'
  stationAudio = station
  return station
}

type ThemeMusicProps = {
  /** Playing only while in-flight (not on start/pause screens). */
  playing: boolean
  /** While docked, swap to station ambience. */
  docked?: boolean
}

/** Looping theme / station tracks driven by pause-menu volume. */
export function ThemeMusic({ playing, docked = false }: ThemeMusicProps) {
  const themeRef = useRef<HTMLAudioElement | null>(null)
  const stationRef = useRef<HTMLAudioElement | null>(null)
  const [volume, setVolume] = useState(getMusicVolume)

  useEffect(() => subscribeAudioSettings((s) => setVolume(s.music)), [])

  useEffect(() => {
    const theme = new Audio(musicUrl)
    theme.loop = true
    theme.preload = 'auto'
    themeRef.current = theme
    themeAudio = theme

    return () => {
      theme.pause()
      theme.removeAttribute('src')
      theme.load()
      if (themeAudio === theme) themeAudio = null
      themeRef.current = null

      const station = stationRef.current ?? stationAudio
      if (station) {
        station.pause()
        station.removeAttribute('src')
        station.load()
        if (stationAudio === station) stationAudio = null
      }
      stationRef.current = null
    }
  }, [])

  // Station track is only fetched when the player docks
  useEffect(() => {
    if (!docked) return
    const station = ensureStationAudio()
    station.volume = volume
    stationRef.current = station
  }, [docked, volume])

  useEffect(() => {
    const theme = themeRef.current
    if (theme) theme.volume = volume
    if (stationRef.current) stationRef.current.volume = volume
    else if (stationAudio) stationAudio.volume = volume
  }, [volume])

  useEffect(() => {
    const theme = themeRef.current
    if (!theme) return

    if (volume < 1e-3) {
      theme.pause()
      stationAudio?.pause()
      return
    }

    if (docked) {
      theme.pause()
      const station = ensureStationAudio()
      stationRef.current = station
      station.volume = volume
      void station.play().catch(() => {
        // Unlocked via tryPlayStation() on the Dock click.
      })
    } else {
      stationAudio?.pause()
      if (playing) {
        void theme.play().catch(() => {
          // Autoplay blocked until Launch/Resume click calls tryPlayTheme().
        })
      } else {
        theme.pause()
      }
    }
  }, [playing, docked, volume])

  return null
}
