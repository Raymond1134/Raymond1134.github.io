interface PanelSize {
  w: number
  h: number
}

export function panelSizeFor(portrait: boolean): PanelSize {
  if (portrait) return { w: 26, h: 20 }
  return { w: 30, h: 17 }
}

export const PANEL_Z = 6

export const PANEL_LIFT = 0.18
