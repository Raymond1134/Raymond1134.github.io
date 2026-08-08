import * as THREE from 'three'

export const LUM = {
  abyss: 0.0015,
  midBand: 0.0105,
  zenith: 0.040,
  veils: 0.050,
  deepSnow: 0.045,
  envAmbientClamp: 0.100,

  vaultGlass: 0.075,
  horizonRim: 0.24,
  trenchCrest: 0.045,
  abyssGlow: 0.20,
  aureole: 0.12,
  thread: 0.55,
  threadPulse: 1.00,
  threadHaze: 0.06,
  lensFlare: 0.60,
  halo: 3.00,
  aperture: 0.30,
  nucleusMin: 9.00,
  nucleusMax: 18.00,

  envSourcedClamp: 0.45,
} as const

export const CASTE = {
  seaCeiling: 1.70,
  lightFloor: 3.00,
  phoneSea: 0.32,
  seaTrim: 0.55,
} as const

export const BLOOM_KNEE_WIDE = 0.90

export const BLOOM_KNEE_TIGHT = 2.60

export const AERIAL_K = 0.0042
export const DEEP = '#0f0e30'

export const toLum = (hex: string, y: number) => {
  const c = new THREE.Color(hex)
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
  return c.multiplyScalar(y / Math.max(l, 1e-6))
}

export const DOME_STOPS = {
  nadir: toLum('#02020c', LUM.abyss),
  mid: toLum('#071022', LUM.midBand),
  zenith: toLum('#0e2038', LUM.zenith),
} as const

const MEDIUM: Array<keyof typeof LUM> = [
  'abyss', 'midBand', 'zenith', 'veils', 'deepSnow',
  'horizonRim', 'trenchCrest', 'abyssGlow', 'aureole', 'thread',
  'threadPulse', 'threadHaze', 'lensFlare', 'aperture',
]
const LIGHT: Array<keyof typeof LUM> = [
  'halo', 'nucleusMin', 'nucleusMax',
]

if (import.meta.env.DEV) {
  for (const k of MEDIUM) {
    if (LUM[k] > CASTE.seaCeiling) throw new Error(`LUM.${k} breaks the caste ceiling`)
  }
  for (const k of LIGHT) {
    if (LUM[k] < CASTE.lightFloor) throw new Error(`LUM.${k} is below the light floor`)
  }
}
