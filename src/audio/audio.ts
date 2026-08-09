import * as THREE from 'three'
import { BREATH_HZ, breath } from '@/scene/breath'
import { useStore } from '@/state/store'
import type { Quality } from '@/state/store'
import { createRoom, RT60_TIER } from './room'
import type { Room } from './room'
import { createVoices } from './voices'
import type { VoicePool } from './voices'
import { createTide } from './tide'
import type { TideCtl } from './tide'
import { startChimes, stopChimes, confirmBloom, farewell, resetScore, picardyReady } from './score'
import { brownNoise, blueNoise, forgetNoise, forgetWaves } from './timbre'
import { worldEvents } from '@/scene/worldEvents'

const KEY = 'aether.audio'

export const MASTER = 0.8
export const BED = 0.24
const FADE_IN = 1.2
const FADE_OUT = 0.6

const VOICE_BUDGET: Record<Quality, number> = { low: 2, medium: 2, high: 3, ultra: 4 }

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
  clock: { t: 0, at: typeof performance !== 'undefined' ? performance.now() : 0 },
  tier: 'high' as Quality,
}

export const estClock = () => mix.clock.t + (performance.now() - mix.clock.at) / 1000

let oscs: OscillatorNode[] = []
let nodes: AudioNode[] = []
let moveSrc: AudioBufferSourceNode | null = null
let airSrc: AudioBufferSourceNode | null = null

let enabled = false
let hidden = false
let suspendTimer: Timer | null = null

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

export const noiseBuffer = (c: AudioContext) => brownNoise(c)

const build = (): Engine => {
  const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession
  if (session) session.type = 'ambient'

  const c = new AudioContext({ latencyHint: 'playback' })
  const boot = useStore.getState()
  const quality = boot.quality
  const compact = boot.compact
  mix.tier = quality

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
  bedMud.gain.value = -4
  bedMud.connect(bedDuck)

  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 1150
  lp.Q.value = 0.4
  lp.connect(bedMud)

  const tide = createTide(c, lp, () => !picardyReady())

  const bus = c.createGain()
  bus.connect(out)
  const chimeSend = c.createGain()
  chimeSend.gain.value = 0.45
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
  moveSrc.buffer = noiseBuffer(c)
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
  subHp.frequency.value = compact ? 45 : 28
  subHp.Q.value = 0.7
  const subLp = c.createBiquadFilter()
  subLp.type = 'lowpass'
  subLp.frequency.value = 140
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
  return engine
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
  clearTimer(suspendTimer)
  suspendTimer = null
  e.ctx.resume().catch(() => {})
  fade(MASTER, FADE_IN)
  if (withBloom) confirmBloom(useStore.getState().currentId)
  startChimes()
}

const stop = () => {
  stopChimes()
  if (!engine) return
  farewell()
  fade(0, FADE_OUT)
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
  if (!enabled || engine) return
  try {
    const probe = new AudioContext()
    const open = probe.state === 'running'
    probe.close().catch(() => {})
    if (open) start(false)
  } catch {}
}

export const setPageHidden = (h: boolean) => {
  hidden = h
  const e = engine
  if (!e || !enabled) return

  if (h) {
    stopChimes()
    fade(0, 0.25)
    suspendTimer = later(() => {
      if (hidden) engine?.ctx.suspend().catch(() => {})
    }, 350)
    return
  }
  clearTimer(suspendTimer)
  suspendTimer = null
  e.ctx.resume().catch(() => {})
  fade(MASTER, 1.2)
  startChimes()
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

  const b = breath(t)
  const drift = Math.sin(2 * Math.PI * BREATH_HZ * 0.37 * t)
  if (performance.now() > mix.bedLpBusyUntil) {
    e.bedLp.frequency.setTargetAtTime(1150 + 180 * (2 * b - 1) + 120 * drift, now, 0.15)
  }
  if (performance.now() > mix.bedBusyUntil) {
    e.bedGain.gain.setTargetAtTime(BED + 0.05 * (2 * b - 1), now, 0.15)
  }

  e.tide.update(now)

  if (!camInit) {
    prevCam.copy(camera.position)
    prevQuat.copy(camera.quaternion)
    camInit = true
  }
  const v = camera.position.distanceTo(prevCam) / dt
  const w = prevQuat.angleTo(camera.quaternion) / dt
  prevCam.copy(camera.position)
  prevQuat.copy(camera.quaternion)
  const m = Math.min(1, v / 28 + (0.3 * w) / 2)
  const gTarget = 0.05 * m
  const rising = gTarget > (e.moveGain.gain.value as number)
  e.moveGain.gain.setTargetAtTime(gTarget, now, rising ? 0.15 : 0.5)
  e.moveBp.frequency.setTargetAtTime(350 + 550 * m, now, 0.2)

  const airTarget = Math.max(
    0.006,
    Math.min(0.075, 0.014 * (0.78 + 0.44 * b) * (1 + 1.9 * worldEvents.grade.caustic)),
  )
  const airRising = airTarget > (e.airGain.gain.value as number)
  e.airGain.gain.setTargetAtTime(airTarget, now, airRising ? 0.25 : 0.55)

  const force = s.phase !== 'idle' ? (s.pendingId ?? s.currentId) : null
  e.voices.update(camera, s.currentId, force, b)

  if (s.quality !== mix.tier) {
    mix.tier = s.quality
    e.room.setRT60(RT60_TIER[s.quality])
    e.voices.setBudget(VOICE_BUDGET[s.quality])
  }
}

export const disposeAudio = () => {
  for (const id of timers) clearTimeout(id)
  timers.clear()
  suspendTimer = null
  resetScore()

  for (const o of oscs) {
    o.stop()
    o.disconnect()
  }
  for (const n of nodes) n.disconnect()
  oscs = []
  nodes = []
  moveSrc?.stop()
  moveSrc?.disconnect()
  moveSrc = null
  airSrc?.stop()
  airSrc?.disconnect()
  airSrc = null
  forgetNoise()
  forgetWaves()

  const e = engine
  engine = null
  camInit = false
  mix.passageUntil = 0
  mix.lastPing = 0
  mix.bedBusyUntil = 0
  mix.bedLpBusyUntil = 0
  if (e) {
    e.voices.dispose()
    e.room.dispose()
    e.tide.dispose()
    e.ctx.close().catch(() => {})
  }
}
