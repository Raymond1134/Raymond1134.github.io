export const LAMBDA = {
  snap: 12,
  quick: 8,
  ease: 4,
  settle: 2,
  calm: 1,
  tide: 0.35,
} as const

export const EASE = {
  hearth: (t: number) => 1 - Math.pow(1 - t, 3.2),
  gather: (t: number) => Math.pow(t, 2.6),
  glide: (t: number) => t * t * t * (t * (t * 6 - 15) + 10),
} as const

export const swell = (t: number) => Math.sin(Math.PI * t)
export const swellTight = (t: number) => Math.pow(Math.sin(Math.PI * t), 1.5)

const ACCEL_END = 0.45
const A_JUNCTION = 0.65
export const flightEase = (ft: number) =>
  ft < ACCEL_END
    ? A_JUNCTION * Math.pow(ft / ACCEL_END, 2.2)
    : A_JUNCTION + (1 - A_JUNCTION) * (1 - Math.pow(1 - (ft - ACCEL_END) / (1 - ACCEL_END), 5))
