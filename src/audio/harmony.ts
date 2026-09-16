import { graph } from '@/content'
import { hash01 } from '@/content/layout'

interface Tone {
  hover: number
  drone: number
}

const T = {
  A: { hover: 880.0, drone: 110.0 },
  B: { hover: 493.88, drone: 246.94 },
  C: { hover: 523.25, drone: 130.81 },
  D: { hover: 587.33, drone: 146.83 },
  E: { hover: 659.25, drone: 164.81 },
  G: { hover: 783.99, drone: 196.0 },
} as const satisfies Record<string, Tone>

const BRANCH_TONES: Record<string, Tone[]> = {
  nexus: [{ hover: 440.0, drone: 110.0 }, T.E],
  work: [T.C, T.E, T.G],
  projects: [T.D, T.E, T.A],
  about: [T.E, T.G, T.B],
  contact: [{ hover: 440.0, drone: 110.0 }, T.C, T.E],
}

const FALLBACK = BRANCH_TONES.nexus

export const HEXATONIC = [440.0, 493.88, 523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51]

const C4 = 261.63
const SHARP = 2 ** (1 / 12)

export function inKey(hz: number, major: boolean): number {
  if (!major) return hz
  const oct = Math.log2(hz / C4)
  return Math.abs(oct - Math.round(oct)) < 0.01 ? hz * SHARP : hz
}

const A_MAJOR = [0, 2, 4, 5, 7, 9, 11]
const diatonic = (hz: number, up: number) =>
  A_MAJOR.includes((((Math.round(12 * Math.log2(hz / 440)) + up) % 12) + 12) % 12)

export function majorTierce(hz: number): boolean {
  return diatonic(hz, 4) && !diatonic(hz, 3)
}

export function branchOf(id: string): string {
  let node = graph.nodes.get(id)
  while (node && node.depth > 1 && node.parentId) node = graph.nodes.get(node.parentId)
  return node?.depth === 1 ? node.id : graph.rootId
}

export function tonesOf(branch: string): Tone[] {
  return BRANCH_TONES[branch] ?? FALLBACK
}

export function noteOf(id: string): Tone {
  const node = graph.nodes.get(id)
  if (!node) return FALLBACK[0]
  const branch = branchOf(id)
  const tones = tonesOf(branch)
  if (node.depth <= 1) return tones[0]

  const hub = graph.nodes.get(branch)
  const siblings = hub?.children ?? []
  const i = Math.max(0, siblings.indexOf(id))
  const k = 1 + i
  const tone = tones[k % tones.length]
  const lifted = k >= tones.length && hash01(id, 7) > 0.5
  return lifted ? { hover: tone.hover * 2, drone: tone.drone } : tone
}

export function arrivalChord(id: string): number[] {
  const own = noteOf(id)
  const tones = tonesOf(branchOf(id))
  const under = tones
    .map((t) => t.hover / 2)
    .filter((hz) => Math.abs(hz - own.hover) > 1)
    .slice(0, 2)
  return [...under, own.hover]
}
