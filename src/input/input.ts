import * as THREE from 'three'
import { isCoarsePointer } from '@/device'
import { LAMBDA } from '@/motion/tokens'

export const TAP_SLOP = 12

let lookScale = 0.0012

export function setLookScale(radiansPerPixel: number) {
  lookScale = radiansPerPixel
}

const MAX_PITCH = Math.PI * 0.48

const coarse = isCoarsePointer()

const CALM = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

export const input = {
  look: { yaw: 0, pitch: 0 },

  orbit: { yaw: 0, pitch: 0 },

  dolly: 0,

  dragDistance: 0,

  dragging: false,

  orbiting: false,

  pointer: { x: 0, y: 0, active: false, speed: 0, movedAt: 0 },

  gaze: { x: 0, y: 0, on: false },

  gyro: null as { x: number; y: number } | null
}

interface Tracked {
  id: number
  x: number
  y: number
  orbit: boolean
}

const active = new Map<number, Tracked>()
let startX = 0
let startY = 0
let pinchStart = 0
let dollyStart = 0
let dollySign = 1
let lastInteraction = typeof performance !== 'undefined' ? performance.now() : 0
let lastPX = 0
let lastPY = 0
let pinchLatch = false

const recentring = { on: false }

const FLING_LAMBDA = LAMBDA.ease
const FLING_MAX = 2.4
const FLING_STALE = 80
const FLING_REST = 0.004

const flick = { yaw: 0, pitch: 0, oyaw: 0, opitch: 0, at: 0 }
const fling = { yaw: 0, pitch: 0, oyaw: 0, opitch: 0, at: 0, live: false }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const gap = (a: Tracked, b: Tracked) => Math.hypot(a.x - b.x, a.y - b.y)

export const stillFor = () =>
  (performance.now() - lastInteraction) / 1000

export function haltFling() {
  fling.yaw = 0
  fling.pitch = 0
  fling.oyaw = 0
  fling.opitch = 0
  fling.live = false
}

function primeFling(now: number) {
  haltFling()
  flick.yaw = 0
  flick.pitch = 0
  flick.oyaw = 0
  flick.opitch = 0
  flick.at = now
  fling.at = now
}

function steer(yaw: number, pitch: number, oyaw: number, opitch: number, now: number) {
  input.look.yaw += yaw
  input.look.pitch = clamp(input.look.pitch + pitch, -MAX_PITCH, MAX_PITCH)
  input.orbit.yaw += oyaw
  input.orbit.pitch = clamp(input.orbit.pitch + opitch, -1, 1)

  flick.yaw += yaw
  flick.pitch += pitch
  flick.oyaw += oyaw
  flick.opitch += opitch
  flick.at = now
  const span = now - fling.at
  if (span < 8) return
  const k = 1 - Math.exp(-span / 40)
  const rate = 1000 / span
  fling.yaw += (flick.yaw * rate - fling.yaw) * k
  fling.pitch += (flick.pitch * rate - fling.pitch) * k
  fling.oyaw += (flick.oyaw * rate - fling.oyaw) * k
  fling.opitch += (flick.opitch * rate - fling.opitch) * k
  fling.at = now
  flick.yaw = 0
  flick.pitch = 0
  flick.oyaw = 0
  flick.opitch = 0
}

function release(now: number) {
  const held = now - flick.at
  if (CALM || input.dragDistance <= TAP_SLOP || held > FLING_STALE) {
    haltFling()
    return
  }
  const keep = Math.exp(-Math.max(0, held - 16) / 30)
  const lk = keep * Math.min(1, FLING_MAX / Math.max(1e-6, Math.hypot(fling.yaw, fling.pitch)))
  const ok = keep * Math.min(1, FLING_MAX / Math.max(1e-6, Math.hypot(fling.oyaw, fling.opitch)))
  fling.yaw *= lk
  fling.pitch *= lk
  fling.oyaw *= ok
  fling.opitch *= ok
  fling.live = true
}

