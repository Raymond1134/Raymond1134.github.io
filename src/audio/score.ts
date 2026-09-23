import { Vector3 } from 'three'
import { BREATH_HZ, breathState } from '@/scene/breath'
import { worldEvents } from '@/scene/worldEvents'
import { TRAVEL_LANDING, useStore } from '@/state/store'
import type { Quality } from '@/state/store'
import {
  engine, mix, BED, MASTER, later, clearTimer, noiseBuffer, estClock, audioEnabledNow, audioWanted,
  outputDelay, bloomRoom,
} from './audio'
import { struck, sub, brownStereo, BELL, BELL_MAJOR, GLASS } from './timbre'
import { noteOf, arrivalChord, tonesOf, branchOf, inKey, majorTierce, HEXATONIC } from './harmony'
import { placement, locate } from './voices'
import { graph } from '@/content'

const masterDuck = () => MASTER * 0.55

type Timer = ReturnType<typeof setTimeout>
let chimeTimer: Timer | null = null

const timeToExhale = (t: number) => {
  const w = 2 * Math.PI * BREATH_HZ
  const x = w * t + breathState.phase
  const k = Math.ceil((x - Math.PI / 2) / (2 * Math.PI))
  return Math.max(0, (2 * Math.PI * k + Math.PI / 2 - x) / w)
}

const FAR_D = 220

const BELL_KEEP: Record<Quality, number> = { low: 5, medium: 6, high: 9, ultra: 9 }
const GLASS_KEEP: Record<Quality, number> = { low: 4, medium: 5, high: 5, ultra: 5 }
const SING_OUT = 0.08

const key = (hz: number) => inKey(hz, engine?.tide.isMajor() ?? false)
const lean = () => mix.tier === 'low' || mix.tier === 'medium'

const chime = (when: number, hz: number, peak: number, dur: number, pan = 0, far = 0.2) => {
  const e = engine
  if (!e) return 0
  const heard = peak * (1 - 0.3 * far)
  struck(e.ctx, e.chimeBus, e.room.send, when, key(hz), heard, dur, {
    partials: GLASS,
    strike: lean() ? 0 : 0.25,
    pan,
    send: 0.04 + 0.42 * far,
    tilt: 1 - 0.4 * far,
    limit: GLASS_KEEP[mix.tier],
  })
  return heard
}

const onsetAt = (c: AudioContext, when: number) => {
  const rough = performance.now() + (when - c.currentTime + outputDelay(c)) * 1000
  if (typeof c.getOutputTimestamp !== 'function') return rough
  const ts = c.getOutputTimestamp()
  if (!ts.contextTime || !ts.performanceTime) return rough
  const precise = ts.performanceTime + (when - ts.contextTime) * 1000
  return Math.abs(precise - rough) < 400 ? precise : rough
}

const sing = (id: string, when: number, peak: number) => {
  const e = engine
  if (!e || peak <= 0) return
  const at = onsetAt(e.ctx, when)
  later(() => {
    if (engine !== e || !audioEnabledNow() || e.ctx.state !== 'running') return
    const s = worldEvents.sing
    s.id = id
    s.at = at
    s.mag = Math.min(1, peak / SING_OUT)
  }, Math.max(0, at - performance.now()))
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
  const f = key(hz)
  struck(e.ctx, e.strikeBus, e.room.send, when, f, peak, dur, {
    partials: major || (e.tide.isMajor() && majorTierce(f)) ? BELL_MAJOR : BELL,
    strike: 1,
    pan,
    send: 0.35,
    limit: BELL_KEEP[mix.tier],
  })
}

