import { create } from 'zustand'
import { graph, site } from '@/content'
import type { Graph } from '@/content/layout'
import { isCoarsePointer, canHover } from '@/device'

type Phase = 'idle' | 'turn' | 'flight' | 'settle' | 'fade'
export type Quality = 'low' | 'medium' | 'high' | 'ultra'

type Fx = 'full' | 'reduced' | 'off'

export const PARTICLE_TEX = { low: 384, medium: 480, high: 512, ultra: 720 } as const

export const TRAVEL = { turn: 0.55, flight: 1.35, settle: 0.7 } as const
const TRAVEL_TOTAL = TRAVEL.turn + TRAVEL.flight + TRAVEL.settle
export const TRAVEL_LANDING = TRAVEL.turn + TRAVEL.flight

export const FADE = { close: 0.35, total: 0.9 } as const

const SETTLE_CUT = 0.25

interface State {
  graph: Graph
  currentId: string
  previousId: string | null
  pendingId: string | null

  queuedId: string | null
  phase: Phase

  travelClock: number

  travelCount: number

  quality: Quality
  fx: Fx
  reducedMotion: boolean
  audioEnabled: boolean
  mapOpen: boolean
  textMode: boolean
  hoveredId: string | null

  fieldReady: boolean
  beaconsReady: boolean
  overtureActive: boolean

  coarse: boolean
  hover: boolean
  portrait: boolean

  compact: boolean
  gyroEnabled: boolean

  travelTo: (id: string, opts?: { instant?: boolean }) => void
  tickTravel: (dt: number) => void
  setHovered: (id: string | null) => void
  setQuality: (q: Quality) => void
  setFx: (f: Fx) => void
  toggleMap: () => void
  toggleAudio: () => void
  toggleTextMode: () => void
  setViewport: (v: { portrait: boolean; compact: boolean }) => void
  setGyro: (on: boolean) => void
  setFieldReady: () => void
  setBeaconsReady: () => void
  setOvertureActive: (on: boolean) => void
}

export const useStore = create<State>((set, get) => ({
  graph,
  currentId: site.root,
  previousId: null,
  pendingId: null,
  queuedId: null,
  phase: 'idle',
  travelClock: 0,
  travelCount: 0,
  quality:
    isCoarsePointer() && typeof innerWidth !== 'undefined' && Math.min(innerWidth, innerHeight) < 600
      ? 'low'
      : isCoarsePointer()
        ? 'medium'
        : 'high',
  fx: 'full',
  reducedMotion: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  audioEnabled: false,
  mapOpen: false,
  textMode: false,
  hoveredId: null,
  fieldReady: false,
  beaconsReady: false,
  overtureActive: false,
  coarse: isCoarsePointer(),
  hover: canHover(),
  portrait: typeof innerWidth !== 'undefined' && innerHeight > innerWidth,
  compact: typeof innerWidth !== 'undefined' && isCoarsePointer() && Math.min(innerWidth, innerHeight) < 600,
  gyroEnabled: false,

  travelTo: (id, opts) => {
    const s = get()
    if (!s.graph.nodes.has(id)) return
    if (s.phase !== 'idle') {
      if (id !== s.currentId && id !== s.pendingId) set({ queuedId: id })
      return
    }
    if (id === s.currentId) return

    if (opts?.instant) {
      set({ previousId: s.currentId, currentId: id, pendingId: null, phase: 'idle', travelClock: 0, mapOpen: false })
      return
    }
    if (s.reducedMotion) {
      set({ pendingId: id, phase: 'fade', travelClock: 0, mapOpen: false, hoveredId: null })
      return
    }
    set({ pendingId: id, phase: 'turn', travelClock: 0, mapOpen: false, hoveredId: null })
  },

  tickTravel: (dt) => {
    const s = get()
    if (s.phase === 'idle') return
    const t = s.travelClock + dt

    if (s.phase === 'fade') {
      if (s.pendingId && t >= FADE.close) {
        set({ travelClock: t, previousId: s.currentId, currentId: s.pendingId, pendingId: null })
        return
      }
      if (!s.pendingId && t >= FADE.total) {
        set({ phase: 'idle', travelClock: 0 })
        return
      }
      set({ travelClock: t })
      return
    }

    if (s.phase === 'turn' && t >= TRAVEL.turn) {
      set({
        phase: 'flight',
        travelClock: t,
        previousId: s.currentId,
        currentId: s.pendingId ?? s.currentId,
      })
      return
    }
    if (s.phase === 'flight' && t >= TRAVEL_LANDING) {
      set({ phase: 'settle', travelClock: t, travelCount: s.travelCount + 1 })
      return
    }
    if (s.phase === 'settle') {
      const end = s.queuedId ? TRAVEL_LANDING + SETTLE_CUT : TRAVEL_TOTAL
      if (t >= end) {
        if (s.queuedId) {
          set({ phase: 'turn', travelClock: 0, pendingId: s.queuedId, queuedId: null, hoveredId: null })
          return
        }
        set({ phase: 'idle', travelClock: 0, pendingId: null })
        return
      }
    }
    set({ travelClock: t })
  },

  setHovered: (id) => set({ hoveredId: id }),
  setQuality: (q) => set({ quality: q }),
  setFx: (f) => set({ fx: f }),
  toggleMap: () => set((s) => ({ mapOpen: !s.mapOpen })),
  toggleAudio: () => set((s) => ({ audioEnabled: !s.audioEnabled })),
  toggleTextMode: () => set((s) => ({ textMode: !s.textMode, mapOpen: false, queuedId: null })),
  setViewport: (v) => set(v),
  setGyro: (on) => set({ gyroEnabled: on }),
  setFieldReady: () => set({ fieldReady: true }),
  setBeaconsReady: () => set({ beaconsReady: true }),
  setOvertureActive: (on) => set({ overtureActive: on }),
}))

export const getCurrentNode = () => {
  const s = useStore.getState()
  return s.graph.nodes.get(s.currentId)!
}

export const travelProgress = (s: { phase: Phase; travelClock: number }) =>
  s.phase === 'idle'
    ? 0
    : s.phase === 'fade'
      ? Math.min(1, s.travelClock / FADE.total)
      : Math.min(1, s.travelClock / TRAVEL_TOTAL)
