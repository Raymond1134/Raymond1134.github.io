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
