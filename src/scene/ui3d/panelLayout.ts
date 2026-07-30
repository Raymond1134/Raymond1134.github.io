export interface PanelSize {
  w: number
  h: number
}

/* Shared by the camera rig. */
export function panelSizeFor(compact: boolean, portrait: boolean): PanelSize {
  if (compact) return { w: 20, h: 13 }
  if (portrait) return { w: 22, h: 24 }
  return { w: 30, h: 17 }
}

/* How far the panel floats in front of its beacon. */
export const PANEL_Z = 6

/* Panel centre height as a fraction of panel height above the beacon. */
export const PANEL_LIFT = 0.18