const thump = (when: number, hz: number, peak: number, hold: number, ring: number) => {
  const e = engine
  if (!e) return
  const f = key(Math.max(30, hz))
  sub(e.ctx, e.subBus, when, f, peak, hold, ring, mix.phone)
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
const farOf = (id: string) => Math.min(1, (placement.get(id)?.d ?? 60) / FAR_D)

const pickSource = (currentId: string): { id: string | null; hz: number; pan: number; far: number } => {
  if (Math.random() < 0.65) {
    const branch = branchOf(currentId)
    const hub = graph.nodes.get(branch)
    const familyIds = [branch, ...(hub?.children ?? [])]
    const id = familyIds[(Math.random() * familyIds.length) | 0]
    const oct = [0.5, 1, 2][(Math.random() * 3) | 0]
    return { id, hz: Math.min(1318.51, noteOf(id).hover * oct), pan: panOf(id), far: farOf(id) }
  }
  return {
    id: null,
    hz: HEXATONIC[(Math.random() * HEXATONIC.length) | 0],
    pan: Math.random() * 1.2 - 0.6,
    far: 0.2 + Math.random() * 0.6,
  }
}

const nextGap = () => (7 + Math.random() * 9) * mix.chimeRate

const nextChime = (delayS: number) => {
  chimeTimer = later(
    () => {
      const e = engine
      if (!e || !audioEnabledNow()) return
      if (e.ctx.state !== 'running') {
        nextChime(nextGap())
        return
      }
      const src = pickSource(currentIdHint || graph.rootId)
      const when = e.ctx.currentTime + timeToExhale(estClock()) + 0.15
      const peak = (0.05 + Math.random() * 0.05) * mix.chimeSoft
      const heard = chime(when, src.hz, peak, 3.4 + Math.random() * 2.6, src.pan, src.far)
      if (src.id) sing(src.id, when, heard)
      nextChime(nextGap())
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
    chime(e.ctx.currentTime + 0.35, src.hz, 0.06, 4.2, src.pan, src.far)
  }
  nextChime((6 + Math.random() * 5) * mix.chimeRate)
}

let reprised = false
let igniteOwed = false

export const confirmBloom = (currentId: string) => {
  if (!engine) return
  igniteOwed = false
  if (reprised) {
    const t = engine.ctx.currentTime
    chime(t + 0.02, noteOf(currentId).hover, 0.05, 2.5, panOf(currentId), farOf(currentId))
    return
  }
  if (playIgnition(currentId, 0.62)) reprised = true
}

export const repayIgnition = () => {
  if (!igniteOwed) return
  igniteOwed = false
  later(() => {
    const s = useStore.getState()
    if (reprised || s.phase !== 'idle') return
    if (s.textMode) {
      igniteOwed = true
      return
    }
    if (playIgnition(s.currentId, 0.55)) {
      reprised = true
      worldEvents.soundGlintAt = performance.now()
    }
  }, 240)
}

export const farewell = () => {
  const e = engine
  if (!e) return
  chime(e.ctx.currentTime + 0.01, 220, 0.02, 0.4, 0, 0.1)
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
  sing(id, t + 0.02, chime(t + 0.02, noteOf(id).hover, 0.035, 0.5, panOf(id), farOf(id)))
}

const arrive = (destId: string, when: number, peakScale = 1) => {
  const root = noteOf(destId).drone
  let f = root / 2
  while (f < 32) f *= 2
  thump(when, f, 0.185 * peakScale, 0.35, 2.6)

  let bass = root
  while (bass > 130) bass /= 2
  engine?.tide.slashTo(key(bass))

  const chord = arrivalChord(destId)
  bell(when, root, 0.30 * peakScale, 5.2, panOf(destId))
  const peaks = [0.055, 0.042, 0.032]
  const own = chord.length - 1
  chord.forEach((hz, i) => {
    const at = when + 0.07 + i * 0.07
    const heard = chime(at, hz, (peaks[i] ?? 0.03) * peakScale, 4 + i, 0, 0.05)
    if (i === own) sing(destId, at, heard)
  })
  bloomRoom(when, 1 + 0.45 * peakScale, 1.2)
}

export const playIgnition = (id: string, scale = 1) => {
  const e = engine
  if (!e || !audioEnabledNow() || e.ctx.state !== 'running') {
    if (audioWanted() && !reprised) igniteOwed = true
    return false
  }
  igniteOwed = false
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
  bloomRoom(hit, 1.5 + 0.2 * scale, 1.6)
  let f = root / 2
  while (f < 32) f *= 2
  thump(hit, f, 0.28 * scale, 0.40, 4.2)

  const bed = e.bedGain
  bed.gain.cancelScheduledValues(t)
  bed.gain.setValueAtTime(bed.gain.value, t)
  bed.gain.linearRampToValueAtTime(BED * 1.45, hit + 0.9)
  bed.gain.setTargetAtTime(BED, hit + 2.2, 1.1)
  return true
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
    chime(t + 0.03 + i * 0.09, hz, 0.028, 3.5 + i * 0.5, panOf(id) * 0.5, farOf(id))
  })
}

