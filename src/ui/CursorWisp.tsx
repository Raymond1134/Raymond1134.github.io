import { useEffect, useRef } from 'react'
import { useStore } from '@/state/store'
import { BEACON_DEFAULT_COLOR } from '@/scene/beacons/palette'

export const WISP_FRONDS = 3
export const WISP_SEGS = 4
export const WISP_SEG_LEN = 2.4
export const WISP_SPREAD = 0.5
export const WISP_SWAY = 0.7
export const WISP_IDLE_AFTER = 2.2
export const WISP_IDLE_DIM = 0.15
export const WISP_SPARKS = 28

type RGB = [number, number, number]

const EMBER_HEAD: RGB = [255, 233, 201]
const EMBER_TAIL: RGB = [138, 92, 230]
const AIM_HEAD: RGB = [234, 241, 255]
const AIM_TAIL: RGB = [122, 162, 255]

const AIM_TARGETS = "button, a, [role='button'], .hud-chip, .weave-node"

const SPARK_RATE = 50
const BURST = 6
const BLOOMS = 6
const SETTLE = 0.003
const RETICLE_ARCS = 4
const RETICLE_FILL = 0.6
const RETICLE_DASH = [0, 0]
const SOLID: number[] = []

const mixInto = (out: RGB, a: RGB, b: RGB, k: number) => {
  out[0] = a[0] + (b[0] - a[0]) * k
  out[1] = a[1] + (b[1] - a[1]) * k
  out[2] = a[2] + (b[2] - a[2]) * k
  return out
}