export function attachInput(el: HTMLElement): () => void {
  const track = (e: PointerEvent, now: number) => {
    const p = input.pointer
    p.x = (e.clientX / Math.max(1, el.clientWidth)) * 2 - 1
    p.y = -(e.clientY / Math.max(1, el.clientHeight)) * 2 + 1
    p.movedAt = now
    lastPX = e.clientX
    lastPY = e.clientY
  }

  const onDown = (e: PointerEvent) => {
    const now = performance.now()
    active.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY, orbit: e.button === 2 })
    el.setPointerCapture?.(e.pointerId)
    recentring.on = false
    input.orbiting = active.size >= 2 || [...active.values()].some((t) => t.orbit)

    if (e.isPrimary) {
      input.pointer.speed = 0
      track(e, now)
    }
    if (e.pointerType === 'touch') input.gaze.on = false
    primeFling(now)

    if (active.size === 1) {
      startX = e.clientX
      startY = e.clientY
      input.dragDistance = 0
      input.dragging = true
    } else {
      pinchLatch = true
      input.pointer.active = false
      if (active.size === 2) {
        const [a, b] = [...active.values()]
        pinchStart = gap(a, b)
        dollyStart = input.dolly
        dollySign = Math.cos(input.look.yaw) >= 0 ? 1 : -1
      }
    }
    lastInteraction = now
  }

  const onMove = (e: PointerEvent) => {
    const now = performance.now()
    const p = input.pointer
    if (e.isPrimary) {
      const dtm = Math.max(1, now - p.movedAt)
      p.speed = (Math.hypot(e.clientX - lastPX, e.clientY - lastPY) / dtm) * 1000
      track(e, now)
      if (e.pointerType !== 'touch') {
        input.gaze.x = p.x
        input.gaze.y = p.y
        input.gaze.on = true
      }
    }
    p.active = pinchLatch ? false : coarse ? active.size === 1 : true

    const prev = active.get(e.pointerId)
    if (!prev) return

    const dx = e.clientX - prev.x
    const dy = e.clientY - prev.y
    active.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY, orbit: prev.orbit })
    input.dragDistance = Math.hypot(e.clientX - startX, e.clientY - startY)
    lastInteraction = now
    recentring.on = false

    if (active.size === 2) {
      const [a, b] = [...active.values()]
      const d = gap(a, b)
      if (pinchStart > 0) input.dolly = clamp(dollyStart - (d - pinchStart) * 0.06 * dollySign, -14, 16)
      steer(0, 0, -dx * 0.5 * lookScale, dy * 0.5 * lookScale, now)
      return
    }

    if (pinchLatch) return

    if (prev.orbit) {
      steer(0, 0, -dx * lookScale, dy * lookScale, now)
      return
    }

    steer(dx * lookScale, dy * lookScale, 0, 0, now)
  }

  const onUp = (e: PointerEvent) => {
    active.delete(e.pointerId)
    el.releasePointerCapture?.(e.pointerId)
    input.orbiting = active.size >= 2 || [...active.values()].some((t) => t.orbit)
    if (active.size === 2) {
      const [a, b] = [...active.values()]
      pinchStart = gap(a, b)
      dollyStart = input.dolly
    }
    if (active.size === 0) {
      input.dragging = false
      pinchStart = 0
      pinchLatch = false
      if (coarse) input.pointer.active = false
      release(performance.now())
    }
  }

  const onLeave = () => {
    input.pointer.active = false
  }

  const onExit = () => {
    input.gaze.on = false
  }

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const s = Math.cos(input.look.yaw) >= 0 ? 1 : -1
    input.dolly = clamp(input.dolly + e.deltaY * 0.012 * s, -14, 16)
    lastInteraction = performance.now()
    recentring.on = false
  }

  const onDouble = () => recentre()
  const stopGesture = (e: Event) => e.preventDefault()

  el.addEventListener('contextmenu', stopGesture)
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onUp)
  el.addEventListener('pointerleave', onLeave)
  el.addEventListener('wheel', onWheel, { passive: false })
  el.addEventListener('dblclick', onDouble)
  el.addEventListener('gesturestart', stopGesture)
  el.addEventListener('gesturechange', stopGesture)
  document.documentElement.addEventListener('mouseleave', onExit)

  return () => {
    el.removeEventListener('contextmenu', stopGesture)
    el.removeEventListener('pointerdown', onDown)
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerup', onUp)
    el.removeEventListener('pointercancel', onUp)
    el.removeEventListener('pointerleave', onLeave)
    el.removeEventListener('wheel', onWheel)
    el.removeEventListener('dblclick', onDouble)
    el.removeEventListener('gesturestart', stopGesture)
    el.removeEventListener('gesturechange', stopGesture)
    document.documentElement.removeEventListener('mouseleave', onExit)
  }
}

const DEG = Math.PI / 180
const GYRO_GAIN = 1
const GYRO_MAX = 0.55
const GYRO_SMOOTH = 11
const GYRO_DRIFT = 1 / 8
const GYRO_REBASE = 5
const GYRO_REBASE_FOR = 1600
const GYRO_TILT = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2)
const ZEE = new THREE.Vector3(0, 0, 1)

let detachGyro: (() => void) | null = null
let gyroRebaseUntil = 0

export function recentre() {
  recentring.on = true
  haltFling()
  gyroRebaseUntil = performance.now() + GYRO_REBASE_FOR
}

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
  const g = input.gyro
  if (g) {
    input.look.yaw += g.x
    input.look.pitch = clamp(input.look.pitch + g.y, -MAX_PITCH, MAX_PITCH)
  }
  input.gyro = null
}

