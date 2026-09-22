import { useStore } from '@/state/store'

interface PanelSize {
  w: number
  h: number
  fit?: number
}

const LANDSCAPE: PanelSize = { w: 30, h: 17 }
const PORTRAIT: PanelSize = { w: 26, h: 20 }
const COMPACT_LANDSCAPE: PanelSize = { w: 30, h: 17, fit: 1.16 }
const COMPACT_PORTRAIT: PanelSize = { w: 26, h: 34, fit: 1.12 }

export function panelSizeFor(portrait: boolean, compact = useStore.getState().compact): PanelSize {
  if (compact) return portrait ? COMPACT_PORTRAIT : COMPACT_LANDSCAPE
  return portrait ? PORTRAIT : LANDSCAPE
}

export const PANEL_Z = 6

export const PANEL_LIFT = 0.18

export const panelContent = {
  count: 0,
  rects: [
    { x: 0, y: 0, hw: 0, hh: 0 },
    { x: 0, y: 0, hw: 0, hh: 0 },
    { x: 0, y: 0, hw: 0, hh: 0 },
  ],
}