const rgb = (c: RGB) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`

const AIM_RING = rgb(AIM_TAIL)

const hexInto = (out: RGB, hex: string) => {
  const v = parseInt((/^#[0-9a-f]{6}$/i.test(hex) ? hex : BEACON_DEFAULT_COLOR).slice(1), 16)
  out[0] = (v >> 16) & 255
  out[1] = (v >> 8) & 255
  out[2] = v & 255
  return out
}

const accentOf = () => {
  const s = useStore.getState()
  return s.graph.nodes.get(s.currentId)?.color ?? BEACON_DEFAULT_COLOR
}

interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  age: number
  life: number
}

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

    const fronds = Array.from({ length: WISP_FRONDS }, (_, i) => ({
      ang: Math.PI / 2 + WISP_SPREAD * ((i / (WISP_FRONDS - 1)) * 2 - 1),
      phase: i * 2.4,
      pts: Array.from({ length: WISP_SEGS }, () => ({ x: 0, y: 0 })),
    }))
    const sparks: Spark[] = Array.from({ length: WISP_SPARKS }, () => ({ x: 0, y: 0, vx: 0, vy: 0, age: 1, life: 0 }))
    const blooms: Bloom[] = Array.from({ length: BLOOMS }, () => ({ x: 0, y: 0, age: 1, aim: false }))

    const accentTo: RGB = hexInto([0, 0, 0], accentOf())
    const accent: RGB = [accentTo[0], accentTo[1], accentTo[2]]
    const head: RGB = [0, 0, 0]
    const tail: RGB = [0, 0, 0]
    const tmpA: RGB = [0, 0, 0]
    const tmpB: RGB = [0, 0, 0]
    const segStyle: string[] = Array.from({ length: WISP_SEGS }, () => '')
    let glowStyle = ''
    let coreStyle = ''
    let sparkStyle = ''
    let styleKey = -1

    const recolor = (aimK: number) => {
      const key =
        Math.round(aimK * 40) +
        41 * (Math.round(accent[0] / 3) + 86 * (Math.round(accent[1] / 3) + 86 * Math.round(accent[2] / 3)))
      if (key === styleKey) return
      styleKey = key
      mixInto(head, EMBER_HEAD, accent, 0.3)
      mixInto(tail, EMBER_TAIL, accent, 0.45)
      for (let i = 1; i < WISP_SEGS; i++) {
        const f = i / (WISP_SEGS - 1)
        mixInto(tmpA, head, tail, f)
        mixInto(tmpB, AIM_HEAD, AIM_TAIL, f)
        segStyle[i] = rgb(mixInto(tmpA, tmpA, tmpB, aimK))
      }
      glowStyle = rgb(mixInto(tmpA, tail, AIM_TAIL, aimK))
      coreStyle = rgb(mixInto(tmpA, head, AIM_HEAD, aimK))
      sparkStyle = rgb(mixInto(tmpA, head, EMBER_HEAD, 0.4))
    }

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
    let spawn = 0
    let visible = false
    let aimEl = false
    let movedAt = 0
    let raf = 0
    let parkTimer: ReturnType<typeof setTimeout> | undefined
    let last = performance.now()

    let dx0 = 0
    let dy0 = 0
    let dx1 = -1
    let dy1 = -1
    let bx0 = 0
    let by0 = 0
    let bx1 = -1
    let by1 = -1
    const mark = (x: number, y: number, r: number) => {
      if (bx1 < bx0) {
        bx0 = x - r
        by0 = y - r
        bx1 = x + r
        by1 = y + r
        return
      }
      if (x - r < bx0) bx0 = x - r
      if (y - r < by0) by0 = y - r
      if (x + r > bx1) bx1 = x + r
      if (y + r > by1) by1 = y + r
    }

    const emit = (x: number, y: number, svx: number, svy: number, life: number) => {
      let slot = sparks[0]
      for (const s of sparks) {
        if (s.age >= s.life) {
          slot = s
          break
        }
        if (s.age / s.life > slot.age / slot.life) slot = s
      }
      slot.x = x
      slot.y = y
      slot.vx = svx
      slot.vy = svy
      slot.age = 0
      slot.life = life
    }

    const loop = (now: number) => {
      raf = 0
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const t = now / 1000
      const locked = document.body.dataset.cursor === 'aim'
      const aim = aimEl || locked

      visK += ((visible ? 1 : 0) - visK) * (1 - Math.exp(-dt * 10))
      aimK += ((aim ? 1 : 0) - aimK) * (1 - Math.exp(-dt * 12))
      const parked = now - movedAt > WISP_IDLE_AFTER * 1000
      const idleTo = parked ? WISP_IDLE_DIM : 1
      idleK += (idleTo - idleK) * (1 - Math.exp(-dt * (parked ? 2.5 : 14)))
      const ak = 1 - Math.exp(-dt * 3)
      accent[0] += (accentTo[0] - accent[0]) * ak
      accent[1] += (accentTo[1] - accent[1]) * ak
      accent[2] += (accentTo[2] - accent[2]) * ak
      const tinting =
        Math.abs(accentTo[0] - accent[0]) + Math.abs(accentTo[1] - accent[1]) + Math.abs(accentTo[2] - accent[2]) > 1

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (dx1 >= dx0) ctx.clearRect(dx0 - 2, dy0 - 2, dx1 - dx0 + 4, dy1 - dy0 + 4)
      bx0 = 0
      by0 = 0
      bx1 = -1
      by1 = -1

      const spd = tx < 0 ? 0 : Math.hypot(tx - px, ty - py) / Math.max(dt, 1e-3)
      const mTarget = Math.min(1, spd / 900)
      motionK += (mTarget - motionK) * (1 - Math.exp(-dt * (mTarget > motionK ? 14 : 5)))
      const vk = 1 - Math.exp(-dt * 12)
      if (tx >= 0) {
        vx += ((tx - px) / Math.max(dt, 1e-3) - vx) * vk
        vy += ((ty - py) / Math.max(dt, 1e-3) - vy) * vk
        px = tx
        py = ty
      }
      let ax = tx + vx * 0.014
      let ay = ty + vy * 0.014
      const ld = Math.hypot(ax - tx, ay - ty)
      if (ld > 26) {
        ax = tx + (ax - tx) * (26 / ld)
        ay = ty + (ay - ty) * (26 / ld)
      }

      recolor(aimK)
      const A = visK * idleK
      const draw = visK >= 0.01 && tx >= 0
      ctx.globalCompositeOperation = 'lighter'
      ctx.lineCap = 'round'

      if (draw) {
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
            const prev = i > 1 ? Math.sin(t * 1.2 + fr.phase + (i - 1) * 0.6) * (i - 1) * swayK : 0
            const sx = fr.pts[i - 1].x + prev * perpX
            const sy = fr.pts[i - 1].y + prev * perpY
            const ex = fr.pts[i].x + perpX * sway
            const ey = fr.pts[i].y + perpY * sway
            ctx.globalAlpha = (0.22 - 0.15 * f) * A * motionK
            ctx.strokeStyle = segStyle[i]
            ctx.lineWidth = 2.0 * (1 - f * 0.75)
            ctx.beginPath()
            ctx.moveTo(sx, sy)
            ctx.lineTo(ex, ey)
            ctx.stroke()
            mark(ex, ey, 3)
          }
          mark(ax, ay, 3)
        }

        if (motionK > 0.02) {
          const r = (7 + 6 * motionK) * breathe
          ctx.globalAlpha = 0.3 * motionK * A
          ctx.fillStyle = glowStyle
          ctx.beginPath()
          ctx.arc(ax, ay, r, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 0.2 * motionK * A
          ctx.fillStyle = coreStyle
          ctx.beginPath()
          ctx.arc(ax, ay, (2.6 + 2.4 * motionK) * breathe, 0, Math.PI * 2)
          ctx.fill()
          mark(ax, ay, r + 1)
        }

        if (aimK > 0.02) {
          ctx.strokeStyle = AIM_RING
          ctx.lineWidth = 1.2
          ctx.beginPath()
          if (locked) {
            const rr = 13.5 + (calm ? 0 : 1.2 * Math.sin(t * 4.2))
            const arc = (Math.PI * 2 * rr) / RETICLE_ARCS
            RETICLE_DASH[0] = arc * RETICLE_FILL
            RETICLE_DASH[1] = arc * (1 - RETICLE_FILL)
            ctx.globalAlpha = 0.5 * aimK * Math.max(A, 0.5)
            ctx.lineWidth = 1.4
            ctx.setLineDash(RETICLE_DASH)
            ctx.lineDashOffset = calm ? 0 : -t * 14
            ctx.arc(ax, ay, rr, 0, Math.PI * 2)
            ctx.stroke()
            ctx.setLineDash(SOLID)
          } else {
            ctx.globalAlpha = 0.22 * aimK * A
            ctx.arc(ax, ay, 13, 0, Math.PI * 2)
            ctx.stroke()
          }
          mark(ax, ay, 17)
        }

        if (!calm && motionK > 0.25) {
          spawn += motionK * SPARK_RATE * dt
          while (spawn >= 1) {
            spawn -= 1
            emit(
              ax + (Math.random() - 0.5) * 6,
              ay + (Math.random() - 0.5) * 6,
              -vx * 0.04 + (Math.random() - 0.5) * 40,
              -vy * 0.04 - 18 - Math.random() * 24,
              0.5 + Math.random() * 0.4,
            )
          }
        } else {
          spawn = 0
        }
      }

      let live = 0
      const drag = Math.exp(-dt * 2.4)
      ctx.fillStyle = sparkStyle
      for (const s of sparks) {
        if (s.age >= s.life) continue
        s.age += dt
        if (s.age >= s.life) continue
        live++
        s.vx *= drag
        s.vy = s.vy * drag - 30 * dt
        s.x += s.vx * dt
        s.y += s.vy * dt
        const f = s.age / s.life
        const r = 1.1 + 0.8 * (1 - f)
        ctx.globalAlpha = 0.5 * (1 - f) * (1 - f) * visK
        ctx.beginPath()
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2)
        ctx.fill()
        mark(s.x, s.y, r + 1)
      }

      let blooming = 0
      for (const b of blooms) {
        if (b.age >= 0.35) continue
        b.age += dt
        const f = b.age / 0.35
        if (f >= 1) continue
        blooming++
        const r = 6 + f * (calm ? 10 : 20)
        ctx.globalAlpha = 0.4 * (1 - f) * (1 - f) * visK
        ctx.strokeStyle = b.aim ? AIM_RING : coreStyle
        ctx.lineWidth = 1.6 * (1 - f * 0.6)
        ctx.beginPath()
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2)
        ctx.stroke()
        mark(b.x, b.y, r + 2)
      }
      ctx.globalAlpha = 1

      dx0 = bx0
      dy0 = by0
      dx1 = bx1
      dy1 = by1

      const lit = live > 0 || blooming > 0 || (draw && (motionK > 0.02 || aimK > 0.02)) || (visible && aim)
      if (!lit) {
        visK = visible ? 1 : 0
        aimK = 0
        idleK = idleTo
        motionK = 0
        accent[0] = accentTo[0]
        accent[1] = accentTo[1]
        accent[2] = accentTo[2]
      }
      const busy =
        lit &&
        (live > 0 ||
          blooming > 0 ||
          motionK > 0.002 ||
          Math.abs(visK - (visible ? 1 : 0)) > SETTLE ||
          Math.abs(aimK - (aim ? 1 : 0)) > SETTLE ||
          Math.abs(idleK - idleTo) > SETTLE ||
          tinting ||
          (locked && !calm))
      clearTimeout(parkTimer)
      if (busy) raf = requestAnimationFrame(loop)
      else if (lit && visible && !parked) parkTimer = setTimeout(wake, WISP_IDLE_AFTER * 1000 - (now - movedAt) + 20)
    }

    const wake = () => {
      if (raf) return
      last = performance.now()
      raf = requestAnimationFrame(loop)
    }

    const fit = () => {
      canvas.width = Math.round(innerWidth * dpr)
      canvas.height = Math.round(innerHeight * dpr)
      dx1 = -1
      wake()
    }
    fit()
    addEventListener('resize', fit)

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
      aimEl = !!(el && el.closest && el.closest(AIM_TARGETS))
      wake()
    }
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return
      movedAt = performance.now()
      let slot = blooms[0]
      for (const b of blooms) if (b.age > slot.age) slot = b
      slot.x = e.clientX
      slot.y = e.clientY
      slot.age = 0
      slot.aim = aimEl || document.body.dataset.cursor === 'aim'
      if (!calm) {
        const turn = Math.random() * Math.PI
        for (let i = 0; i < BURST; i++) {
          const a = turn + (i / BURST) * Math.PI * 2
          const v = 140 + Math.random() * 60
          emit(e.clientX, e.clientY, Math.cos(a) * v, Math.sin(a) * v, 0.4 + Math.random() * 0.15)
        }
      }
      wake()
    }
    const onLeave = () => {
      visible = false
      wake()
    }

    const unsub = useStore.subscribe((s, prev) => {
      if (s.currentId === prev.currentId) return
      hexInto(accentTo, accentOf())
      wake()
    })
    const watch = new MutationObserver(wake)
    watch.observe(document.body, { attributes: true, attributeFilter: ['data-cursor'] })

    addEventListener('pointermove', onMove, { passive: true })
    addEventListener('pointerdown', onDown, { passive: true })
    document.documentElement.addEventListener('mouseleave', onLeave)

    return () => {
      removeEventListener('resize', fit)
      removeEventListener('pointermove', onMove)
      removeEventListener('pointerdown', onDown)
      document.documentElement.removeEventListener('mouseleave', onLeave)
      unsub()
      watch.disconnect()
      cancelAnimationFrame(raf)
      clearTimeout(parkTimer)
    }
  }, [hover, calm])

  if (!hover) return null
  return <canvas ref={canvasRef} className="cursor-wisp" aria-hidden />
}
