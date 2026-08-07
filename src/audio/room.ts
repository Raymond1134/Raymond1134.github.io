const PREDELAY = 0.018

const ER_T = [0.019, 0.027, 0.034, 0.043, 0.055, 0.066, 0.078]
const ER_G = [0.5, -0.38, 0.31, -0.24, 0.19, -0.15, 0.11]

export const RT60_TIER = { low: 1.4, medium: 2.0, high: 2.6, ultra: 3.2 } as const

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function generateRoomIR(ctx: BaseAudioContext, rt60: number): AudioBuffer {
  const sr = ctx.sampleRate
  const tail = rt60 * 1.15
  const n = Math.ceil(sr * (PREDELAY + tail))
  const buf = ctx.createBuffer(2, n, sr)
  const pre = Math.round(PREDELAY * sr)
  const seeds = [1134, 2468]

  for (let ch = 0; ch < 2; ch++) {
    const rand = mulberry32(seeds[ch])
    const d = buf.getChannelData(ch)

    for (let i = 0; i < ER_T.length; i++) {
      const t = (ch === 0 ? ER_T[i] : ER_T[ER_T.length - 1 - i]) + rand() * 0.004
      const at = Math.round((PREDELAY + t) * sr)
      if (at < n) d[at] += ER_G[i]
    }

    let lp = 0
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr
      const fc = 700 + 4500 * Math.exp((-3.0 * t) / rt60)
      const a = 1 - Math.exp((-2 * Math.PI * fc) / sr)
      lp += a * (rand() * 2 - 1 - lp)
      d[i] += lp * Math.exp((-6.91 * t) / rt60)
    }
  }

  let e = 0
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < n; i++) e += d[i] * d[i]
  }
  const scale = Math.sqrt(0.2 / Math.max(1e-9, e))
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < n; i++) d[i] *= scale
  }

  return buf
}

export interface Room {
  send: GainNode
  nodes: AudioNode[]
  setRT60: (rt60: number) => void
  dispose: () => void
}

export function createRoom(ctx: AudioContext, out: AudioNode, rt60: number): Room {
  const send = ctx.createGain()
  const nodes: AudioNode[] = [send]

  let convolver: ConvolverNode | null = null
  let ret: GainNode | null = null

  const attach = (rt: number, fadeIn: boolean) => {
    const c = ctx.createConvolver()
    c.normalize = false
    c.buffer = generateRoomIR(ctx, rt)
    const g = ctx.createGain()
    g.gain.value = fadeIn ? 0 : 0.5
    send.connect(c)
    c.connect(g)
    g.connect(out)
    nodes.push(c, g)
    if (fadeIn) g.gain.setTargetAtTime(0.5, ctx.currentTime, 0.17)
    convolver = c
    ret = g
  }

  attach(rt60, false)

  return {
    send,
    nodes,
    setRT60: (rt) => {
      const oldC = convolver
      const oldR = ret
      if (oldC && oldR) {
        oldR.gain.setTargetAtTime(0, ctx.currentTime, 0.17)
        const id = setTimeout(() => {
          try {
            send.disconnect(oldC)
          } catch {}
          oldC.disconnect()
          oldR.disconnect()
        }, 900)
        void id
      }
      attach(rt, true)
    },
    dispose: () => {
      for (const nd of nodes) nd.disconnect()
    },
  }
}
