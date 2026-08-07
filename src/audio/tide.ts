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
  mix: GainNode
  station: number
}

export interface TideCtl {
  update: (now: number) => void
  slashTo: (hz: number) => void
  dispose: () => void
}

export const createTide = (c: AudioContext, dest: AudioNode, earned: () => boolean): TideCtl => {
  const makeBank = (station: number, level: number): Bank => {
    const mix = c.createGain()
    mix.gain.value = level
    mix.connect(dest)
    const oscs = STATIONS[station].hz.map((hz, i) => {
      const o = c.createOscillator()
      o.type = TYPES[i]
      o.frequency.value = hz
      o.detune.value = CENTS[i]
      const g = c.createGain()
      g.gain.value = GAINS[i]
      o.connect(g).connect(mix)
      o.start()
      return o
    })
    return { oscs, mix, station }
  }

  const banks = [makeBank(0, 1), makeBank(0, 0)]
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
      const f = bank.oscs[0].frequency
      f.cancelScheduledValues(now)
      f.setValueAtTime(f.value, now)
      f.linearRampToValueAtTime(hz, now + 1.6)
      f.setValueAtTime(hz, now + 1.6 + 12)
      f.linearRampToValueAtTime(STATIONS[bank.station].hz[0], now + 1.6 + 12 + 3.2)
    },
    dispose: () => {
      for (const b of banks) {
        for (const o of b.oscs) {
          o.stop()
          o.disconnect()
        }
        b.mix.disconnect()
      }
    },
  }
}
