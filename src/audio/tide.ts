interface Station {
  name: string
  hz: [number, number, number, number, number, number]
  dur: number
}

const STATIONS: Station[] = [
  { name: 'Am(add9)', hz: [110, 110, 164.81, 220, 246.94, 329.63], dur: 48 },
  { name: 'Fmaj7#11', hz: [87.31, 87.31, 130.81, 220, 329.63, 493.88], dur: 48 },
  { name: 'Csus2/G', hz: [98.0, 130.81, 196.0, 261.63, 293.66, 392.0], dur: 48 },
  { name: 'Dm9', hz: [73.42, 146.83, 174.61, 220, 261.63, 329.63], dur: 48 },
  { name: 'Fmaj7', hz: [87.31, 174.61, 220, 261.63, 329.63, 440], dur: 24 },
  { name: 'G6/9', hz: [98.0, 196.0, 246.94, 293.66, 329.63, 440], dur: 24 },
  { name: 'A(add9) major', hz: [110, 110, 164.81, 220, 277.18, 329.63], dur: 40 },
  { name: 'Fmaj9', hz: [87.31, 174.61, 220, 261.63, 329.63, 392.0], dur: 48 },
  { name: 'Am(add9)/A1', hz: [55, 110, 164.81, 220, 246.94, 329.63], dur: 48 },
]

const MAJOR_IDX = 6

const GAINS = [0.16, 0.12, 0.11, 0.07, 0.035, 0.025]
const CENTS = [-7, 6, -5, 4, -3, 7]
const TYPES: OscillatorType[] = ['sine', 'triangle', 'sine', 'sine', 'sine', 'sine']
const PAN = [-0.12, 0.12, -0.38, 0.38, -0.62, 0.62]
const PAN_LAW = Math.SQRT2

const LFO_HZ = [0.061, 0.043, 0.029]
const SWAY = 0.16
const CHORUS = 3

const GLIDE = 1.6
const HOLD = 12
const RETURN = 3.2
const NEAR = 2 ** (1.2 / 12)
const LOW_REGISTER = 270

const fold = (r: number) => {
  let x = r
  while (x < 1) x *= 2
  while (x >= 2) x /= 2
  return x
}

const rubs = (hz: number, tones: readonly number[]) =>
  tones.some((t) => {
    if (t > LOW_REGISTER) return false
    const r = fold(hz / t)
    return (r > 1.012 && r < NEAR) || (r > 2 / NEAR && r < 1.976)
  })

const lowest = (hz: number) => {
  let f = hz
  while (f > 130.9) f /= 2
  return f
}

const XFADE = 4.5
const STEPS = 33

const RISE = new Float32Array(STEPS)
const FALL = new Float32Array(STEPS)
for (let i = 0; i < STEPS; i++) {
  const th = (i / (STEPS - 1)) * (Math.PI / 2)
  RISE[i] = Math.sin(th)
  FALL[i] = Math.cos(th)
}

interface Bank {
  oscs: OscillatorNode[]
  parts: AudioNode[]
  mix: GainNode
  station: number
}

export interface TideCtl {
  update: (now: number) => void
  slashTo: (hz: number) => void
  isMajor: () => boolean
  dispose: () => void
}

