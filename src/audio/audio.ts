import * as THREE from 'three'
import { BREATH_HZ, breath } from '@/scene/breath'
import { useStore } from '@/state/store'
import type { Quality } from '@/state/store'
import { createRoom, forgetRooms, RT60_TIER } from './room'
import type { Room } from './room'
import { createVoices } from './voices'
import type { VoicePool } from './voices'
import { createTide } from './tide'
import type { TideCtl } from './tide'
import {
  startChimes, stopChimes, confirmBloom, repayIgnition, farewell, resetScore, picardyReady,
} from './score'
import { brownNoise, brownStereo, blueNoise, forgetNoise, forgetWaves } from './timbre'
import { worldEvents } from '@/scene/worldEvents'

const KEY = 'aether.audio'

export const MASTER = 0.8
export const BED = 0.24
const FADE_IN = 1.2
const FADE_OUT = 0.6

const LP_WORLD = 1150
const LP_PHONE = 1400
const AMBIENT_MS = 250

const VOICE_BUDGET: Record<Quality, number> = { low: 2, medium: 2, high: 3, ultra: 4 }

export type AudioSpace = 'world' | 'map' | 'text'

interface SpaceShape {
  lp: number
  room: number
  dry: number
  rate: number
  soft: number
}

const SPACES: Record<AudioSpace, SpaceShape> = {
  world: { lp: 1, room: 1, dry: 1, rate: 1, soft: 1 },
  map: { lp: 0.68, room: 1.7, dry: 0.7, rate: 1, soft: 0.9 },
  text: { lp: 0.8, room: 1.2, dry: 0.55, rate: 1.6, soft: 0.7 },
}

type Timer = ReturnType<typeof setTimeout>

interface Engine {
  ctx: AudioContext
  master: GainNode
  bedGain: GainNode
  bedLp: BiquadFilterNode
  bedDuck: BiquadFilterNode
  chimeBus: GainNode
  room: Room
  voices: VoicePool
  moveGain: GainNode
  moveBp: BiquadFilterNode
  strikeBus: GainNode
  strikeSend: GainNode
  subBus: GainNode
  airGain: GainNode
  tide: TideCtl
}

export let engine: Engine | null = null

export const mix = {
  passageUntil: 0,
  lastPing: 0,
  lastPingId: '',
  bedBusyUntil: 0,
  bedLpBusyUntil: 0,
  airBusyUntil: 0,
  clock: { t: 0, at: typeof performance !== 'undefined' ? performance.now() : 0 },
  tier: 'high' as Quality,
  phone: false,
  lpBase: LP_WORLD,
  roomBase: 1,
  chimeRate: 1,
  chimeSoft: 1,
}

export const estClock = () => mix.clock.t + (performance.now() - mix.clock.at) / 1000

let nodes: AudioNode[] = []
let moveSrc: AudioBufferSourceNode | null = null
let airSrc: AudioBufferSourceNode | null = null

let enabled = false
let hidden = false
let suspendTimer: Timer | null = null
let startSeq = 0
let resumeArmed = false
let space: AudioSpace = 'world'
let ambientTimer: ReturnType<typeof setInterval> | null = null

const timers = new Set<Timer>()

export const later = (fn: () => void, ms: number) => {
  const id = setTimeout(() => {
    timers.delete(id)
    fn()
  }, ms)
  timers.add(id)
  return id
}

export const clearTimer = (id: Timer | null) => {
  if (id === null) return
  clearTimeout(id)
  timers.delete(id)
}

const remember = (on: boolean) => {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {}
}

export const restoreAudioPreference = () => {
  try {
    enabled = localStorage.getItem(KEY) !== 'off'
  } catch {
    enabled = true
  }
  return enabled
}

export const audioLive = () => engine !== null
export const audioRunning = () => engine !== null && engine.ctx.state === 'running'
export const audioEnabledNow = () => enabled && !hidden
export const audioWanted = () => enabled

export const outputDelay = (c: AudioContext) =>
  Math.min(0.3, (c.baseLatency || 0) + (c.outputLatency || 0))

const GESTURES = ['pointerdown', 'pointerup', 'click', 'keydown'] as const

const resumeOnGesture = () => {
  const e = engine
  if (!e || !enabled || e.ctx.state === 'running') {
    disarmResume()
    return
  }
  if (!hidden) e.ctx.resume().catch(() => {})
}

const armResume = () => {
  if (resumeArmed) return
  resumeArmed = true
  for (const k of GESTURES) addEventListener(k, resumeOnGesture, { passive: true })
}

const disarmResume = () => {
  if (!resumeArmed) return
  resumeArmed = false
  for (const k of GESTURES) removeEventListener(k, resumeOnGesture)
}

export const noiseBuffer = (c: AudioContext) => brownNoise(c)

