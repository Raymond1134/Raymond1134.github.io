export const BREATH_HZ = 0.13

/* 0..1, smooth. */
export const breath = (t: number) => 0.5 + 0.5 * Math.sin(2 * Math.PI * BREATH_HZ * t)
