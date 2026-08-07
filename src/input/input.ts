import { isCoarsePointer } from '@/device'
import { LAMBDA } from '@/motion/tokens'

export const TAP_SLOP = 12

let lookScale = 0.0012

export function setLookScale(radiansPerPixel: number) {
  lookScale = radiansPerPixel
}

const MAX_PITCH = Math.PI * 0.48

const coarse = isCoarsePointer()

export const input = {
  look: { yaw: 0, pitch: 0 },

  dolly: 0,

  dragDistance: 0,

  dragging: false,

  pointer: { x: 0, y: 0, active: false, speed: 0, movedAt: 0 },

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
let lastPX = 0
let lastPY = 0

const recentring = { on: false }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const gap = (a: Tracked, b: Tracked) => Math.hypot(a.x - b.x, a.y - b.y)

export const stillFor = () =>
  (performance.now() - lastInteraction) / 1000

export function attachInput(el: HTMLElement): () => void {
  const onDown = (e: PointerEvent) => {
    active.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY })
    el.setPointerCapture?.(e.pointerId)
    recentring.on = false

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
    const now = performance.now()
    const p = input.pointer
    const dtm = Math.max(1, now - p.movedAt)
    p.speed = (Math.hypot(e.clientX - lastPX, e.clientY - lastPY) / dtm) * 1000
    p.x = (e.clientX / Math.max(1, el.clientWidth)) * 2 - 1
    p.y = -(e.clientY / Math.max(1, el.clientHeight)) * 2 + 1
    p.movedAt = now
    p.active = coarse ? active.size > 0 : true
    lastPX = e.clientX
    lastPY = e.clientY

    const prev = active.get(e.pointerId)
    if (!prev) return

    const dx = e.clientX - prev.x
    const dy = e.clientY - prev.y
    active.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY })
    input.dragDistance = Math.hypot(e.clientX - startX, e.clientY - startY)
    lastInteraction = now
    recentring.on = false

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
      if (coarse) input.pointer.active = false
    }
  }

  const onLeave = () => {
    input.pointer.active = false
  }

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    input.dolly = clamp(input.dolly + e.deltaY * 0.012, -14, 16)
    lastInteraction = performance.now()
    recentring.on = false
  }

  const onDouble = () => recentre()
  const stopGesture = (e: Event) => e.preventDefault()

  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onUp)
  el.addEventListener('pointerleave', onLeave)
  el.addEventListener('wheel', onWheel, { passive: false })
  el.addEventListener('dblclick', onDouble)
  el.addEventListener('gesturestart', stopGesture)
  el.addEventListener('gesturechange', stopGesture)

  return () => {
    el.removeEventListener('pointerdown', onDown)
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerup', onUp)
    el.removeEventListener('pointercancel', onUp)
    el.removeEventListener('pointerleave', onLeave)
    el.removeEventListener('wheel', onWheel)
    el.removeEventListener('dblclick', onDouble)
    el.removeEventListener('gesturestart', stopGesture)
    el.removeEventListener('gesturechange', stopGesture)
  }
}

export function recentre() {
  recentring.on = true
}

const DEG = Math.PI / 180
const GYRO_GAIN = 0.75
const GYRO_MAX = 0.55

let detachGyro: (() => void) | null = null

export const gyroAvailable = () => typeof DeviceOrientationEvent !== 'undefined'

export function enableGyro(): Promise<boolean> {
  const ctor = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
  const ask = ctor?.requestPermission?.() ?? Promise.resolve('granted')
  return ask
    .then((state) => {
      if (state !== 'granted') return false
      attachGyro()
      return true
    })
    .catch(() => false)
}

export function disableGyro() {
  detachGyro?.()
  detachGyro = null
  input.gyro = null
}

function attachGyro() {
  if (detachGyro) return

  let base: { roll: number; tip: number } | null = null
  const smoothed = { x: 0, y: 0 }

  const onOrient = (e: DeviceOrientationEvent) => {
    if (e.beta === null || e.gamma === null) return
    const a = (screen.orientation?.angle ?? 0) * DEG
    const c = Math.cos(a)
    const s = Math.sin(a)
    const roll = e.gamma * c - e.beta * s
    const tip = e.beta * c + e.gamma * s
    if (!base) base = { roll, tip }

    const yaw = clamp(-(roll - base.roll) * DEG * GYRO_GAIN, -GYRO_MAX, GYRO_MAX)
    const pitch = clamp((tip - base.tip) * DEG * GYRO_GAIN, -GYRO_MAX, GYRO_MAX)

    smoothed.x += (yaw - smoothed.x) * 0.12
    smoothed.y += (pitch - smoothed.y) * 0.12
    input.gyro = smoothed
  }

  const onReset = () => { base = null }

  addEventListener('deviceorientation', onOrient)
  addEventListener('orientationchange', onReset)
  detachGyro = () => {
    removeEventListener('deviceorientation', onOrient)
    removeEventListener('orientationchange', onReset)
  }
}

const LOOK_RETURN_AFTER = 45

const TWO_PI = Math.PI * 2

export function settleInput(dt: number) {
  if (input.dragging) return

  if (recentring.on) {
    const k = 1 - Math.exp(-5 * dt)
    const home = Math.round(input.look.yaw / TWO_PI) * TWO_PI
    input.look.yaw += (home - input.look.yaw) * k
    input.look.pitch -= input.look.pitch * k
    input.dolly -= input.dolly * k
    if (
      Math.abs(input.look.yaw - home) < 0.002 &&
      Math.abs(input.look.pitch) < 0.002 &&
      Math.abs(input.dolly) < 0.02
    ) {
      recentring.on = false
    }
    return
  }

  if (stillFor() < LOOK_RETURN_AFTER) return
  const k = 1 - Math.exp(-LAMBDA.tide * dt)
  const home = Math.round(input.look.yaw / TWO_PI) * TWO_PI
  input.look.yaw += (home - input.look.yaw) * k
  input.look.pitch -= input.look.pitch * k
}

export const lookOffset = () => {
  const yaw = input.look.yaw - Math.round(input.look.yaw / TWO_PI) * TWO_PI
  return Math.hypot(yaw, input.look.pitch)
}