const build = (): Engine => {
  const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession
  if (session) session.type = 'ambient'

  const c = new AudioContext({ latencyHint: 'playback' })
  c.onstatechange = () => {
    if (c.state === 'running') disarmResume()
    else if (c.state !== 'closed' && enabled && !hidden) armResume()
  }
  const boot = useStore.getState()
  const quality = boot.quality
  const phone = boot.compact
  mix.tier = quality
  mix.phone = phone
  mix.lpBase = (phone ? LP_PHONE : LP_WORLD) * SPACES[space].lp

  const limiter = c.createDynamicsCompressor()
  limiter.threshold.value = -3
  limiter.ratio.value = 20
  limiter.knee.value = 0
  limiter.attack.value = 0.003
  limiter.release.value = 0.05
  limiter.connect(c.destination)

  const out = c.createGain()
  out.gain.value = 0
  out.connect(limiter)

  const glue = c.createDynamicsCompressor()
  glue.threshold.value = -18
  glue.ratio.value = 2
  glue.knee.value = 12
  glue.attack.value = 0.02
  glue.release.value = 0.35
  glue.connect(out)

  const room = createRoom(c, out, RT60_TIER[quality])

  const bed = c.createGain()
  bed.gain.value = BED
  bed.connect(glue)
  const bedSend = c.createGain()
  bedSend.gain.value = 0.05
  bed.connect(bedSend).connect(room.send)

  const bedDuck = c.createBiquadFilter()
  bedDuck.type = 'lowshelf'
  bedDuck.frequency.value = 160
  bedDuck.gain.value = 0
  bedDuck.connect(bed)

  const bedMud = c.createBiquadFilter()
  bedMud.type = 'peaking'
  bedMud.frequency.value = 240
  bedMud.Q.value = 1.1
  bedMud.gain.value = phone ? -1.5 : -4
  bedMud.connect(bedDuck)

  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = mix.lpBase
  lp.Q.value = 0.4
  lp.connect(bedMud)

  const tide = createTide(c, lp, () => !picardyReady(), phone)

  const bus = c.createGain()
  bus.connect(out)
  const chimeSend = c.createGain()
  chimeSend.gain.value = 0.25
  bus.connect(chimeSend).connect(room.send)

  const delay = c.createDelay(1)
  delay.delayTime.value = 0.31
  const fb = c.createGain()
  fb.gain.value = 0.34
  const damp = c.createBiquadFilter()
  damp.type = 'lowpass'
  damp.frequency.value = 2200
  const wet = c.createGain()
  wet.gain.value = 0.22
  const toRoom = c.createGain()
  toRoom.gain.value = 0.3
  bus.connect(delay)
  delay.connect(damp).connect(fb).connect(delay)
  delay.connect(wet).connect(out)
  delay.connect(toRoom).connect(room.send)

  const moveBp = c.createBiquadFilter()
  moveBp.type = 'bandpass'
  moveBp.frequency.value = 350
  moveBp.Q.value = 0.9
  const moveGain = c.createGain()
  moveGain.gain.value = 0
  const moveSend = c.createGain()
  moveSend.gain.value = 0.1
  moveSrc = c.createBufferSource()
  moveSrc.buffer = brownStereo(c)
  moveSrc.loop = true
  moveSrc.connect(moveBp).connect(moveGain)
  moveGain.connect(out)
  moveGain.connect(moveSend).connect(room.send)
  moveSrc.start()

  const strikeBus = c.createGain()
  strikeBus.gain.value = 1
  strikeBus.connect(out)
  const strikeSend = c.createGain()
  strikeSend.gain.value = 0.45
  strikeBus.connect(strikeSend).connect(room.send)

  const subBus = c.createGain()
  subBus.gain.value = 1
  const subHp = c.createBiquadFilter()
  subHp.type = 'highpass'
  subHp.frequency.value = phone ? 45 : 28
  subHp.Q.value = 0.7
  const subLp = c.createBiquadFilter()
  subLp.type = 'lowpass'
  subLp.frequency.value = phone ? 360 : 140
  subLp.Q.value = 0.7
  subBus.connect(subHp).connect(subLp).connect(glue)
  const subSend = c.createGain()
  subSend.gain.value = 0.02
  subLp.connect(subSend).connect(room.send)

  const airBp = c.createBiquadFilter()
  airBp.type = 'bandpass'
  airBp.frequency.value = 9500
  airBp.Q.value = 0.55
  const airShelf = c.createBiquadFilter()
  airShelf.type = 'highshelf'
  airShelf.frequency.value = 11000
  airShelf.gain.value = 4
  const airGain = c.createGain()
  airGain.gain.value = 0.010
  airSrc = c.createBufferSource()
  airSrc.buffer = blueNoise(c)
  airSrc.loop = true
  airSrc.connect(airBp).connect(airShelf).connect(airGain)
  airGain.connect(out)
  const airSend = c.createGain()
  airSend.gain.value = 0.35
  airGain.connect(airSend).connect(room.send)
  airSrc.start()

  const voices = createVoices(c, out, room.send, VOICE_BUDGET[quality])

  nodes.push(
    out, limiter, glue, bed, bedSend, bedDuck, bedMud, lp, bus, chimeSend, delay, fb, damp,
    wet, toRoom, moveBp, moveGain, moveSend, strikeBus, strikeSend, subBus, subHp, subLp,
    subSend, airBp, airShelf, airGain, airSend,
  )

  engine = {
    ctx: c, master: out, bedGain: bed, bedLp: lp, bedDuck, chimeBus: bus, room, voices,
    moveGain, moveBp, strikeBus, strikeSend, subBus, airGain, tide,
  }
  applySpace(true)
  syncAmbient()
  return engine
}

