import { BREATH_HZ, breathState } from '@/scene/breath'
import { TRAVEL_LANDING } from '@/state/store'
import {
  engine, mix, BED, MASTER, later, clearTimer, noiseBuffer, estClock, audioEnabledNow,
} from './audio'
import { struck, sub, BELL, BELL_MAJOR, GLASS } from './timbre'

const masterDuck = () => MASTER * 0.55
import { noteOf, arrivalChord, tonesOf, branchOf, HEXATONIC } from './harmony'
import { placement } from './voices'
import { graph } from '@/content'

type Timer = ReturnType<typeof setTimeout>
let chimeTimer: Timer | null = null

const timeToExhale = (t: number) => {
  const w = 2 * Math.PI * BREATH_HZ
  const x = w * t + breathState.phase
  const k = Math.ceil((x - Math.PI / 2) / (2 * Math.PI))
  return Math.max(0, (2 * Math.PI * k + Math.PI / 2 - x) / w)
}

const chime = (when: number, hz: number, peak: number, dur: number, pan = 0) => {
  const e = engine
  if (!e) return
  struck(e.ctx, e.chimeBus, null, when, hz, peak, dur, {
    partials: GLASS,
    strike: 0.25,
    pan,
  })
}

const bell = (
  when: number,
  hz: number,
  peak: number,
  dur: number,
  pan = 0,
  major = false,
) => {
  const e = engine
  if (!e) return
  struck(e.ctx, e.strikeBus, e.room.send, when, hz, peak, dur, {
    partials: major ? BELL_MAJOR : BELL,
    strike: 1,
    pan,
    send: 0.35,
  })
}

const thump = (when: number, hz: number, peak: number, hold: number, ring: number) => {
  const e = engine
  if (!e) return
  const f = Math.max(30, hz)
  sub(e.ctx, e.subBus, when, f, peak, hold, ring)
  if (peak >= 0.05) {
    const d = e.bedDuck.gain
    d.cancelScheduledValues(when)
    d.setValueAtTime(d.value, when + 0.018)
    d.linearRampToValueAtTime(-6, when + 0.018 + Math.max(0.045, 3 / f))
    d.setTargetAtTime(0, when + 0.018 + hold, 0.45)
  }
}

const panOf = (id: string) => placement.get(id)?.pan ?? 0
const gainAt = (id: string) => Math.max(0.3, placement.get(id)?.g ?? 0.5)

const pickSource = (currentId: string): { hz: number; pan: number } => {
  if (Math.random() < 0.65) {
    const branch = branchOf(currentId)
    const hub = graph.nodes.get(branch)
    const familyIds = [branch, ...(hub?.children ?? [])]
    const id = familyIds[(Math.random() * familyIds.length) | 0]
    const oct = [0.5, 1, 2][(Math.random() * 3) | 0]
    return { hz: Math.min(1318.51, noteOf(id).hover * oct), pan: panOf(id) }
  }
  return { hz: HEXATONIC[(Math.random() * HEXATONIC.length) | 0], pan: Math.random() * 1.2 - 0.6 }
}

const nextChime = (delayS: number) => {
  chimeTimer = later(
    () => {
      const e = engine
      if (!e || !audioEnabledNow()) return
      const src = pickSource(currentIdHint || graph.rootId)
      const exhale = timeToExhale(estClock())
      chime(
        e.ctx.currentTime + exhale + 0.15,
        src.hz,
        0.05 + Math.random() * 0.05,
        3.4 + Math.random() * 2.6,
        src.pan,
      )
      nextChime(7 + Math.random() * 9)
    },
    delayS * 1000,
  )
}

let currentIdHint = ''
export const setCurrentIdHint = (id: string) => {
  currentIdHint = id
}

export const stopChimes = () => {
  clearTimer(chimeTimer)
  chimeTimer = null
}

export const startChimes = () => {
  stopChimes()
  const e = engine
  if (e) {
    const src = pickSource(currentIdHint || graph.rootId)
    chime(e.ctx.currentTime + 0.35, src.hz, 0.06, 4.2, src.pan)
  }
  nextChime(6 + Math.random() * 5)
}

let reprised = false
export const confirmBloom = (currentId: string) => {
  if (!engine) return
  if (reprised) {
    const t = engine.ctx.currentTime
    chime(t + 0.02, noteOf(currentId).hover, 0.05, 2.5, panOf(currentId))
    return
  }
  reprised = true
  playIgnition(currentId, 0.62)
}

