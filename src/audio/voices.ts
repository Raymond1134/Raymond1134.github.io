import type * as THREE from 'three'
import { Matrix4, Vector3 } from 'three'
import { graph } from '@/content'
import { noteOf } from './harmony'

const PEAK = 0.035
const SMOOTH = 0.12

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
}

export const placement = new Map<string, { pan: number; g: number; d: number; behind: boolean }>()

const inv = new Matrix4()
const v = new Vector3()

export interface VoicePool {
  update: (camera: THREE.Camera, currentId: string, forceId: string | null, breathVal: number) => void
  setBudget: (n: number) => void
  nodes: AudioNode[]
  dispose: () => void
}

export function createVoices(ctx: AudioContext, out: AudioNode, roomSend: AudioNode, budget: number): VoicePool {
  const voices: Voice[] = []
  const nodes: AudioNode[] = []
  let cap = budget

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
    dry.gain.value = 1
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
    const voice: Voice = { oscA, oscB, gain, lp, pan, dry, send, beaconId: null, level: 0 }
    voices.push(voice)
    return voice
  }

  for (let i = 0; i < budget; i++) makeVoice()

  const update = (camera: THREE.Camera, currentId: string, forceId: string | null, breathVal: number) => {
    const t = ctx.currentTime
    camera.updateMatrixWorld()
    inv.copy(camera.matrixWorld).invert()

    placement.clear()
    for (const node of graph.nodes.values()) {
      v.copy(node.worldPosition).applyMatrix4(inv)
      const d = v.length()
      const lateral = Math.sqrt(v.x * v.x + v.z * v.z)
      placement.set(node.id, {
        pan: Math.max(-0.85, Math.min(0.85, v.x / Math.max(1e-3, lateral))),
        g: 1 / (1 + Math.pow(d / 40, 1.4)),
        d,
        behind: v.z > 0,
      })
    }

    const desired: string[] = [currentId]
    if (forceId && forceId !== currentId) desired.push(forceId)
    const rest = [...placement.entries()]
      .filter(([id]) => !desired.includes(id))
      .sort((a, b) => a[1].d - b[1].d)
    for (const [id, p] of rest) {
      if (desired.length >= cap) break
      const incumbent = voices.find((vc) => vc.beaconId === id)
      if (incumbent) {
        desired.push(id)
        continue
      }
      const active = voices.filter((vc) => vc.beaconId && !desired.includes(vc.beaconId))
      const worst = active.sort(
        (a, b) => (placement.get(b.beaconId!)?.d ?? 1e9) - (placement.get(a.beaconId!)?.d ?? 1e9),
      )[0]
      const worstD = worst ? placement.get(worst.beaconId!)?.d ?? 1e9 : 1e9
      if (p.d < worstD * 0.85) desired.push(id)
    }

    for (const vc of voices.slice(0, cap)) {
      if (vc.beaconId && !desired.includes(vc.beaconId)) {
        vc.gain.gain.setTargetAtTime(0, t, 0.23)
        vc.level = 0
        if ((vc.gain.gain.value as number) < 0.002) vc.beaconId = null
      }
    }
    for (const id of desired) {
      if (voices.some((vc) => vc.beaconId === id)) continue
      const free = voices.slice(0, cap).find((vc) => vc.beaconId === null && (vc.gain.gain.value as number) < 0.003)
      if (!free) continue
      const drone = noteOf(id).drone
      free.oscA.frequency.setValueAtTime(drone, t)
      free.oscB.frequency.setValueAtTime(drone, t)
      free.beaconId = id
      free.level = 0
    }

    for (const vc of voices.slice(0, cap)) {
      if (!vc.beaconId) continue
      const p = placement.get(vc.beaconId)
      if (!p) continue
      let g = p.g
      if (vc.beaconId === currentId) g = Math.max(g, 0.55)
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
