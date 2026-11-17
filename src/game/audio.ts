import type { GameEvent, Snapshot } from './createGame'

/**
 * All sound for the game. The music is three CC0 tracks by Juhani Junkala (see
 * public/CREDITS.md); everything else (engine, tyres, pickups, hits, countdown, fanfare) is
 * synthesized with the Web Audio API so there are no sample files to license or load.
 */
export type GameAudio = {
  /** Call from a user gesture: browsers refuse to start audio otherwise. */
  unlock: () => void
  onSnapshot: (s: Snapshot) => void
  onEvent: (e: GameEvent) => void
  setMuted: (muted: boolean) => void
  muted: () => boolean
  dispose: () => void
}

const MUSIC = {
  title: '/audio/title.mp3',
  race: '/audio/race.mp3',
  ending: '/audio/ending.mp3',
} as const
type TrackName = keyof typeof MUSIC

const STORAGE_KEY = 'clerk-van-run:muted'

export function createAudio(): GameAudio {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let musicGain: GainNode | null = null
  let sfxGain: GainNode | null = null
  let engine: Engine | null = null
  let muted = readMuted()
  const buffers = new Map<TrackName, Promise<AudioBuffer>>()
  let current: { name: TrackName; source: AudioBufferSourceNode; gain: GainNode } | null = null
  let wanted: TrackName | null = null
  let lastPhase: Snapshot['phase'] | null = null
  let offroad = false

  const ensure = (): AudioContext | null => {
    if (ctx) return ctx
    if (typeof window === 'undefined') return null
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = muted ? 0 : 1
    master.connect(ctx.destination)
    musicGain = ctx.createGain()
    musicGain.gain.value = 0.55
    musicGain.connect(master)
    sfxGain = ctx.createGain()
    sfxGain.gain.value = 0.9
    sfxGain.connect(master)
    engine = createEngine(ctx, sfxGain)
    return ctx
  }

  const loadTrack = (name: TrackName): Promise<AudioBuffer> => {
    let p = buffers.get(name)
    if (!p) {
      p = fetch(MUSIC[name])
        .then((r) => r.arrayBuffer())
        .then((data) => {
          const c = ensure()
          if (!c) throw new Error('no audio context')
          return c.decodeAudioData(data)
        })
      buffers.set(name, p)
    }
    return p
  }

  const play = (name: TrackName, loop: boolean) => {
    wanted = name
    const c = ensure()
    if (!c || !musicGain) return
    loadTrack(name)
      .then((buffer) => {
        if (!c || !musicGain || wanted !== name) return
        if (current?.name === name) return
        const now = c.currentTime
        if (current) {
          current.gain.gain.setTargetAtTime(0, now, 0.4)
          const old = current.source
          setTimeout(() => old.stop(), 1500)
        }
        const source = c.createBufferSource()
        source.buffer = buffer
        source.loop = loop
        const gain = c.createGain()
        gain.gain.value = 0
        gain.gain.setTargetAtTime(1, now, 0.6)
        source.connect(gain).connect(musicGain)
        source.start()
        current = { name, source, gain }
      })
      .catch((err) => console.warn('music failed', err))
  }

  const unlock = () => {
    const c = ensure()
    if (c && c.state === 'suspended') c.resume().catch(() => undefined)
    if (wanted) play(wanted, wanted !== 'ending')
  }

  const onSnapshot = (s: Snapshot) => {
    if (s.phase !== lastPhase) {
      lastPhase = s.phase
      if (s.phase === 'ready') play('title', true)
      else if (s.phase === 'countdown') play('race', true)
      else if (s.phase === 'finished') play('ending', false)
    }
    engine?.update(
      s.speedKmh / 3.6,
      s.throttle,
      s.boost > 0,
      s.phase === 'racing' || s.phase === 'finished',
      offroad,
    )
  }

  const onEvent = (e: GameEvent) => {
    const c = ensure()
    if (!c || !sfxGain) return
    switch (e.type) {
      case 'pickup':
        if (e.kind === 'cookie') blip(c, sfxGain, [880, 1320], 0.09, 'sine', 0.35)
        else if (e.kind === 'key') arpeggio(c, sfxGain, [659, 988], 0.09, 'triangle', 0.4)
        else if (e.kind === 'passkey') arpeggio(c, sfxGain, [523, 659, 784, 1047], 0.08, 'triangle', 0.45)
        else if (e.kind === 'boost') sweep(c, sfxGain, 220, 1400, 0.45, 'sawtooth', 0.3)
        else arpeggio(c, sfxGain, [440, 554, 659], 0.1, 'square', 0.3)
        break
      case 'hit':
        thud(c, sfxGain)
        break
      case 'countdown':
        blip(c, sfxGain, [440], 0.12, 'square', 0.35)
        break
      case 'go':
        blip(c, sfxGain, [880], 0.35, 'square', 0.4)
        break
      case 'finish':
        arpeggio(c, sfxGain, [523, 659, 784, 1047, 784, 1047, 1319], 0.11, 'triangle', 0.5)
        break
      case 'offroad':
        offroad = e.on
        break
    }
  }

  return {
    unlock,
    onSnapshot,
    onEvent,
    setMuted: (m) => {
      muted = m
      writeMuted(m)
      if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.05)
    },
    muted: () => muted,
    dispose: () => {
      wanted = null
      current?.source.stop()
      engine?.dispose()
      ctx?.close().catch(() => undefined)
      ctx = null
    },
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}
function writeMuted(m: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, m ? '1' : '0')
  } catch {
    // Private mode: the preference just does not persist.
  }
}

