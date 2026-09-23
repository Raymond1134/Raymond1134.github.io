import type * as THREE from 'three'
import { Matrix4, Vector3 } from 'three'
import { graph } from '@/content'
import { noteOf, inKey } from './harmony'

const PEAK = 0.035
const SMOOTH = 0.12
const LEAN = 0.5
const DOPPLER = 0.12
const BEND_MAX = 28
const TELEPORT = 900

interface Voice {
  oscA: OscillatorNode
  oscB: OscillatorNode
  gain: GainNode
  lp: BiquadFilterNode
  pan: StereoPannerNode
  dry: GainNode
  send: GainNode
  beaconId: string | null
  level: number
  drone: number
  hz: number
  prevD: number
  bend: number
}

interface Place {
  pan: number
  g: number
  d: number
  behind: boolean
}

interface Tracked extends Place {
  id: string
  at: Vector3
}

export const placement = new Map<string, Place>()

const tracked: Tracked[] = []
const nearest = (a: Tracked, b: Tracked) => a.d - b.d

const inv = new Matrix4()
const v = new Vector3()
const probe = { pan: 0, g: 0, d: 0, behind: false }

export const locate = (p: Vector3) => {
  v.copy(p).applyMatrix4(inv)
  const lateral = Math.sqrt(v.x * v.x + v.z * v.z)
  probe.d = v.length()
  probe.pan = Math.max(-0.85, Math.min(0.85, v.x / Math.max(1e-3, lateral)))
  probe.g = 1 / (1 + Math.pow(probe.d / 40, 1.4))
  probe.behind = v.z > 0
  return probe
}

export interface VoicePool {
  update: (
    camera: THREE.Camera,
    currentId: string,
    forceId: string | null,
    breathVal: number,
    dt: number,
    major: boolean,
  ) => void
  setBudget: (n: number) => void
  setDry: (g: number) => void
  relax: () => void
  nodes: AudioNode[]
  dispose: () => void
}

