let audioCtx: AudioContext | null = null

export function getAudioContext() {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    audioCtx = new Ctx()
  }
  return audioCtx
}

/** Call from a click (Launch/Resume) so SFX aren't blocked later. */
export function unlockAudio() {
  const ctx = getAudioContext()
  if (!ctx) return
  void ctx.resume()
}

/** Short synthesized laser blip (no asset required). */
export function playLaserSound(volume = 0.2) {
  const ctx = getAudioContext()
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume()

  const t0 = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  const filter = ctx.createBiquadFilter()

  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(1400, t0)
  osc.frequency.exponentialRampToValueAtTime(180, t0 + 0.09)

  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(2400, t0)
  filter.frequency.exponentialRampToValueAtTime(400, t0 + 0.09)

  gain.gain.setValueAtTime(Math.max(0.0001, volume), t0)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1)

  osc.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)
  osc.start(t0)
  osc.stop(t0 + 0.11)
}

/** Bright two-note chime when collecting a buff token. */
export function playBuffPickupSound(volume = 0.28) {
  const ctx = getAudioContext()
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume()

  const t0 = ctx.currentTime
  const master = ctx.createGain()
  master.gain.setValueAtTime(Math.max(0.0001, volume), t0)
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45)
  master.connect(ctx.destination)

  const notes = [880, 1174.7] // A5 → D6
  for (let i = 0; i < notes.length; i++) {
    const start = t0 + i * 0.07
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const filter = ctx.createBiquadFilter()

    osc.type = i === 0 ? 'triangle' : 'sine'
    osc.frequency.setValueAtTime(notes[i], start)

    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(4200, start)
    filter.frequency.exponentialRampToValueAtTime(900, start + 0.35)

    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.9, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.38)

    osc.connect(filter)
    filter.connect(gain)
    gain.connect(master)
    osc.start(start)
    osc.stop(start + 0.4)
  }

  // Soft shimmer overlay
  const shimmer = ctx.createOscillator()
  const shimmerGain = ctx.createGain()
  shimmer.type = 'sine'
  shimmer.frequency.setValueAtTime(2349, t0)
  shimmerGain.gain.setValueAtTime(0.0001, t0)
  shimmerGain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.03)
  shimmerGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22)
  shimmer.connect(shimmerGain)
  shimmerGain.connect(master)
  shimmer.start(t0)
  shimmer.stop(t0 + 0.24)
}

/** Soft clink when scooping a material shard. */
export function playMaterialPickupSound(volume = 0.2) {
  const ctx = getAudioContext()
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume()

  const t0 = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  const filter = ctx.createBiquadFilter()

  osc.type = 'triangle'
  osc.frequency.setValueAtTime(420, t0)
  osc.frequency.exponentialRampToValueAtTime(180, t0 + 0.12)

  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(900, t0)
  filter.Q.value = 2.2

  gain.gain.setValueAtTime(Math.max(0.0001, volume), t0)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14)

  osc.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)
  osc.start(t0)
  osc.stop(t0 + 0.15)
}
