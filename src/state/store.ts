import { create } from 'zustand'
import { graph, site } from '@/content'
import type { Graph } from '@/content/layout'
import { isCoarsePointer, canHover } from '@/device'

export type Phase = 'idle' | 'gather' | 'veil' | 'disperse'
export type Quality = 'low' | 'medium' | 'high' | 'ultra'

export const PARTICLE_TEX = { low: 256, medium: 512, high: 1024, ultra: 2048 } as const

/* Timeline, in seconds, of the travel sequence. */
export const TRAVEL = { gather: 0.9, veil: 0.5, disperse: 1.2 } as const
export const TRAVEL_TOTAL = TRAVEL.gather + TRAVEL.veil + TRAVEL.disperse

interface State {
  graph: Graph
  currentId: string
  previousId: string | null
  pendingId: string | null
  phase: Phase

  /* Seconds elapsed inside the current travel sequence. */
  travelClock: number

  quality: Quality
  reducedMotion: boolean
  audioEnabled: boolean
  mapOpen: boolean
  textMode: boolean
  hoveredId: string | null

  /* device / viewport */
  coarse: boolean
  hover: boolean
  portrait: boolean

  /* Shorthand for "lay this out for a phone". Portrait AND coarse AND narrow. */
  compact: boolean
  gyroEnabled: boolean

  travelTo: (id: string, opts?: { instant?: boolean }) => void
  tickTravel: (dt: number) => void
  setHovered: (id: string | null) => void
  setQuality: (q: Quality) => void
  toggleMap: () => void
  toggleAudio: () => void
  toggleTextMode: () => void
  setViewport: (v: { portrait: boolean; compact: boolean }) => void
  setGyro: (on: boolean) => void
}

export const useStore = create<State>((set, get) => ({
  graph,
  currentId: site.root,
  previousId: null,
  pendingId: null,
  phase: 'idle',
  travelClock: 0,
  quality: 'high',
  reducedMotion: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  audioEnabled: false,
  mapOpen: false,
  textMode: false,
  hoveredId: null,
  coarse: isCoarsePointer(),
  hover: canHover(),
  portrait: typeof innerWidth !== 'undefined' && innerHeight > innerWidth,
  compact: typeof innerWidth !== 'undefined' && isCoarsePointer() && Math.min(innerWidth, innerHeight) < 600,
  gyroEnabled: false,

  travelTo: (id, opts) => {
    const s = get()
    if (!s.graph.nodes.has(id)) return
    if (id === s.currentId) return
    if (s.phase !== 'idle') return

    if (opts?.instant || s.reducedMotion) {
      set({ previousId: s.currentId, currentId: id, pendingId: null, phase: 'idle', travelClock: 0, mapOpen: false })
      return
    }
    set({ pendingId: id, phase: 'gather', travelClock: 0, mapOpen: false, hoveredId: null })
  },

  tickTravel: (dt) => {
    const s = get()
    if (s.phase === 'idle') return
    const t = s.travelClock + dt

    if (s.phase === 'gather' && t >= TRAVEL.gather) {
      set({
        phase: 'veil',
        travelClock: t,
        previousId: s.currentId,
        currentId: s.pendingId ?? s.currentId,
      })
      return
    }
    if (s.phase === 'veil' && t >= TRAVEL.gather + TRAVEL.veil) {
      set({ phase: 'disperse', travelClock: t })
      return
    }
    if (s.phase === 'disperse' && t >= TRAVEL_TOTAL) {
      set({ phase: 'idle', travelClock: 0, pendingId: null })
      return
    }
    set({ travelClock: t })
  },

  setHovered: (id) => set({ hoveredId: id }),
  setQuality: (q) => set({ quality: q }),
  toggleMap: () => set((s) => ({ mapOpen: !s.mapOpen })),
  toggleAudio: () => set((s) => ({ audioEnabled: !s.audioEnabled })),
  toggleTextMode: () => set((s) => ({ textMode: !s.textMode })),
  setViewport: (v) => set(v),
  setGyro: (on) => set({ gyroEnabled: on }),
}))

/* Non-reactive helpers for use inside useFrame. */
export const getCurrentNode = () => {
  const s = useStore.getState()
  return s.graph.nodes.get(s.currentId)!
}

export const getPreviousNode = () => {
  const s = useStore.getState()
  return s.previousId ? s.graph.nodes.get(s.previousId) ?? null : null
}

/* 0 to 1 across the whole travel sequence; 0 when idle. */
export const travelProgress = (s: { phase: Phase; travelClock: number }) =>
    s.phase === 'idle' ? 0 : Math.min(1, s.travelClock / TRAVEL_TOTAL)

/* The implosion amount: 0 idle to 1 fully engulfed to 0 dispersed. */
export function implodeAmount(phase: Phase, clock: number): number {
  if (phase === 'idle') return 0
  if (phase === 'gather') {
    const t = clock / TRAVEL.gather
    return t * t * t
  }
  if (phase === 'veil') return 1
  const t = (clock - TRAVEL.gather - TRAVEL.veil) / TRAVEL.disperse
  return Math.pow(1 - t, 3)
}