function attachGyro() {
  if (detachGyro) return

  const euler = new THREE.Euler(0, 0, 0, 'YXZ')
  const qNow = new THREE.Quaternion()
  const qScreen = new THREE.Quaternion()
  const qRel = new THREE.Quaternion()
  const rel = new THREE.Euler(0, 0, 0, 'YXZ')
  let base: THREE.Quaternion | null = null
  let lastAt = 0
  const smoothed = { x: 0, y: 0 }

  const relate = (from: THREE.Quaternion) => {
    qRel.copy(from).invert().multiply(qNow)
    rel.setFromQuaternion(qRel)
  }

  const onOrient = (e: DeviceOrientationEvent) => {
    if (e.beta === null || e.gamma === null) return
    euler.set(e.beta * DEG, (e.alpha ?? 0) * DEG, -e.gamma * DEG)
    qNow.setFromEuler(euler)
    qNow.multiply(GYRO_TILT)
    qNow.multiply(qScreen.setFromAxisAngle(ZEE, -(screen.orientation?.angle ?? 0) * DEG))

    const now = performance.now()
    const dts = base ? clamp((now - lastAt) / 1000, 0, 0.1) : 0
    lastAt = now
    if (!base) base = qNow.clone()
    else base.slerp(qNow, 1 - Math.exp(-(now < gyroRebaseUntil ? GYRO_REBASE : GYRO_DRIFT) * dts))
    relate(base)
    const reach = Math.max(Math.abs(rel.x), Math.abs(rel.y)) * GYRO_GAIN / GYRO_MAX
    if (reach > 1) {
      base.slerp(qNow, 1 - 1 / reach)
      relate(base)
    }

    const a = 1 - Math.exp(-GYRO_SMOOTH * dts)
    smoothed.x += (clamp(rel.y * GYRO_GAIN, -GYRO_MAX, GYRO_MAX) - smoothed.x) * a
    smoothed.y += (clamp(rel.x * GYRO_GAIN, -GYRO_MAX, GYRO_MAX) - smoothed.y) * a
    input.gyro = smoothed
  }

  const onReset = () => { base = null }

  addEventListener('deviceorientation', onOrient)
  addEventListener('orientationchange', onReset)
  screen.orientation?.addEventListener('change', onReset)
  detachGyro = () => {
    removeEventListener('deviceorientation', onOrient)
    removeEventListener('orientationchange', onReset)
    screen.orientation?.removeEventListener('change', onReset)
  }
}

const LOOK_RETURN_AFTER = 45

export function coastInput(dt: number) {
  if (!fling.live || input.dragging) return
  const decay = Math.exp(-FLING_LAMBDA * dt)
  const k = (1 - decay) / FLING_LAMBDA
  input.look.yaw += fling.yaw * k
  input.look.pitch = clamp(input.look.pitch + fling.pitch * k, -MAX_PITCH, MAX_PITCH)
  input.orbit.yaw += fling.oyaw * k
  input.orbit.pitch = clamp(input.orbit.pitch + fling.opitch * k, -1, 1)
  fling.yaw *= decay
  fling.pitch *= decay
  fling.oyaw *= decay
  fling.opitch *= decay
  if (Math.max(Math.hypot(fling.yaw, fling.pitch), Math.hypot(fling.oyaw, fling.opitch)) < FLING_REST) haltFling()
}

const TWO_PI = Math.PI * 2

export function settleInput(dt: number) {
  if (input.orbiting) {
    const k = 1 - Math.exp(-5 * dt)
    const home = Math.round(input.look.yaw / TWO_PI) * TWO_PI
    input.look.yaw += (home - input.look.yaw) * k
    input.look.pitch -= input.look.pitch * k
  }
  if (input.dragging) return

  if (recentring.on) {
    const k = 1 - Math.exp(-5 * dt)
    const home = Math.round(input.look.yaw / TWO_PI) * TWO_PI
    const ohome = Math.round(input.orbit.yaw / TWO_PI) * TWO_PI
    input.look.yaw += (home - input.look.yaw) * k
    input.look.pitch -= input.look.pitch * k
    input.orbit.yaw += (ohome - input.orbit.yaw) * k
    input.orbit.pitch -= input.orbit.pitch * k
    input.dolly -= input.dolly * k
    if (
      Math.abs(input.look.yaw - home) < 0.002 &&
      Math.abs(input.look.pitch) < 0.002 &&
      Math.abs(input.orbit.yaw - ohome) < 0.002 &&
      Math.abs(input.orbit.pitch) < 0.002 &&
      Math.abs(input.dolly) < 0.02
    ) {
      recentring.on = false
    }
    return
  }

  if (stillFor() < LOOK_RETURN_AFTER) return
  const k = 1 - Math.exp(-LAMBDA.tide * dt)
  const home = Math.round(input.look.yaw / TWO_PI) * TWO_PI
  const ohome = Math.round(input.orbit.yaw / TWO_PI) * TWO_PI
  input.look.yaw += (home - input.look.yaw) * k
  input.look.pitch -= input.look.pitch * k
  input.orbit.yaw += (ohome - input.orbit.yaw) * k
  input.orbit.pitch -= input.orbit.pitch * k
}

export const lookOffset = () => {
  const yaw = input.look.yaw - Math.round(input.look.yaw / TWO_PI) * TWO_PI
  return Math.hypot(yaw, input.look.pitch)
}

export const awayOffset = () => {
  const oyaw = input.orbit.yaw - Math.round(input.orbit.yaw / TWO_PI) * TWO_PI
  return Math.hypot(lookOffset(), oyaw, input.orbit.pitch)
}
