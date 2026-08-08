import * as THREE from 'three'

export const worldEvents = {
  reveal: 1,
  revealOrigin: new THREE.Vector3(0, 0, 0),

  pulse: { origin: new THREE.Vector3(), t0: -1, speed: 40, band: 8, force: 6, glow: 0.3 },

  pointer: { pos: new THREE.Vector3(), w: 0 },

  attractor: { pos: new THREE.Vector3(), w: 0 },

  aurora: { dir: new THREE.Vector3(0, 1, 0), gain: 0 },

  domeGain: 1,

  camForward: 0,

  camPitch: 0,
  camFov: 0,

  solo: { gain: 0 },

  panelGate: 1,

  panelDim: 0,

  skipOverture: false,

  flare: { id: null as string | null, gain: 0 },

  ember: { id: null as string | null, gain: 0 },

  soundGlintAt: -1e9,
  homePulseAt: -1e9,

  grade: { exposure: 1, ignite: 1, glare: 1, shaft: 1, vault: 1, caustic: 0 },

  strike: {
    at: -1e9,
    kind: 'none' as 'none' | 'ignite' | 'land' | 'picardy',
    mag: 0,
    origin: new THREE.Vector3(),
  },
}
