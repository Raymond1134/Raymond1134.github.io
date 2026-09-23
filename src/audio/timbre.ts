interface Partial {
  r: number
  g: number
  d: number
}

export const BELL: Partial[] = [
  { r: 0.500, g: 0.28, d: 2.20 },
  { r: 1.000, g: 0.24, d: 1.00 },
  { r: 1.183, g: 0.16, d: 0.72 },
  { r: 1.506, g: 0.10, d: 0.55 },
  { r: 2.000, g: 0.11, d: 0.48 },
  { r: 2.514, g: 0.05, d: 0.30 },
  { r: 2.664, g: 0.025, d: 0.24 },
  { r: 3.011, g: 0.020, d: 0.19 },
  { r: 4.166, g: 0.010, d: 0.13 },
]

export const BELL_MAJOR: Partial[] = BELL.map((p) =>
  p.r === 1.183 ? { ...p, r: 1.260 } : p,
)

export const GLASS: Partial[] = [
  { r: 1.000, g: 0.46, d: 1.00 },
  { r: 2.756, g: 0.27, d: 0.62 },
  { r: 5.404, g: 0.15, d: 0.38 },
  { r: 8.933, g: 0.08, d: 0.24 },
  { r: 13.345, g: 0.04, d: 0.15 },
]

let brown: AudioBuffer | null = null
let brownWide: AudioBuffer | null = null
let blue: AudioBuffer | null = null

const BROWN_S = 2
const BROWN_WIDE_S = 2.6
const BLUE_S = 2.3
const SHARED = 0.55
const OWN = Math.sqrt(1 - SHARED * SHARED)

export const brownNoise = (c: BaseAudioContext) => {
  if (brown) return brown
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * BROWN_S), c.sampleRate)
  const d = buf.getChannelData(0)
  let v = 0
  for (let i = 0; i < d.length; i++) {
    v = v * 0.86 + (Math.random() * 2 - 1) * 0.14
    d[i] = v * 2.2
  }
  brown = buf
  return buf
}

export const brownStereo = (c: BaseAudioContext) => {
  if (brownWide) return brownWide
  const buf = c.createBuffer(2, Math.floor(c.sampleRate * BROWN_WIDE_S), c.sampleRate)
  const l = buf.getChannelData(0)
  const r = buf.getChannelData(1)
  let m = 0
  let a = 0
  let b = 0
  for (let i = 0; i < l.length; i++) {
    m = m * 0.86 + (Math.random() * 2 - 1) * 0.14
    a = a * 0.86 + (Math.random() * 2 - 1) * 0.14
    b = b * 0.86 + (Math.random() * 2 - 1) * 0.14
    l[i] = (SHARED * m + OWN * a) * 2.2
    r[i] = (SHARED * m + OWN * b) * 2.2
  }
  brownWide = buf
  return buf
}

export const blueNoise = (c: BaseAudioContext) => {
  if (blue) return blue
  const n = Math.floor(c.sampleRate * BLUE_S)
  const buf = c.createBuffer(2, n, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let prev = 0
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1
      d[i] = (w - prev) * 0.5
      prev = w
    }
  }
  blue = buf
  return buf
}

export const forgetNoise = () => {
  brown = null
  brownWide = null
  blue = null
}

const ring = (g: AudioParam, when: number, peak: number, dur: number, atk: number) => {
  const p = Math.max(peak, 1e-4)
  g.setValueAtTime(1e-4, when)
  g.exponentialRampToValueAtTime(p, when + atk)
  g.exponentialRampToValueAtTime(p * 0.36, when + dur * 0.10)
  g.exponentialRampToValueAtTime(p * 0.05, when + dur)
  g.setTargetAtTime(5e-5, when + dur, 0.20)
}

interface StruckOpts {
  partials?: Partial[]
  strike?: number
  pan?: number
  send?: number
  tilt?: number
  limit?: number
}

