export const BREATH_HZ = 0.13

export const breathState = { phase: 0, scale: 1 }

export const breath = (t: number) =>
  0.5 + 0.5 * breathState.scale * Math.sin(2 * Math.PI * BREATH_HZ * t + breathState.phase)

export const nextInhale = (t: number) => {
  const w = 2 * Math.PI * BREATH_HZ
  const x = w * t + breathState.phase
  const k = Math.ceil((x + Math.PI / 2) / (2 * Math.PI))
  return (2 * Math.PI * k - Math.PI / 2 - x) / w
}