const bloom = { at: -1, peak: 1, decay: 1 }

const swell = (g: AudioParam) => {
  g.cancelScheduledValues(bloom.at)
  g.setTargetAtTime(bloom.peak * mix.roomBase, bloom.at, 0.09)
  g.setTargetAtTime(mix.roomBase, bloom.at + 0.45, bloom.decay)
}

export const bloomRoom = (when: number, peak: number, decay: number) => {
  const e = engine
  if (!e) return
  bloom.at = when
  bloom.peak = peak
  bloom.decay = decay
  swell(e.room.send.gain)
}

const applySpace = (instant: boolean) => {
  const sp = SPACES[space]
  mix.lpBase = (mix.phone ? LP_PHONE : LP_WORLD) * sp.lp
  mix.roomBase = sp.room
  mix.chimeRate = sp.rate
  mix.chimeSoft = sp.soft
  const e = engine
  if (!e) return
  const now = e.ctx.currentTime
  const g = e.room.send.gain
  g.cancelScheduledValues(now)
  g.setValueAtTime(instant ? sp.room : g.value, now)
  if (!instant) g.setTargetAtTime(sp.room, now, 0.6)
  if (bloom.at > now) swell(g)
  e.voices.setDry(sp.dry)
}

const breathe = (e: Engine, t: number, now: number) => {
  const b = breath(t)
  const drift = Math.sin(2 * Math.PI * BREATH_HZ * 0.37 * t)
  const at = performance.now()
  if (at > mix.bedLpBusyUntil) {
    const sway = (180 * (2 * b - 1) + 120 * drift) / LP_WORLD
    e.bedLp.frequency.setTargetAtTime(mix.lpBase * (1 + sway), now, 0.15)
  }
  if (at > mix.bedBusyUntil) {
    e.bedGain.gain.setTargetAtTime(BED + 0.05 * (2 * b - 1), now, 0.15)
  }
  e.tide.update(now)
  if (at > mix.airBusyUntil) {
    const airTarget = Math.max(
      0.006,
      Math.min(0.075, 0.014 * (0.78 + 0.44 * b) * (1 + 1.9 * worldEvents.grade.caustic)),
    )
    const airRising = airTarget > (e.airGain.gain.value as number)
    e.airGain.gain.setTargetAtTime(airTarget, now, airRising ? 0.25 : 0.55)
  }
  return b
}

const ambientTick = () => {
  const e = engine
  if (!e || !enabled || hidden || e.ctx.state !== 'running') return
  if (performance.now() - mix.clock.at < AMBIENT_MS * 1.5) return
  const now = e.ctx.currentTime
  breathe(e, estClock(), now)
  e.moveGain.gain.setTargetAtTime(0, now, 0.5)
  e.voices.relax()
}

const syncAmbient = () => {
  const want = space === 'text' && engine !== null
  if (want && !ambientTimer) ambientTimer = setInterval(ambientTick, AMBIENT_MS)
  if (!want && ambientTimer) {
    clearInterval(ambientTimer)
    ambientTimer = null
  }
}

export const setSpace = (next: AudioSpace) => {
  if (next === space) return
  space = next
  applySpace(false)
  syncAmbient()
}

const whenIdle = (fn: () => void) => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 1200 })
  else later(fn, 60)
}

const fade = (to: number, dur: number) => {
  const e = engine
  if (!e) return
  const t = e.ctx.currentTime
  e.master.gain.cancelScheduledValues(t)
  e.master.gain.setValueAtTime(e.master.gain.value, t)
  e.master.gain.linearRampToValueAtTime(to, t + dur)
}

const start = (withBloom: boolean) => {
  const e = engine ?? build()
  const seq = ++startSeq
  clearTimer(suspendTimer)
  suspendTimer = null
  fade(MASTER, FADE_IN)
  e.ctx
    .resume()
    .then(() => {
      if (seq !== startSeq || engine !== e || !enabled || hidden) return
      if (withBloom) confirmBloom(useStore.getState().currentId)
      else repayIgnition()
      startChimes()
    })
    .catch(() => {})
  if (e.ctx.state !== 'running') armResume()
}