export const struck = (
  c: AudioContext,
  dest: AudioNode,
  send: AudioNode | null,
  when: number,
  hz: number,
  peak: number,
  dur: number,
  opts: StruckOpts = {},
) => {
  const table = opts.partials ?? BELL
  const count = Math.min(table.length, opts.limit ?? table.length)
  const hammer = opts.strike ?? 1
  const tilt = opts.tilt ?? 1
  const pan = Math.max(-0.85, Math.min(0.85, opts.pan ?? 0))

  const p = c.createStereoPanner()
  p.pan.value = pan
  p.connect(dest)
  let wet: GainNode | null = null
  if (send && opts.send) {
    wet = c.createGain()
    wet.gain.value = opts.send
    p.connect(wet).connect(send)
  }

  let live = count
  const done = () => {
    live--
    if (live > 0) return
    p.disconnect()
    wet?.disconnect()
  }

  for (let i = 0; i < count; i++) {
    const pt = table[i]
    const f = hz * pt.r
    if (f > c.sampleRate * 0.45) {
      live--
      continue
    }
    const o = c.createOscillator()
    o.frequency.value = f
    const g = c.createGain()
    const end = when + dur * pt.d + 0.6

    if (hammer > 0 && pt.r <= 1.0) {
      o.detune.setValueAtTime(48 * hammer, when)
      o.detune.linearRampToValueAtTime(0, when + 0.034)
    }

    const shade = tilt === 1 ? 1 : Math.pow(tilt, Math.max(0, Math.log2(pt.r)))
    ring(g.gain, when, peak * pt.g * shade, dur * pt.d, 0.006)
    o.connect(g).connect(p)
    o.start(when)
    o.stop(end)
    o.onended = () => {
      o.disconnect()
      g.disconnect()
      done()
    }
  }

  if (hammer > 0) {
    const src = c.createBufferSource()
    src.buffer = brownNoise(c)
    src.loop = true
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = Math.min(hz, c.sampleRate * 0.4)
    bp.Q.value = 14
    const g = c.createGain()
    g.gain.setValueAtTime(1e-4, when)
    g.gain.exponentialRampToValueAtTime(Math.max(peak * 0.28 * hammer, 1e-4), when + 0.004)
    g.gain.exponentialRampToValueAtTime(1e-4, when + 0.022)
    src.connect(bp).connect(g).connect(p)
    src.start(when)
    src.stop(when + 0.05)
    src.onended = () => {
      src.disconnect()
      bp.disconnect()
      g.disconnect()
    }
  }
}

const SUB_IMAG = [0, 1.0, 0.355, 0.178]
const SUB_IMAG_PHONE = [0, 1.0, 0.62, 0.42, 0.22]

let subWave: PeriodicWave | null = null
let subWavePhone: PeriodicWave | null = null

const periodic = (c: AudioContext, imag: number[]) =>
  c.createPeriodicWave(new Float32Array(imag.length), new Float32Array(imag), { disableNormalization: false })

const subPeriodic = (c: AudioContext, phone: boolean) => {
  if (phone) {
    if (!subWavePhone) subWavePhone = periodic(c, SUB_IMAG_PHONE)
    return subWavePhone
  }
  if (!subWave) subWave = periodic(c, SUB_IMAG)
  return subWave
}
export const forgetWaves = () => {
  subWave = null
  subWavePhone = null
}

export const sub = (
  c: AudioContext,
  dest: AudioNode,
  when: number,
  hz: number,
  peak: number,
  hold: number,
  ringDur: number,
  phone = false,
) => {
  const o = c.createOscillator()
  o.setPeriodicWave(subPeriodic(c, phone))
  o.frequency.value = hz
  const g = c.createGain()
  const atk = Math.max(0.045, 3 / hz)
  g.gain.setValueAtTime(1e-4, when)
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 1e-4), when + atk)
  g.gain.setValueAtTime(Math.max(peak, 1e-4), when + atk + hold)
  g.gain.exponentialRampToValueAtTime(1e-4, when + atk + hold + ringDur)
  o.connect(g).connect(dest)
  o.start(when)
  o.stop(when + atk + hold + ringDur + 0.1)
  o.onended = () => {
    o.disconnect()
    g.disconnect()
  }
}
