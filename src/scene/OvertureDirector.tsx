import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '@/state/store'
import { worldEvents } from './worldEvents'
import { breathState, BREATH_HZ } from './breath'
import { EASE, swell } from '@/motion/tokens'
import { playEmber, playIgnition, playResolve } from '@/audio/score'

const END = 8.0

if (typeof document !== 'undefined') {
  worldEvents.reveal = 0
  worldEvents.domeGain = 0.15
  worldEvents.panelGate = 0
}

const shroud = () =>
  (typeof document !== 'undefined' ? document.getElementById('overture-shroud') : null)

const dropShroud = (instant = false) => {
  const el = shroud()
  if (!el) return
  if (instant) {
    el.remove()
    return
  }
  el.style.opacity = '0'
  setTimeout(() => el.remove(), 950)
}

export default function OvertureDirector() {
  const fieldReady = useStore((s) => s.fieldReady)
  const beaconsReady = useStore((s) => s.beaconsReady)
  const calm = useStore((s) => s.reducedMotion)
  const compact = useStore((s) => s.compact)

  const started = useRef(false)
  const t0 = useRef(-1)
  const vt = useRef(0)
  const rate = useRef(1)
  const done = useRef(false)
  const breathSet = useRef(false)
  const embered = useRef(false)
  const lit = useRef(false)
  const resolved = useRef(false)
  const mountedAt = useRef(-1)

  useEffect(() => {
    const skip = () => {
      if (vt.current > 0.4) rate.current = 4
    }
    addEventListener('pointerdown', skip, { passive: true })
    addEventListener('keydown', skip)
    addEventListener('wheel', skip, { passive: true })
    return () => {
      removeEventListener('pointerdown', skip)
      removeEventListener('keydown', skip)
      removeEventListener('wheel', skip)
    }
  }, [])

  useEffect(() => {
    useStore.getState().setOvertureActive(true)
  }, [])

  useFrame((state, dt) => {
    if (done.current) return
    const t = state.clock.elapsedTime
    if (mountedAt.current < 0) mountedAt.current = t

    if (!started.current) {
      const ready = fieldReady && beaconsReady
      if (!ready && t - mountedAt.current < 4) return
      started.current = true
      t0.current = t
      dropShroud()
      const s = useStore.getState()
      const origin = calm
        ? state.camera.position
        : s.graph.nodes.get(s.currentId)?.worldPosition ?? state.camera.position
      worldEvents.revealOrigin.copy(origin as THREE.Vector3)
      worldEvents.ember.id = calm ? null : s.currentId
      return
    }

    if (worldEvents.skipOverture) rate.current = 4

    const scale = calm ? END / 1.6 : compact ? END / 5.0 : 1
    vt.current += dt * rate.current * scale
    const tau = vt.current
    const seg = (a: number, d: number) => THREE.MathUtils.clamp((tau - a) / d, 0, 1)

    if (calm) {
      const k = Math.min(1, tau / END)
      worldEvents.reveal = k
      worldEvents.domeGain = 0.15 + 0.85 * k
      if (k > 0.5) worldEvents.panelGate = 1
    } else {
      if (!embered.current && tau >= 0.5) {
        embered.current = true
        playEmber(useStore.getState().currentId)
      }
      if (tau < 3.6) {
        const g = EASE.hearth(seg(0.5, 0.7)) * 0.6
        const breathSwell = swell(seg(1.4, 1.5))
        worldEvents.ember.gain = (g + 0.4 * breathSwell) * (1 - 0.3 * EASE.gather(seg(2.9, 0.38)))
      }

      if (!breathSet.current && tau >= 1.4) {
        breathSet.current = true
        breathState.phase = -2 * Math.PI * BREATH_HZ * t - Math.PI / 2
      }

      const inhale = EASE.glide(seg(1.4, 1.2))
      const pull = EASE.gather(seg(2.9, 0.38))
      const rel = EASE.glide(seg(3.6, 1.4))
      worldEvents.camForward = 1.5 * inhale * (1 - pull) - 7 * pull * (1 - rel)

      const pitchUp = EASE.glide(seg(3.1, 1.0))
      const pitchHome = EASE.hearth(seg(4.7, 1.5))
      worldEvents.camPitch = 0.16 * pitchUp * (1 - pitchHome)
      worldEvents.camFov = 9 * EASE.hearth(seg(3.6, 0.45)) * (1 - EASE.glide(seg(4.1, 2.1)))

      worldEvents.domeGain =
        0.15 + 0.45 * seg(1.4, 1.2) - 0.18 * pull * (1 - rel) + 0.4 * rel

      if (!lit.current && tau >= 3.6) {
        lit.current = true
        const st = worldEvents.strike
        st.at = t
        st.kind = 'ignite'
        st.mag = 1.7
        st.origin.copy(worldEvents.revealOrigin)
        playIgnition(useStore.getState().currentId)
      }
      worldEvents.reveal = EASE.glide(seg(3.6, 2.0))
      if (tau >= 3.7) worldEvents.ember.gain = Math.max(0, worldEvents.ember.gain - dt * 2)

      if (tau >= 5.4) {
        worldEvents.panelGate = 1
        if (!resolved.current) {
          resolved.current = true
          playResolve(useStore.getState().currentId)
        }
      }
    }

    if (tau >= END) {
      done.current = true
      worldEvents.reveal = 1
      worldEvents.domeGain = 1
      worldEvents.camForward = 0
      worldEvents.camPitch = 0
      worldEvents.camFov = 0
      worldEvents.panelGate = 1
      worldEvents.ember.id = null
      worldEvents.ember.gain = 0
      useStore.getState().setOvertureActive(false)
    }
  })

  return null
}
