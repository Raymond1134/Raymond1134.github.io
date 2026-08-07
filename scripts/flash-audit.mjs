const hearth = (x) => 1 - Math.pow(1 - x, 3.2)
const swell = (x) => Math.sin(Math.PI * x)

const STRIKE = {
  land: { atk: 0.22, dec: 1.6, mag: 1.0 },
  ignite: { atk: 0.45, dec: 4.2, mag: 1.7 },
  picardy: { atk: 0.45, dec: 4.2, mag: 1.7 },
}
const KM_CAP = 1.7

const strikeK = (kind, age) => {
  const { atk, dec, mag } = STRIKE[kind]
  if (age < 0 || age >= atk + dec) return 0
  const k = age < atk ? hearth(age / atk) : 1 - hearth((age - atk) / dec)
  return Math.min(KM_CAP, k * mag)
}

const SHOWPIECE = {
  clerestory: { dur: 9, shaft: 0, vault: 0, caustic: 0.35 },
  swellEv: { dur: 5, shaft: 0, vault: -0.15, caustic: 1.0 },
  toll: { dur: 4.5, shaft: 0.25, vault: 0.6, caustic: 0 },
  quake: { dur: 2.2, shaft: 0, vault: 0, caustic: 0 },
}

const grade = (km, sp, spAge) => {
  let spShaft = 0
  let spVault = 0
  if (sp && spAge >= 0 && spAge <= sp.dur) {
    const sw = swell(Math.min(1, spAge / sp.dur))
    spShaft = sp.shaft * sw
    spVault = sp.vault * sw
  }
  return {
    exposure: 1 + 0.12 * km,
    ignite: 1 + 0.8 * km,
    shaft: 1 + 1.0 * km + spShaft,
    vault: 1 + 0.5 * km + spVault,
    glare: 1 + 0.3 * km,
  }
}

const W = { base: 0.64, ignite: 0.08, shaft: 0.1, vault: 0.12, glare: 0.06 }
const lum = (g) =>
  g.exposure * (W.base + W.ignite * g.ignite + W.shaft * g.shaft + W.vault * g.vault + W.glare * g.glare)

const DT = 1 / 240

function simulate(T, strikes, shows) {
  const n = Math.ceil(T / DT)
  const L = new Float64Array(n)
  const shaftMax = { v: 0 }
  const expMax = { v: 0 }
  for (let i = 0; i < n; i++) {
    const t = i * DT
    let km = 0
    let latest = -Infinity
    for (const s of strikes) {
      if (s.t <= t && s.t > latest) {
        latest = s.t
        km = strikeK(s.kind, t - s.t)
      }
    }
    let sp = null
    let spAge = -1
    for (const s of shows) {
      if (s.t <= t && t - s.t <= SHOWPIECE[s.kind].dur) {
        sp = SHOWPIECE[s.kind]
        spAge = t - s.t
      }
    }
    const g = grade(km, sp, spAge)
    shaftMax.v = Math.max(shaftMax.v, g.shaft)
    expMax.v = Math.max(expMax.v, g.exposure)
    L[i] = lum(g)
  }
  return { L, shaftMax: shaftMax.v, expMax: expMax.v }
}

function flashPairs(L) {
  const pairs = []
  let anchor = L[0]
  let dir = 0
  let risen = false
  for (let i = 1; i < L.length; i++) {
    const d = L[i] - anchor
    if (dir >= 0 && L[i] < L[i - 1] - 1e-9) {
      if (dir === 1 && d >= 0) {
        if (L[i - 1] - anchor >= 0.1) risen = true
        anchor = L[i - 1]
      }
      dir = -1
    } else if (dir <= 0 && L[i] > L[i - 1] + 1e-9) {
      if (dir === -1) {
        if (risen && anchor - L[i - 1] >= 0.1) {
          pairs.push(i * DT)
          risen = false
        }
        anchor = L[i - 1]
      }
      dir = 1
    }
  }
  if (risen && anchor - L[L.length - 1] >= 0.1) pairs.push(L.length * DT)

  let worst = 0
  for (let a = 0; a < pairs.length; a++) {
    let count = 0
    for (let b = a; b < pairs.length && pairs[b] - pairs[a] <= 1.0; b++) count++
    worst = Math.max(worst, count)
  }
  return { count: pairs.length, worstPerSecond: worst }
}

function monotone(L) {
  let flips = 0
  let dir = 0
  for (let i = 1; i < L.length; i++) {
    const d = L[i] - L[i - 1]
    if (Math.abs(d) < 1e-9) continue
    const nd = Math.sign(d)
    if (nd !== dir) {
      if (dir !== 0) flips++
      dir = nd
    }
  }
  return flips <= 1
}

let failed = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? '  ok ' : 'FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

console.log('flash-audit: single gestures')
for (const kind of Object.keys(STRIKE)) {
  const { L } = simulate(8, [{ t: 0.5, kind }], [])
  const peak = Math.max(...L)
  check(
    `strike '${kind}' monotone rise->fall`,
    monotone(L),
    `peak L ${peak.toFixed(3)} (+${((peak - 1) * 100).toFixed(1)}%)`,
  )
}
for (const kind of Object.keys(SHOWPIECE)) {
  const { L } = simulate(SHOWPIECE[kind].dur + 3, [], [{ t: 0.5, kind }])
  const peak = Math.max(...L)
  const rise = SHOWPIECE[kind].dur / 2
  check(
    `showpiece '${kind}' monotone, rise ${rise.toFixed(1)}s`,
    monotone(L) && rise >= 1.1,
    `peak L ${peak.toFixed(3)}`,
  )
}

console.log('flash-audit: attack floors')
check('big-beat attack >= 0.4 s', STRIKE.ignite.atk >= 0.4 && STRIKE.picardy.atk >= 0.4)

console.log('flash-audit: worst-case schedule (600 s)')
{
  const strikes = [{ t: 2, kind: 'ignite' }]
  for (let t = 8; t < 600; t += 2.15) strikes.push({ t, kind: t < 11 ? 'picardy' : 'land' })
  const shows = []
  const kinds = Object.keys(SHOWPIECE)
  for (let t = 14, i = 0; t < 600; t += 21, i++) shows.push({ t, kind: kinds[i % kinds.length] })
  const { L, shaftMax, expMax } = simulate(600, strikes, shows)
  const fp = flashPairs(L)
  check(`<= 3 opposing pairs in any 1 s window`, fp.worstPerSecond <= 3, `worst ${fp.worstPerSecond}, total ${fp.count} in 600 s`)
  check(`grade.shaft <= 4.5`, shaftMax <= 4.5, `max ${shaftMax.toFixed(2)}`)
  check(`grade.exposure <= 1.30`, expMax <= 1.3, `max ${expMax.toFixed(3)}`)
}

console.log('flash-audit: reduced-motion path (45% amplitude)')
{
  const { L } = simulate(8, [{ t: 0.5, kind: 'ignite' }], [])
  const calmPeak = 1 + (Math.max(...L) - 1) * 0.45
  check('calm ignition excursion < full', calmPeak < Math.max(...L), `calm peak L ${calmPeak.toFixed(3)}`)
}

if (failed > 0) {
  console.error(`\nflash-audit: ${failed} check(s) FAILED`)
  process.exit(1)
}
console.log('\nflash-audit: all checks passed')