const stop = () => {
  startSeq++
  stopChimes()
  disarmResume()
  if (!engine) return
  farewell()
  fade(0, FADE_OUT)
  clearTimer(suspendTimer)
  suspendTimer = later(() => {
    if (!enabled) engine?.ctx.suspend().catch(() => {})
  }, (FADE_OUT + 0.1) * 1000)
}

export const setAudioEnabled = (on: boolean) => {
  remember(on)
  enabled = on
  if (on) start(true)
  else stop()
}

export const unlockAudio = () => {
  if (!enabled) return
  if (!engine) start(false)
  else if (engine.ctx.state !== 'running') engine.ctx.resume().catch(() => {})
}

export const tryEagerStart = () => {
  if (!enabled || engine || hidden) return
  const nav = navigator as Navigator & { getAutoplayPolicy?: (kind: string) => string }
  const active = nav.userActivation?.hasBeenActive ?? false
  if (active || nav.getAutoplayPolicy?.('audiocontext') === 'allowed') start(false)
}

export const setPageHidden = (h: boolean) => {
  hidden = h
  const e = engine
  if (!e || !enabled) return
  const seq = ++startSeq
  clearTimer(suspendTimer)
  suspendTimer = null

  if (h) {
    stopChimes()
    disarmResume()
    fade(0, 0.25)
    suspendTimer = later(() => {
      if (hidden) engine?.ctx.suspend().catch(() => {})
    }, 350)
    return
  }
  fade(MASTER, 1.2)
  e.ctx
    .resume()
    .then(() => {
      if (seq === startSeq && engine === e && enabled && !hidden) startChimes()
    })
    .catch(() => {})
  if (e.ctx.state !== 'running') armResume()
}

const prevCam = new THREE.Vector3()
const prevQuat = new THREE.Quaternion()
let camInit = false
let lastTick = 0

export const audioFrame = (t: number, camera: THREE.Camera) => {
  mix.clock.t = t
  mix.clock.at = performance.now()
  const e = engine
  if (!e || !enabled || hidden || e.ctx.state !== 'running') return
  const dt = Math.max(1e-3, Math.min(0.5, t - lastTick))
  lastTick = t
  const now = e.ctx.currentTime
  const s = useStore.getState()

  const b = breathe(e, t, now)

  if (!camInit) {
    prevCam.copy(camera.position)
    prevQuat.copy(camera.quaternion)
    camInit = true
  }
  const teleport = s.phase === 'fade'
  const v = teleport ? 0 : camera.position.distanceTo(prevCam) / dt
  const w = teleport ? 0 : prevQuat.angleTo(camera.quaternion) / dt
  prevCam.copy(camera.position)
  prevQuat.copy(camera.quaternion)
  const m = Math.min(1, v / 28 + (0.3 * w) / 2)
  const gTarget = 0.05 * m
  const rising = gTarget > (e.moveGain.gain.value as number)
  e.moveGain.gain.setTargetAtTime(gTarget, now, rising ? 0.15 : 0.5)
  e.moveBp.frequency.setTargetAtTime(350 + 550 * m, now, 0.2)

  const force = s.phase !== 'idle' ? (s.pendingId ?? s.currentId) : s.hoveredId
  e.voices.update(camera, s.currentId, force, b, teleport ? 0 : dt, e.tide.isMajor())

  if (s.quality !== mix.tier) {
    const tier = s.quality
    mix.tier = tier
    e.voices.setBudget(VOICE_BUDGET[tier])
    whenIdle(() => {
      if (engine === e && mix.tier === tier) e.room.setRT60(RT60_TIER[tier])
    })
  }
}

export const disposeAudio = () => {
  for (const id of timers) clearTimeout(id)
  timers.clear()
  suspendTimer = null
  startSeq++
  disarmResume()
  resetScore()
  if (ambientTimer) clearInterval(ambientTimer)
  ambientTimer = null

  for (const n of nodes) n.disconnect()
  nodes = []
  moveSrc?.stop()
  moveSrc?.disconnect()
  moveSrc = null
  airSrc?.stop()
  airSrc?.disconnect()
  airSrc = null
  forgetNoise()
  forgetWaves()
  forgetRooms()

  const e = engine
  engine = null
  camInit = false
  bloom.at = -1
  mix.passageUntil = 0
  mix.lastPing = 0
  mix.bedBusyUntil = 0
  mix.bedLpBusyUntil = 0
  mix.airBusyUntil = 0
  if (e) {
    e.ctx.onstatechange = null
    e.voices.dispose()
    e.room.dispose()
    e.tide.dispose()
    e.ctx.close().catch(() => {})
  }
}