let landed = true

export const playPassage = (destId: string | null) => {
  landed = !destId
  const e = engine
  if (!e || !audioEnabledNow() || e.ctx.state !== 'running') return

  const t = e.ctx.currentTime
  mix.passageUntil = t + 2.6
  mix.bedBusyUntil = performance.now() + (TRAVEL_LANDING + 2.9) * 1000

  const src = e.ctx.createBufferSource()
  src.buffer = brownStereo(e.ctx)
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
      chime(t + 0.4 + i * 0.35, hz, peaks[i] ?? 0.05, 2.8, panOf(destId), farOf(destId) * (1 - i * 0.3))
    })
  }

  const bed = e.bedGain
  bed.gain.cancelScheduledValues(t)
  bed.gain.setValueAtTime(bed.gain.value, t)
  bed.gain.linearRampToValueAtTime(0.1, t + 0.3)
  bed.gain.linearRampToValueAtTime(BED * 1.30, t + TRAVEL_LANDING + 0.25)
  bed.gain.setTargetAtTime(BED, t + TRAVEL_LANDING + 0.9, 0.9)
}

export const approachLanding = (id: string, remaining: number) => {
  if (landed) return
  const e = engine
  if (!e || !audioEnabledNow() || e.ctx.state !== 'running') return
  const lead = outputDelay(e.ctx)
  if (remaining > lead + 0.04) return
  landed = true
  arrive(id, e.ctx.currentTime + Math.max(0.01, remaining - lead))
}

export const playLanding = (id: string) => {
  if (landed) return
  landed = true
  const e = engine
  if (!e || !audioEnabledNow() || e.ctx.state !== 'running') return
  arrive(id, e.ctx.currentTime + 0.01)
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
  mix.bedBusyUntil = performance.now() + 8000
  mix.airBusyUntil = performance.now() + 9000

  bell(t, root, 0.34, 11.0, 0, true)
  bell(t + 0.09, root * 1.5, 0.20, 8.0, -0.2, true)
  bloomRoom(t, 1.7, 2.2)
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
  if (!e || !audioEnabledNow() || e.ctx.state !== 'running') return
  const when = e.ctx.currentTime + Math.max(0.05, visualDur / 2 - 0.2)
  bell(when, noteOf(id).drone * 2, 0.12 * gainAt(id), 6.5, panOf(id))
}

const along = new Vector3()

export const playMigration = (from: Vector3, to: Vector3, dur: number) => {
  const e = engine
  if (!e || !audioEnabledNow() || e.ctx.state !== 'running') return
  const t = e.ctx.currentTime
  const grains = 9
  for (let i = 0; i < grains; i++) {
    const k = i / grains
    const at = t + k * dur + Math.random() * 0.3
    const here = locate(along.copy(from).lerp(to, k))
    const peak = 0.012 * (0.7 + 0.6 * here.g)
    const src = e.ctx.createBufferSource()
    src.buffer = noiseBuffer(e.ctx)
    src.loop = true
    const bp = e.ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 900 + Math.random() * 900
    bp.Q.value = 6
    const g = e.ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(peak, at + 0.09)
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5)
    const p = e.ctx.createStereoPanner()
    p.pan.value = here.pan
    const send = e.ctx.createGain()
    send.gain.value = 0.2
    src.connect(bp).connect(g).connect(p).connect(e.chimeBus)
    p.connect(send).connect(e.room.send)
    src.start(at)
    src.stop(at + 0.6)
    src.onended = () => {
      src.disconnect()
      bp.disconnect()
      g.disconnect()
      p.disconnect()
      send.disconnect()
    }
  }
}

