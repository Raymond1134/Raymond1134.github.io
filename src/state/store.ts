import { create } from 'zustand'
import { graph, site } from '@/content'
import type { Graph } from '@/content/layout'
import { isCoarsePointer, canHover } from '@/device'

/**
 * turn = pivot in place to face the destination, flight = the move itself
 * (covered by the veil scrim), settle = parked at the new anchor while the
 * scrim reopens.
 */
export type Phase = 'idle' | 'turn' | 'flight' | 'settle'
export type Quality = 'low' | 'medium' | 'high' | 'ultra'

export const PARTICLE_TEX = { low: 512, medium: 720, high: 1024, ultra: 1280 } as const

/* Timeline, in seconds, of the travel sequence. */
export const TRAVEL = { turn: 0.7, flight: 1.0, settle: 0.5 } as const
export const TRAVEL_TOTAL = TRAVEL.turn + TRAVEL.flight + TRAVEL.settle

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
  /**
   * Until the Phase-10 governor exists, the initial tier is a guess from the
   * pointer: 780² particles is fine on a desktop GPU and a space heater on a
   * phone. Coarse pointers start one tier down.
   */
  quality: isCoarsePointer() ? 'medium' : 'high',
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
    set({ pendingId: id, phase: 'turn', travelClock: 0, mapOpen: false, hoveredId: null })
  },

  tickTravel: (dt) => {
    const s = get()
    if (s.phase === 'idle') return
    const t = s.travelClock + dt

    if (s.phase === 'turn' && t >= TRAVEL.turn) {
      // Identity swaps as the flight begins, so the whole move happens as `current`.
      set({
        phase: 'flight',
        travelClock: t,
        previousId: s.currentId,
        currentId: s.pendingId ?? s.currentId,
      })
      return
    }
    if (s.phase === 'flight' && t >= TRAVEL.turn + TRAVEL.flight) {
      set({ phase: 'settle', travelClock: t })
      return
    }
    if (s.phase === 'settle' && t >= TRAVEL_TOTAL) {
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

