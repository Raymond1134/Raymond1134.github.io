import { useEffect, useRef } from 'react'
import { useStore } from '@/state/store'

export const WISP_FRONDS = 3
export const WISP_SEGS = 4
export const WISP_SEG_LEN = 2.4
export const WISP_SPREAD = 0.5
export const WISP_SWAY = 0.7
export const WISP_IDLE_AFTER = 2.2
export const WISP_IDLE_DIM = 0.15

const EMBER_HEAD: [number, number, number] = [255, 233, 201]
const EMBER_TAIL: [number, number, number] = [138, 92, 230]
const AIM_HEAD: [number, number, number] = [234, 241, 255]
const AIM_TAIL: [number, number, number] = [122, 162, 255]

const AIM_TARGETS = "button, a, [role='button'], .hud-chip, .weave-node"

const mix = (a: [number, number, number], b: [number, number, number], k: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
]

const rgba = (c: number[], a: number) =>
  `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`

interface Bloom {
  x: number
  y: number
  age: number
  aim: boolean
}

export default function CursorWisp() {
  const hover = useStore((s) => s.hover)
  const calm = useStore((s) => s.reducedMotion)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!hover) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const dpr = Math.min(typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1, 2)
    const fit = () => {
      canvas.width = Math.round(innerWidth * dpr)
      canvas.height = Math.round(innerHeight * dpr)
    }
    fit()
    addEventListener('resize', fit)

    const fronds = Array.from({ length: WISP_FRONDS }, (_, i) => ({
      ang: Math.PI / 2 + WISP_SPREAD * ((i / (WISP_FRONDS - 1)) * 2 - 1),
      phase: i * 2.4,
      pts: Array.from({ length: WISP_SEGS }, () => ({ x: 0, y: 0 })),
    }))
    const blooms: Bloom[] = []

    let tx = -1
    let ty = -1
    let px = 0
    let py = 0
    let vx = 0
    let vy = 0
    let visK = 0
    let aimK = 0
    let idleK = 1
    let motionK = 0
    let visible = false
    let aim = false
    let movedAt = 0
    let raf = 0
    let last = performance.now()

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const t = now / 1000

      visK += ((visible ? 1 : 0) - visK) * (1 - Math.exp(-dt * 10))
      aimK += ((aim ? 1 : 0) - aimK) * (1 - Math.exp(-dt * 12))
      const parked = now - movedAt > WISP_IDLE_AFTER * 1000
      idleK += ((parked ? WISP_IDLE_DIM : 1) - idleK) * (1 - Math.exp(-dt * (parked ? 2.5 : 14)))

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, innerWidth, innerHeight)
      if (visK < 0.01 || tx < 0) return
      ctx.globalCompositeOperation = 'lighter'
      ctx.lineCap = 'round'

      const spd = Math.hypot(tx - px, ty - py) / Math.max(dt, 1e-3)
      const mTarget = Math.min(1, spd / 900)
      motionK += (mTarget - motionK) * (1 - Math.exp(-dt * (mTarget > motionK ? 14 : 5)))
      const vk = 1 - Math.exp(-dt * 12)
      vx += ((tx - px) / Math.max(dt, 1e-3) - vx) * vk
      vy += ((ty - py) / Math.max(dt, 1e-3) - vy) * vk
      px = tx
      py = ty
      let ax = tx + vx * 0.014
      let ay = ty + vy * 0.014
      const ld = Math.hypot(ax - tx, ay - ty)
      if (ld > 26) {
        ax = tx + (ax - tx) * (26 / ld)
        ay = ty + (ay - ty) * (26 / ld)
      }

      const A = visK * idleK
      const swayK = calm ? 0 : WISP_SWAY
      const breathe = calm ? 1 : 1 + 0.05 * Math.sin(t * 2.1)
      const segLen = WISP_SEG_LEN * (1 - 0.45 * aimK)

      for (const fr of fronds) {
        const rx = Math.cos(fr.ang) * segLen
        const ry = Math.sin(fr.ang) * segLen
        fr.pts[0].x = ax
        fr.pts[0].y = ay
        for (let i = 1; i < WISP_SEGS; i++) {
          const ek = 1 - Math.exp(-dt * (44 - i * 4))
          fr.pts[i].x += (fr.pts[i - 1].x + rx - fr.pts[i].x) * ek
          fr.pts[i].y += (fr.pts[i - 1].y + ry - fr.pts[i].y) * ek
        }
        if (motionK <= 0.02) continue
        const perpX = -Math.sin(fr.ang)
        const perpY = Math.cos(fr.ang)
        for (let i = 1; i < WISP_SEGS; i++) {
          const f = i / (WISP_SEGS - 1)
          const sway = Math.sin(t * 1.2 + fr.phase + i * 0.6) * i * swayK
          const sx = fr.pts[i - 1].x + (i > 1 ? Math.sin(t * 1.2 + fr.phase + (i - 1) * 0.6) * (i - 1) * swayK * perpX : 0)
          const sy = fr.pts[i - 1].y + (i > 1 ? Math.sin(t * 1.2 + fr.phase + (i - 1) * 0.6) * (i - 1) * swayK * perpY : 0)
          const c = mix(mix(EMBER_HEAD, EMBER_TAIL, f), mix(AIM_HEAD, AIM_TAIL, f), aimK)
          ctx.strokeStyle = rgba(c, (0.22 - 0.15 * f) * A * motionK)
          ctx.lineWidth = 2.0 * (1 - f * 0.75)
          ctx.beginPath()
          ctx.moveTo(sx, sy)
          ctx.lineTo(fr.pts[i].x + perpX * sway, fr.pts[i].y + perpY * sway)
          ctx.stroke()
        }
      }

      const glow = mix(EMBER_TAIL, AIM_TAIL, aimK)
      const core = mix(EMBER_HEAD, AIM_HEAD, aimK)
      if (motionK > 0.02) {
        ctx.fillStyle = rgba(glow, 0.3 * motionK * A)
        ctx.beginPath()
        ctx.arc(ax, ay, (7 + 6 * motionK) * breathe, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = rgba(core, 0.2 * motionK * A)
        ctx.beginPath()
        ctx.arc(ax, ay, (2.6 + 2.4 * motionK) * breathe, 0, Math.PI * 2)
        ctx.fill()
      }

      if (aimK > 0.02) {
        ctx.strokeStyle = rgba(AIM_TAIL, 0.22 * aimK * A)
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.arc(ax, ay, 13, 0, Math.PI * 2)
        ctx.stroke()
      }

      for (let i = blooms.length - 1; i >= 0; i--) {
        const b = blooms[i]
        b.age += dt
        const f = b.age / 0.35
        if (f >= 1) {
          blooms.splice(i, 1)
          continue
        }
        const c = b.aim ? AIM_TAIL : EMBER_HEAD
        ctx.strokeStyle = rgba(c, 0.4 * (1 - f) * (1 - f) * visK)
        ctx.lineWidth = 1.6 * (1 - f * 0.6)
        ctx.beginPath()
        ctx.arc(b.x, b.y, 6 + f * (calm ? 10 : 20), 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    raf = requestAnimationFrame(loop)

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return
      const first = tx < 0
      tx = e.clientX
      ty = e.clientY
      if (first) {
        px = tx
        py = ty
        vx = 0
        vy = 0
        for (const fr of fronds) {
          for (const p of fr.pts) {
            p.x = tx
            p.y = ty
          }
        }
      }
      visible = true
      movedAt = performance.now()
      const el = e.target as Element | null
      aim = document.body.dataset.cursor === 'aim' || !!(el && el.closest && el.closest(AIM_TARGETS))
    }
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return
      movedAt = performance.now()
      blooms.push({ x: e.clientX, y: e.clientY, age: 0, aim })
      if (blooms.length > 6) blooms.shift()
    }
    const onLeave = () => {
      visible = false
    }
    addEventListener('pointermove', onMove, { passive: true })
    addEventListener('pointerdown', onDown, { passive: true })
    document.documentElement.addEventListener('mouseleave', onLeave)

    return () => {
      removeEventListener('resize', fit)
      removeEventListener('pointermove', onMove)
      removeEventListener('pointerdown', onDown)
      document.documentElement.removeEventListener('mouseleave', onLeave)
      cancelAnimationFrame(raf)
    }
  }, [hover, calm])

  if (!hover) return null
  return <canvas ref={canvasRef} className="cursor-wisp" aria-hidden />
}
