import { useEffect } from 'react'
import { advance, flushGlobalEffects, useThree } from '@react-three/fiber'
import { useStore } from '@/state/store'
import { input, stillFor } from '@/input/input'
import { isCoarsePointer } from '@/device'
import { worldEvents } from '@/scene/worldEvents'
import { pacing } from './pacing'

const coarse = isCoarsePointer()

const RING = 40
const PACED_MIN_FPS = 56
const IDLE_FPS = 30
const IDLE_AFTER_S = 20
const SAVER_IDLE_AFTER_S = 6
const EVENT_HOLD_S = 6
const TEXT_PARK_MS = 700
const MAP_PARK_MS = 450
const MAX_DT = 0.1
const DROP_AFTER = 3
const WAKE_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel'] as const
const WAKE_OPTS = { capture: true, passive: true }

const ring = new Float64Array(RING)
const sorted = new Float64Array(RING)
const wake = { at: 0 }

const poke = () => {
  wake.at = performance.now()
}

const sceneBusy = (t: number) =>
  t - worldEvents.strike.at < EVENT_HOLD_S ||
  worldEvents.grade.caustic > 0.02 ||
  worldEvents.solo.gain > 0.02

const resting = (t: number) => {
  const s = useStore.getState()
  if (!(s.compact || s.saver) || s.phase !== 'idle' || s.overtureActive || s.mapOpen) return false
  if (s.gyroEnabled || (coarse && input.pointer.active) || sceneBusy(t)) return false
  const quiet = Math.min(stillFor(), (performance.now() - wake.at) / 1000)
  return quiet > (s.saver ? SAVER_IDLE_AFTER_S : IDLE_AFTER_S)
}

const mapRest = (s: { mapOpen: boolean; phase: string; overtureActive: boolean }) =>
  s.mapOpen && s.phase === 'idle' && !s.overtureActive

const divider = (slow: boolean) => {
  if (slow) return Math.max(1, Math.round(pacing.hz / IDLE_FPS))
  if (coarse) return Math.max(1, Math.floor(pacing.hz / PACED_MIN_FPS))
  return 1
}

export default function FrameGovernor() {
  const get = useThree((s) => s.get)
  const clock = useThree((s) => s.clock)

  useEffect(() => {
    let raf = 0
    let vt = clock.elapsedTime
    let last = -1
    let prevTick = -1
    let head = 0
    let filled = 0
    let drops = 0
    let parkTimer: ReturnType<typeof setTimeout> | null = null

    const measure = (ts: number) => {
      if (prevTick >= 0 && useStore.getState().fieldReady) {
        ring[head] = ts - prevTick
        head = (head + 1) % RING
        if (++filled >= RING) {
          filled = 0
          sorted.set(ring)
          sorted.sort()
          const p10 = sorted[Math.floor(RING * 0.1)]
          const hz = p10 > 2 ? Math.round(1000 / p10) : 0
          if (hz > pacing.hz * 1.1) {
            pacing.hz = hz
            drops = 0
          } else if (hz > 0 && hz < pacing.hz * 0.9) {
            if (++drops >= DROP_AFTER) {
              pacing.hz = hz
              drops = 0
            }
          } else {
            drops = 0
          }
        }
      }
      prevTick = ts
    }

    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick)
      measure(ts)
      const slow = resting(vt)
      const div = divider(slow)
      if (div !== pacing.div || slow !== pacing.throttled) {
        pacing.div = div
        pacing.throttled = slow
        pacing.changedAt = performance.now()
      }
      if (div > 1 && last >= 0 && ts - last < (div - 0.5) * (1000 / pacing.hz)) return
      const state = get()
      if (!state.internal.active) return
      const dt = last < 0 ? div / pacing.hz : Math.min(MAX_DT, (ts - last) / 1000)
      last = ts
      vt += dt
      flushGlobalEffects('before', ts)
      advance(vt, false, state)
      flushGlobalEffects('after', ts)
    }

    const start = () => {
      if (raf) return
      last = -1
      prevTick = -1
      pacing.changedAt = performance.now()
      raf = requestAnimationFrame(tick)
    }

    const stop = () => {
      if (!raf) return
      cancelAnimationFrame(raf)
      raf = 0
    }

    const sync = () => {
      if (parkTimer) clearTimeout(parkTimer)
      parkTimer = null
      if (document.hidden) {
        stop()
        return
      }
      const s = useStore.getState()
      const delay = s.textMode ? TEXT_PARK_MS : mapRest(s) ? MAP_PARK_MS : 0
      if (!delay) {
        start()
        return
      }
      if (raf) parkTimer = setTimeout(stop, delay)
    }

    const unsub = useStore.subscribe((s, prev) => {
      if (s.textMode !== prev.textMode || mapRest(s) !== mapRest(prev)) sync()
    })
    document.addEventListener('visibilitychange', sync)
    for (const e of WAKE_EVENTS) addEventListener(e, poke, WAKE_OPTS)
    poke()
    start()
    sync()

    return () => {
      if (parkTimer) clearTimeout(parkTimer)
      for (const e of WAKE_EVENTS) removeEventListener(e, poke, WAKE_OPTS)
      document.removeEventListener('visibilitychange', sync)
      unsub()
      stop()
    }
  }, [get, clock])

  return null
}
