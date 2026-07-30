/* Movement (px) beyond which a pointer sequence is a drag, not a tap. */
export const TAP_SLOP = 12

/* A drag is meant to carry the bit of space under the pointer along with it,
 * so the right value is kept up to date by CameraRig via `setLookScale`. */
let lookScale = 0.0012

export function setLookScale(radiansPerPixel: number) {
  lookScale = radiansPerPixel
}

/* Just short of straight up/down — at exactly 90 the view rolls. */
const MAX_PITCH = Math.PI * 0.48

export const input = {
  look: { yaw: 0, pitch: 0 },

  /* Dolly offset in world units; negative = closer. */
  dolly: 0,

  /* Pixels travelled in the current pointer sequence. */
  dragDistance: 0,

  /* True while at least one pointer is down. */
  dragging: false,

  /* Set by the gyro handler when enabled; added to `look` when non-null. */
  gyro: null as { x: number; y: number } | null
}

interface Tracked {
  id: number
  x: number
  y: number
}

const active = new Map<number, Tracked>()
let startX = 0
let startY = 0
let pinchStart = 0
let dollyStart = 0
let lastInteraction = typeof performance !== 'undefined' ? performance.now() : 0

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const gap = (a: Tracked, b: Tracked) => Math.hypot(a.x - b.x, a.y - b.y)

export function attachInput(el: HTMLElement): () => void {
  const onDown = (e: PointerEvent) => {
    active.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY })
    el.setPointerCapture?.(e.pointerId)

    if (active.size === 1) {
      startX = e.clientX
      startY = e.clientY
      input.dragDistance = 0
      input.dragging = true
    } else if (active.size === 2) {
      const [a, b] = [...active.values()]
      pinchStart = gap(a, b)
      dollyStart = input.dolly
    }
    lastInteraction = performance.now()
  }

  const onMove = (e: PointerEvent) => {
    const prev = active.get(e.pointerId)
    if (!prev) return

    const dx = e.clientX - prev.x
    const dy = e.clientY - prev.y
    active.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY })
    input.dragDistance = Math.hypot(e.clientX - startX, e.clientY - startY)
    lastInteraction = performance.now()

    if (active.size === 2) {
      const [a, b] = [...active.values()]
      const d = gap(a, b)
      if (pinchStart > 0) input.dolly = clamp(dollyStart + (d - pinchStart) * 0.06, -14, 16)
      return
    }

    input.look.yaw += dx * lookScale
    input.look.pitch = clamp(input.look.pitch + dy * lookScale, -MAX_PITCH, MAX_PITCH)
  }

  const onUp = (e: PointerEvent) => {
    active.delete(e.pointerId)
    el.releasePointerCapture?.(e.pointerId)
    if (active.size === 0) {
      input.dragging = false
      pinchStart = 0
    }
  }

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    input.dolly = clamp(input.dolly + e.deltaY * 0.012, -14, 16)
    lastInteraction = performance.now()
  }

  const onDouble = () => recentre()
  const stopGesture = (e: Event) => e.preventDefault()

  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onUp)
  el.addEventListener('wheel', onWheel, { passive: false })
  el.addEventListener('dblclick', onDouble)
  el.addEventListener('gesturestart', stopGesture)
  el.addEventListener('gesturechange', stopGesture)

  return () => {
    el.removeEventListener('pointerdown', onDown)
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerup', onUp)
    el.removeEventListener('pointercancel', onUp)
    el.removeEventListener('wheel', onWheel)
    el.removeEventListener('dblclick', onDouble)
    el.removeEventListener('gesturestart', stopGesture)
    el.removeEventListener('gesturechange', stopGesture)
  }
}

export function recentre() {
  input.look.yaw = 0
  input.look.pitch = 0
  input.dolly = 0
}

/* Seconds of stillness before the dolly eases home / the view starts drifting. */
const DOLLY_SETTLE_AFTER = 2.5
const DRIFT_AFTER = 7

const TWO_PI = Math.PI * 2

export function settleInput(dt: number) {
  if (input.dragging) return
  const still = (performance.now() - lastInteraction) / 1000
  if (still < DOLLY_SETTLE_AFTER) return

  input.dolly += -input.dolly * (1 - Math.pow(0.85, dt))
  
  if (still < DRIFT_AFTER) return
  const k = 1 - Math.pow(0.88, dt)
  const home = Math.round(input.look.yaw / TWO_PI) * TWO_PI
  input.look.yaw += (home - input.look.yaw) * k
  input.look.pitch -= input.look.pitch * k
}