// --------------------------------------------------------------------------------- one-shots

function blip(
  ctx: AudioContext,
  out: AudioNode,
  freqs: number[],
  dur: number,
  type: OscillatorType,
  vol: number,
) {
  const t = ctx.currentTime
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(freqs[0] ?? 440, t)
  if (freqs[1]) o.frequency.exponentialRampToValueAtTime(freqs[1], t + dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + dur + 0.02)
}

function arpeggio(
  ctx: AudioContext,
  out: AudioNode,
  freqs: number[],
  step: number,
  type: OscillatorType,
  vol: number,
) {
  const t0 = ctx.currentTime
  freqs.forEach((f, i) => {
    const t = t0 + i * step
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = f
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + step * 1.8)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + step * 2)
  })
}

function sweep(
  ctx: AudioContext,
  out: AudioNode,
  from: number,
  to: number,
  dur: number,
  type: OscillatorType,
  vol: number,
) {
  const t = ctx.currentTime
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(from, t)
  o.frequency.exponentialRampToValueAtTime(to, t + dur)
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.setValueAtTime(600, t)
  f.frequency.exponentialRampToValueAtTime(4000, t + dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.05)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(f).connect(g).connect(out)
  o.start(t)
  o.stop(t + dur + 0.02)
}

function thud(ctx: AudioContext, out: AudioNode) {
  const t = ctx.currentTime
  const noise = ctx.createBufferSource()
  noise.buffer = noiseBuffer(ctx, 0.3)
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.setValueAtTime(1200, t)
  f.frequency.exponentialRampToValueAtTime(120, t + 0.3)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.6, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
  noise.connect(f).connect(g).connect(out)
  noise.start(t)
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(110, t)
  o.frequency.exponentialRampToValueAtTime(40, t + 0.25)
  const og = ctx.createGain()
  og.gain.setValueAtTime(0.5, t)
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.25)
  o.connect(og).connect(out)
  o.start(t)
  o.stop(t + 0.3)
}

let noiseCache: AudioBuffer | null = null
function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  if (noiseCache && noiseCache.duration >= seconds) return noiseCache
  const len = Math.ceil(ctx.sampleRate * Math.max(seconds, 2))
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  noiseCache = buffer
  return buffer
}

// --------------------------------------------------------------------------------- engine

type Engine = {
  update: (speed: number, throttle: number, boost: boolean, running: boolean, offroad: boolean) => void
  dispose: () => void
}

/** A van engine: two detuned oscillators through a lowpass, plus filtered noise for the tyres. */
function createEngine(ctx: AudioContext, out: AudioNode): Engine {
  const gain = ctx.createGain()
  gain.gain.value = 0
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 400
  filter.Q.value = 2
  const a = ctx.createOscillator()
  a.type = 'sawtooth'
  const b = ctx.createOscillator()
  b.type = 'square'
  const bGain = ctx.createGain()
  bGain.gain.value = 0.35
  a.connect(filter)
  b.connect(bGain).connect(filter)
  filter.connect(gain).connect(out)
  a.start()
  b.start()

  const tyres = ctx.createBufferSource()
  tyres.buffer = noiseBuffer(ctx, 2)
  tyres.loop = true
  const tyreFilter = ctx.createBiquadFilter()
  tyreFilter.type = 'bandpass'
  tyreFilter.frequency.value = 900
  tyreFilter.Q.value = 0.6
  const tyreGain = ctx.createGain()
  tyreGain.gain.value = 0
  tyres.connect(tyreFilter).connect(tyreGain).connect(out)
  tyres.start()

  return {
    update: (speed, throttle, boost, running, offroad) => {
      const t = ctx.currentTime
      const k = Math.min(1, Math.abs(speed) / 17)
      // Fake gears: pitch climbs then drops three times across the speed range.
      const gear = (k * 3) % 1
      const rpm = 0.25 + gear * 0.6 + k * 0.3
      const freq = 48 + rpm * (boost ? 170 : 130)
      a.frequency.setTargetAtTime(freq, t, 0.08)
      b.frequency.setTargetAtTime(freq * 1.005, t, 0.08)
      filter.frequency.setTargetAtTime(300 + rpm * 1400 + Math.max(0, throttle) * 600, t, 0.1)
      const vol = running ? 0.08 + rpm * 0.1 + Math.max(0, throttle) * 0.05 : 0
      gain.gain.setTargetAtTime(vol, t, 0.1)
      tyreGain.gain.setTargetAtTime(running ? k * (offroad ? 0.22 : 0.07) : 0, t, 0.15)
      tyreFilter.frequency.setTargetAtTime(offroad ? 500 : 900 + k * 900, t, 0.2)
    },
    dispose: () => {
      a.stop()
      b.stop()
      tyres.stop()
    },
  }
}