export const farewell = () => {
  const e = engine
  if (!e) return
  chime(e.ctx.currentTime + 0.01, 220, 0.02, 0.4, 0)
}

export const playHover = (id: string) => {
  const e = engine
  if (!e || !audioEnabledNow() || e.ctx.state !== 'running') return
  const t = e.ctx.currentTime
  if (t < mix.passageUntil) return
  if (t < mix.lastPing + 0.35) return
  if (id === mix.lastPingId && t < mix.lastPing + 0.9) return
  mix.lastPing = t
  mix.lastPingId = id
  chime(t + 0.02, noteOf(id).hover, 0.035, 0.5, panOf(id))
}

const arrive = (destId: string, when: number, peakScale = 1) => {
  const root = noteOf(destId).drone
  let f = root / 2
  while (f < 32) f *= 2
  thump(when, f, 0.185 * peakScale, 0.35, 2.6)

  let bass = root
  while (bass > 130) bass /= 2
  engine?.tide.slashTo(bass)

  const chord = arrivalChord(destId)
  bell(when, root, 0.30 * peakScale, 5.2, panOf(destId))
  const peaks = [0.055, 0.042, 0.032]
  chord.forEach((hz, i) => {
    chime(when + 0.07 + i * 0.07, hz, (peaks[i] ?? 0.03) * peakScale, 4 + i, 0)
  })
}

export const playIgnition = (id: string, scale = 1) => {
  const e = engine
  if (!e || !audioEnabledNow() || e.ctx.state !== 'running') return
  const t = e.ctx.currentTime + 0.02
  const root = noteOf(id).drone

  mix.passageUntil = t + 1.2
  mix.bedBusyUntil = performance.now() + 5200

  const m = e.master.gain
  if (m.cancelAndHoldAtTime) m.cancelAndHoldAtTime(t)
  else m.cancelScheduledValues(t)
  m.setValueAtTime(m.value, t)
  const duck = masterDuck() * scale + MASTER * (1 - scale)
  m.linearRampToValueAtTime(duck, t + 0.10)
  m.linearRampToValueAtTime(MASTER * (1 + 0.10 * scale), t + 0.145)
  m.setTargetAtTime(MASTER, t + 0.7, 1.3)

  const hit = t + 0.145
  bell(hit, root, 0.42 * scale, 9.0, 0, false)
  bell(hit + 0.012, root * 2, 0.28 * scale, 6.5, 0, false)
  let f = root / 2
  while (f < 32) f *= 2
  thump(hit, f, 0.28 * scale, 0.40, 4.2)

  const bed = e.bedGain
  bed.gain.cancelScheduledValues(t)
  bed.gain.setValueAtTime(bed.gain.value, t)
  bed.gain.linearRampToValueAtTime(BED * 1.45, hit + 0.9)
  bed.gain.setTargetAtTime(BED, hit + 2.2, 1.1)
}

export const playEmber = (id: string) => {
  const e = engine
  if (!e || !audioEnabledNow() || e.ctx.state !== 'running') return
  const t = e.ctx.currentTime + 0.02
  const root = noteOf(id).drone
  bell(t, root, 0.05, 7.0, panOf(id))
  thump(t + 0.05, Math.max(32, root / 2), 0.03, 0.5, 2.2)
}

export const playResolve = (id: string) => {
  const e = engine
  if (!e || !audioEnabledNow() || e.ctx.state !== 'running') return
  const t = e.ctx.currentTime
  arrivalChord(id).forEach((hz, i) => {
    chime(t + 0.03 + i * 0.09, hz, 0.028, 3.5 + i * 0.5, panOf(id) * 0.5)
  })
}