export function createVoices(ctx: AudioContext, out: AudioNode, roomSend: AudioNode, budget: number): VoicePool {
  const voices: Voice[] = []
  const nodes: AudioNode[] = []
  const want = new Set<string>()
  const desired: string[] = []
  let cap = budget
  let dryLevel = 1

  const held = (id: string) => {
    for (let i = 0; i < voices.length; i++) if (voices[i].beaconId === id) return true
    return false
  }

  const farthestLoose = () => {
    let worst = -1
    for (let i = 0; i < voices.length; i++) {
      const id = voices[i].beaconId
      if (!id || want.has(id)) continue
      const d = placement.get(id)?.d ?? 1e9
      if (d > worst) worst = d
    }
    return worst < 0 ? 1e9 : worst
  }

  const claim = (id: string) => {
    desired.push(id)
    want.add(id)
  }

  const makeVoice = (): Voice => {
    const oscA = ctx.createOscillator()
    const oscB = ctx.createOscillator()
    oscA.type = 'sine'
    oscB.type = 'sine'
    oscA.detune.value = -4
    oscB.detune.value = 4
    const gain = ctx.createGain()
    gain.gain.value = 0
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 800
    const pan = ctx.createStereoPanner()
    const dry = ctx.createGain()
    dry.gain.value = dryLevel
    const send = ctx.createGain()
    send.gain.value = 0.1
    oscA.connect(gain)
    oscB.connect(gain)
    gain.connect(lp).connect(pan)
    pan.connect(dry).connect(out)
    pan.connect(send).connect(roomSend)
    oscA.start()
    oscB.start()
    nodes.push(gain, lp, pan, dry, send)
    const voice: Voice = {
      oscA, oscB, gain, lp, pan, dry, send, beaconId: null, level: 0, drone: 0, hz: 0, prevD: -1, bend: 0,
    }
    voices.push(voice)
    return voice
  }

  for (let i = 0; i < budget; i++) makeVoice()

  const update = (
    camera: THREE.Camera,
    currentId: string,
    forceId: string | null,
    breathVal: number,
    dt: number,
    major: boolean,
  ) => {
    const t = ctx.currentTime
    camera.updateMatrixWorld()
    inv.copy(camera.matrixWorld).invert()

    if (tracked.length !== graph.nodes.size) {
      tracked.length = 0
      placement.clear()
      for (const node of graph.nodes.values()) {
        const rec: Tracked = { id: node.id, at: node.worldPosition, pan: 0, g: 0, d: 0, behind: false }
        tracked.push(rec)
        placement.set(node.id, rec)
      }
    }
    for (let i = 0; i < tracked.length; i++) {
      const rec = tracked[i]
      const p = locate(rec.at)
      rec.pan = p.pan
      rec.g = p.g
      rec.d = p.d
      rec.behind = p.behind
    }
    tracked.sort(nearest)

    const live = Math.min(cap, voices.length)
    desired.length = 0
    want.clear()
    claim(currentId)
    if (forceId && forceId !== currentId) claim(forceId)
    for (let i = 0; i < tracked.length && desired.length < cap; i++) {
      const p = tracked[i]
      if (want.has(p.id)) continue
      if (held(p.id) || p.d < farthestLoose() * 0.85) claim(p.id)
    }

    for (let i = 0; i < live; i++) {
      const vc = voices[i]
      if (vc.beaconId && !want.has(vc.beaconId)) {
        vc.gain.gain.setTargetAtTime(0, t, 0.23)
        vc.level = 0
        if ((vc.gain.gain.value as number) < 0.002) vc.beaconId = null
      }
    }
    for (let k = 0; k < desired.length; k++) {
      const id = desired[k]
      if (held(id)) continue
      let free: Voice | null = null
      for (let i = 0; i < live && !free; i++) {
        const vc = voices[i]
        if (vc.beaconId === null && (vc.gain.gain.value as number) < 0.003) free = vc
      }
      if (!free) continue
      free.drone = noteOf(id).drone
      free.hz = inKey(free.drone, major)
      free.oscA.frequency.setValueAtTime(free.hz, t)
      free.oscB.frequency.setValueAtTime(free.hz, t)
      free.beaconId = id
      free.level = 0
      free.prevD = -1
    }

    for (let i = 0; i < live; i++) {
      const vc = voices[i]
      if (!vc.beaconId) continue
      const p = placement.get(vc.beaconId)
      if (!p) continue
      let g = p.g
      if (vc.beaconId === currentId) g = Math.max(g, 0.55)
      else if (vc.beaconId === forceId) g = Math.max(g, LEAN)
      const hz = inKey(vc.drone, major)
      if (hz !== vc.hz) {
        vc.hz = hz
        vc.oscA.frequency.setTargetAtTime(hz, t, 0.6)
        vc.oscB.frequency.setTargetAtTime(hz, t, 0.6)
      }
      let bend = 0
      if (dt > 0 && vc.prevD >= 0) {
        const closing = (p.d - vc.prevD) / dt
        if (Math.abs(closing) < TELEPORT) bend = Math.max(-BEND_MAX, Math.min(BEND_MAX, -closing * DOPPLER))
      }
      vc.prevD = p.d
      if (Math.abs(bend - vc.bend) > 0.5) {
        vc.bend = bend
        vc.oscA.detune.setTargetAtTime(-4 + bend, t, 0.2)
        vc.oscB.detune.setTargetAtTime(4 + bend, t, 0.2)
      }
      const target =
        PEAK * g * (p.behind ? 0.8 : 1) * (1 + 0.12 * (breathVal * 2 - 1))
      vc.gain.gain.setTargetAtTime(target, t, vc.level === 0 ? 0.33 : SMOOTH)
      vc.level = 1
      vc.pan.pan.setTargetAtTime(p.pan, t, SMOOTH)
      vc.lp.frequency.setTargetAtTime((300 + 900 * g) * (p.behind ? 0.45 : 1), t, SMOOTH)
      vc.send.gain.setTargetAtTime(0.08 + 0.1 * Math.min(1, p.d / 160), t, 0.3)
    }
  }

  return {
    update,
    setBudget: (n) => {
      cap = Math.max(1, n)
      const t = ctx.currentTime
      for (let i = cap; i < voices.length; i++) {
        voices[i].gain.gain.setTargetAtTime(0, t, 0.23)
        voices[i].beaconId = null
        voices[i].level = 0
      }
      while (voices.length < cap) makeVoice()
    },
    setDry: (g) => {
      dryLevel = g
      const t = ctx.currentTime
      for (const vc of voices) vc.dry.gain.setTargetAtTime(g, t, 0.6)
    },
    relax: () => {
      const t = ctx.currentTime
      for (const vc of voices) {
        vc.prevD = -1
        if (vc.bend === 0) continue
        vc.bend = 0
        vc.oscA.detune.setTargetAtTime(-4, t, 0.3)
        vc.oscB.detune.setTargetAtTime(4, t, 0.3)
      }
    },
    nodes,
    dispose: () => {
      for (const vc of voices) {
        vc.oscA.stop()
        vc.oscB.stop()
        vc.oscA.disconnect()
        vc.oscB.disconnect()
      }
      for (const nd of nodes) nd.disconnect()
    },
  }
}