export const createTide = (c: AudioContext, dest: AudioNode, earned: () => boolean): TideCtl => {
  const voiced = GAINS.map((g) => g * PAN_LAW)
  const lfos = LFO_HZ.map((hz) => {
    const o = c.createOscillator()
    o.frequency.value = hz
    o.start()
    return o
  })
  const mods: GainNode[] = []
  const depth = (lfo: number, amount: number) => {
    const g = c.createGain()
    g.gain.value = amount
    lfos[lfo].connect(g)
    mods.push(g)
    return g
  }
  const glowUp = depth(0, 0.35 * voiced[3])
  const glowDown = depth(0, -0.35 * voiced[5])
  const bloom = depth(1, 0.4 * voiced[4])
  const swayL = depth(1, -SWAY)
  const swayR = depth(1, SWAY)
  const chorusUp = depth(2, CHORUS)
  const chorusDown = depth(2, -CHORUS)

  const makeBank = (station: number, level: number, side: number): Bank => {
    const mix = c.createGain()
    mix.gain.value = level
    mix.connect(dest)
    const parts: AudioNode[] = []
    const gains: GainNode[] = []
    const pans: StereoPannerNode[] = []
    const oscs = STATIONS[station].hz.map((hz, i) => {
      const o = c.createOscillator()
      o.type = TYPES[i]
      o.frequency.value = hz
      o.detune.value = CENTS[i]
      const g = c.createGain()
      g.gain.value = voiced[i]
      const p = c.createStereoPanner()
      p.pan.value = PAN[i] * side
      o.connect(g).connect(p).connect(mix)
      o.start()
      gains.push(g)
      pans.push(p)
      parts.push(g, p)
      return o
    })
    glowUp.connect(gains[3].gain)
    glowDown.connect(gains[5].gain)
    bloom.connect(gains[4].gain)
    ;(side > 0 ? swayL : swayR).connect(pans[4].pan)
    ;(side > 0 ? swayR : swayL).connect(pans[5].pan)
    chorusUp.connect(oscs[4].detune)
    chorusDown.connect(oscs[5].detune)
    return { oscs, parts, mix, station }
  }

  const banks = [makeBank(0, 1, 1), makeBank(0, 0, -1)]
  let active = 0
  let station = 0

  const dwell = (i: number) => STATIONS[i].dur * (0.92 + Math.random() * 0.16)
  let nextAt = c.currentTime + dwell(0)

  const advance = (now: number) => {
    let next = (station + 1) % STATIONS.length
    if (next === MAJOR_IDX && !earned()) next = (next + 1) % STATIONS.length

    const inn = banks[1 - active]
    const out = banks[active]
    STATIONS[next].hz.forEach((hz, i) => {
      const f = inn.oscs[i].frequency
      f.cancelScheduledValues(now)
      f.setValueAtTime(hz, now)
    })
    inn.station = next

    out.mix.gain.cancelScheduledValues(now)
    inn.mix.gain.cancelScheduledValues(now)
    out.mix.gain.setValueCurveAtTime(FALL, now + 0.05, XFADE)
    inn.mix.gain.setValueCurveAtTime(RISE, now + 0.05, XFADE)

    active = 1 - active
    station = next
    nextAt = now + XFADE + dwell(next)
  }

  return {
    update: (now) => {
      if (now >= nextAt) advance(now)
    },
    slashTo: (hz) => {
      const now = c.currentTime
      const bank = banks[active]
      const tones = STATIONS[bank.station].hz
      const oct = Math.log2(tones[1] / tones[0])
      const legs = Math.abs(oct - Math.round(oct)) < 0.01 ? 2 : 1
      const fixed = tones.slice(legs)
      let to = hz
      if (rubs(hz, fixed)) {
        const root = tones[0]
        const fifth = lowest(root * 1.5)
        const away = (x: number) => Math.abs(Math.log2(x / hz))
        to = !rubs(fifth, fixed) && away(fifth) < away(root) ? fifth : root
      }
      for (let i = 0; i < legs; i++) {
        const f = bank.oscs[i].frequency
        const k = tones[i] / tones[0]
        f.cancelScheduledValues(now)
        f.setValueAtTime(f.value, now)
        f.linearRampToValueAtTime(to * k, now + GLIDE)
        f.setValueAtTime(to * k, now + GLIDE + HOLD)
        f.linearRampToValueAtTime(tones[i], now + GLIDE + HOLD + RETURN)
      }
    },
    isMajor: () => banks[active].station === MAJOR_IDX,
    dispose: () => {
      for (const o of lfos) {
        o.stop()
        o.disconnect()
      }
      for (const g of mods) g.disconnect()
      for (const b of banks) {
        for (const o of b.oscs) {
          o.stop()
          o.disconnect()
        }
        for (const n of b.parts) n.disconnect()
        b.mix.disconnect()
      }
    },
  }
}