export const playPassage = (destId: string | null) => {
  const e = engine
  if (!e || !audioEnabledNow() || e.ctx.state !== 'running') return

  const t = e.ctx.currentTime
  mix.passageUntil = t + 2.6
  mix.bedBusyUntil = performance.now() + 2600

  const src = e.ctx.createBufferSource()
  src.buffer = noiseBuffer(e.ctx)
  src.loop = true
  const bp = e.ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 1.1
  const g = e.ctx.createGain()
  const send = e.ctx.createGain()
  send.gain.value = 0.22

  bp.frequency.setValueAtTime(260, t)
  bp.frequency.exponentialRampToValueAtTime(1700, t + 0.9)
  bp.frequency.exponentialRampToValueAtTime(430, t + 2.35)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.085, t + 0.9)
  g.gain.linearRampToValueAtTime(0.05, t + 1.7)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6)

  src.playbackRate.setValueAtTime(1, t)
  src.playbackRate.linearRampToValueAtTime(1.06, t + 1.2)
  src.playbackRate.linearRampToValueAtTime(0.97, t + 1.9)
  src.playbackRate.linearRampToValueAtTime(1, t + 2.2)

  src.connect(bp).connect(g)
  g.connect(e.master)
  g.connect(send)
  send.connect(e.room.send)
  src.start(t)
  src.stop(t + 2.7)
  src.onended = () => {
    src.disconnect()
    bp.disconnect()
    g.disconnect()
    send.disconnect()
  }

  if (destId) {
    const chord = arrivalChord(destId)
    const ladder = [...chord].sort((a, b) => a - b)
    const peaks = [0.075, 0.06, 0.05]
    ladder.slice(0, 3).forEach((hz, i) => {
      chime(t + 0.4 + i * 0.35, hz, peaks[i] ?? 0.05, 2.8, panOf(destId))
    })

    const latency = Math.min(0.25, e.ctx.outputLatency || 0)
    arrive(destId, t + Math.max(0.2, TRAVEL_LANDING - latency))
  }

  const bed = e.bedGain
  bed.gain.cancelScheduledValues(t)
  bed.gain.setValueAtTime(bed.gain.value, t)
  bed.gain.linearRampToValueAtTime(0.1, t + 0.3)
  bed.gain.linearRampToValueAtTime(BED * 1.30, t + TRAVEL_LANDING + 0.25)
  bed.gain.setTargetAtTime(BED, t + TRAVEL_LANDING + 0.9, 0.9)
}

export const condensedArrival = (destId: string) => {
  const e = engine
  if (!e || !audioEnabledNow() || e.ctx.state !== 'running') return
  const t = e.ctx.currentTime
  mix.passageUntil = t + 1.2
  arrive(destId, t + 0.35, 0.8)
}

let picardyDone = false
export const picardyReady = () => !picardyDone

export const playPicardy = (id: string) => {
  const e = engine
  if (!e || picardyDone) return
  picardyDone = true
  if (!audioEnabledNow() || e.ctx.state !== 'running') return

  const t = e.ctx.currentTime + 0.02
  const root = noteOf(id).drone
  mix.bedBusyUntil = performance.now() + 6000

  bell(t, root, 0.34, 11.0, 0, true)
  bell(t + 0.09, root * 1.5, 0.20, 8.0, -0.2, true)
  let f = root / 2
  while (f < 32) f *= 2
  thump(t, f, 0.22, 0.45, 5.0)

  const a = e.airGain.gain
  a.cancelScheduledValues(t)
  a.setValueAtTime(a.value, t)
  a.linearRampToValueAtTime(0.045, t + 4.0)
  a.setTargetAtTime(0.014, t + 5.0, 1.6)

  const bed = e.bedGain
  bed.gain.cancelScheduledValues(t)
  bed.gain.setValueAtTime(bed.gain.value, t)
  bed.gain.linearRampToValueAtTime(BED * 1.35, t + 2.0)
  bed.gain.setTargetAtTime(BED, t + 4.5, 1.4)
}

export type UiSound =
  | 'tick'
  | 'map-open'
  | 'map-close'
  | 'recentre'
  | 'home'

export const playUi = (kind: UiSound) => {
  const e = engine
  if (!e || !audioEnabledNow() || e.ctx.state !== 'running') return
  const t = e.ctx.currentTime
  const tones = tonesOf(branchOf(currentIdHint || graph.rootId))
  const root = tones[0].hover / 2
  const fifth = (tones[1] ?? tones[0]).hover / 2

  switch (kind) {
    case 'tick':
      chime(t + 0.01, 1400, 0.012, 0.08, 0)
      break
    case 'map-open':
      chime(t + 0.01, root, 0.02, 0.5, -0.15)
      chime(t + 0.09, fifth, 0.02, 0.6, 0.15)
      break
    case 'map-close':
      chime(t + 0.01, fifth, 0.018, 0.4, 0.15)
      chime(t + 0.09, root, 0.018, 0.5, -0.15)
      break
    case 'recentre':
      chime(t + 0.01, 440, 0.02, 0.6, 0)
      break
    case 'home':
      chime(t + 0.01, 110, 0.02, 0.5, 0)
      break
  }
}