export const playAuroraVeil = (dur: number) => {
  const e = engine
  if (!e || !audioEnabledNow() || e.ctx.state !== 'running') return
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
    const send = e.ctx.createGain()
    send.gain.value = 0.2
    o.connect(g).connect(e.chimeBus)
    g.connect(send).connect(e.room.send)
    o.start(t)
    o.stop(t + dur + 0.1)
    o.onended = () => {
      o.disconnect()
      g.disconnect()
      send.disconnect()
    }
  }
}

export const playDeepBreath = () => {
  const e = engine
  if (!e || !audioEnabledNow() || e.ctx.state !== 'running') return
  const t = e.ctx.currentTime
  const period = 1 / BREATH_HZ
  const layers: [number, number][] = mix.phone ? [[55, 0.02], [110, 0.012]] : [[55, 0.02]]
  for (const [hz, peak] of layers) {
    const o = e.ctx.createOscillator()
    o.frequency.value = hz
    const g = e.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(peak, t + period * 0.4)
    g.gain.linearRampToValueAtTime(0.0001, t + period)
    o.connect(g).connect(e.master)
    o.start(t)
    o.stop(t + period + 0.1)
    o.onended = () => {
      o.disconnect()
      g.disconnect()
    }
  }
}

export const playClerestory = (dur: number) => {
  const e = engine
  if (!e || !audioEnabledNow() || e.ctx.state !== 'running') return
  const t = e.ctx.currentTime
  const tones = tonesOf(branchOf(currentIdHint || graph.rootId))
  for (let i = 0; i < 3; i++) {
    const tone = tones[i % tones.length]
    chime(t + dur * 0.35 + i * 0.55, Math.min(1318.51, tone.hover * 2), 0.022, 5, (i - 1) * 0.4, 0.55)
  }
}

export const playSwellEvent = (dur: number) => {
  const e = engine
  if (!e || !audioEnabledNow() || e.ctx.state !== 'running') return
  const t = e.ctx.currentTime
  mix.bedLpBusyUntil = performance.now() + (dur + 1.5) * 1000
  const f = e.bedLp.frequency
  f.cancelScheduledValues(t)
  f.setValueAtTime(f.value, t)
  f.linearRampToValueAtTime(520, t + dur * 0.45)
  f.linearRampToValueAtTime(mix.lpBase, t + dur + 1.2)
  thump(t + dur * 0.2, 41.2, 0.04, dur * 0.4, 2)
}

export const playQuake = () => {
  const e = engine
  if (!e || !audioEnabledNow() || e.ctx.state !== 'running') return
  const t = e.ctx.currentTime + 0.02
  const root = noteOf(currentIdHint || graph.rootId).drone
  let f = root / 4
  while (f < 32) f *= 2
  thump(t, f, 0.16, 0.3, 2.4)
  bell(t + 0.03, root / 2, 0.10, 7, 0)
}

export const playToll = () => {
  const e = engine
  if (!e || !audioEnabledNow() || e.ctx.state !== 'running') return
  const t = e.ctx.currentTime
  const root = noteOf(currentIdHint || graph.rootId).drone
  bell(t + 0.05, root * 4, 0.055, 9, Math.random() * 0.8 - 0.4)
}

export const resetScore = () => {
  stopChimes()
  reprised = false
  igniteOwed = false
  landed = true
  picardyDone = false
  mix.passageUntil = 0
  mix.lastPing = 0
  mix.lastPingId = ''
}
