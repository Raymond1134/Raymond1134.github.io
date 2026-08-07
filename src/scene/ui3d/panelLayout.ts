interface PanelSize {
  w: number
  h: number
}

export function panelSizeFor(compact: boolean, portrait: boolean): PanelSize {
  if (compact) return { w: 20, h: 13 }
  if (portrait) return { w: 22, h: 24 }
  return { w: 30, h: 17 }
}

export const PANEL_Z = 6

export const PANEL_LIFT = 0.18