export const playHearthFlare = (id: string, visualDur: number) => {
  const e = engine
  if (!e || !audioEnabledNow()) return
  const when = e.ctx.currentTime + Math.max(0.05, visualDur / 2 - 0.2)
  bell(when, noteOf(id).drone * 2, 0.12 * gainAt(id), 6.5, panOf(id))
}

export const playMigration = (fromId: string, toId: string, dur: number) => {
  const e = engine
  if (!e || !audioEnabledNow()) return
  const t = e.ctx.currentTime
  const p0 = panOf(fromId)
  const p1 = panOf(toId)
  const grains = 9
  for (let i = 0; i < grains; i++) {
    const at = t + (i / grains) * dur + Math.random() * 0.3
    const src = e.ctx.createBufferSource()
    src.buffer = noiseBuffer(e.ctx)
    src.loop = true
    const bp = e.ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 900 + Math.random() * 900
    bp.Q.value = 6
    const g = e.ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(0.012, at + 0.09)
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5)
    const p = e.ctx.createStereoPanner()
    p.pan.value = p0 + (p1 - p0) * (i / (grains - 1))
    src.connect(bp).connect(g).connect(p).connect(e.chimeBus)
    src.start(at)
    src.stop(at + 0.6)
    src.onended = () => {
      src.disconnect()
      bp.disconnect()
      g.disconnect()
      p.disconnect()
    }
  }
}

export const playAuroraVeil = (dur: number) => {
  const e = engine
  if (!e || !audioEnabledNow()) return
  const t = e.ctx.currentTime
  for (const [hz, cents] of [
    [220, -3],
    [329.63, 3],
  ] as const) {
    const o = e.ctx.createOscillator()
    o.frequency.value = hz
    o.detune.value = cents
    const g = e.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.03, t + dur * 0.45)
    g.gain.linearRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(e.chimeBus)
    o.start(t)
    o.stop(t + dur + 0.1)
    o.onended = () => {
      o.disconnect()
      g.disconnect()
    }
  }
}

export const playDeepBreath = () => {
  const e = engine
  if (!e || !audioEnabledNow()) return
  const t = e.ctx.currentTime
  const period = 1 / BREATH_HZ
  const o = e.ctx.createOscillator()
  o.frequency.value = 55
  const g = e.ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.02, t + period * 0.4)
  g.gain.linearRampToValueAtTime(0.0001, t + period)
  o.connect(g).connect(e.master)
  o.start(t)
  o.stop(t + period + 0.1)
  o.onended = () => {
    o.disconnect()
    g.disconnect()
  }
}

export const playClerestory = (dur: number) => {
  const e = engine
  if (!e || !audioEnabledNow()) return
  const t = e.ctx.currentTime
  const tones = tonesOf(branchOf(currentIdHint || graph.rootId))
  for (let i = 0; i < 3; i++) {
    const tone = tones[i % tones.length]
    chime(t + dur * 0.35 + i * 0.55, Math.min(1318.51, tone.hover * 2), 0.022, 5, (i - 1) * 0.4)
  }
}

export const playSwellEvent = (dur: number) => {
  const e = engine
  if (!e || !audioEnabledNow()) return
  const t = e.ctx.currentTime
  mix.bedLpBusyUntil = performance.now() + (dur + 1.5) * 1000
  const f = e.bedLp.frequency
  f.cancelScheduledValues(t)
  f.setValueAtTime(f.value, t)
  f.linearRampToValueAtTime(520, t + dur * 0.45)
  f.linearRampToValueAtTime(1150, t + dur + 1.2)
  thump(t + dur * 0.2, 41.2, 0.04, dur * 0.4, 2)
}

export const playQuake = () => {
  const e = engine
  if (!e || !audioEnabledNow()) return
  const t = e.ctx.currentTime + 0.02
  const root = noteOf(currentIdHint || graph.rootId).drone
  let f = root / 4
  while (f < 32) f *= 2
  thump(t, f, 0.16, 0.3, 2.4)
  bell(t + 0.03, root / 2, 0.10, 7, 0)
}

export const playToll = () => {
  const e = engine
  if (!e || !audioEnabledNow()) return
  const t = e.ctx.currentTime
  const root = noteOf(currentIdHint || graph.rootId).drone
  bell(t + 0.05, root * 4, 0.055, 9, Math.random() * 0.8 - 0.4)
}

export const resetScore = () => {
  stopChimes()
  reprised = false
  picardyDone = false
  mix.passageUntil = 0
  mix.lastPing = 0
  mix.lastPingId = ''
}
