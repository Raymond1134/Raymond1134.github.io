import { useEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { PerformanceMonitor } from '@react-three/drei'
import { useStore } from '@/state/store'
import type { Quality } from '@/state/store'
import { isCoarsePointer } from '@/device'
import { BOOT_TIER } from './gpuTier'
import { DPR_FLOOR, dprCap } from './dpr'

const coarse = isCoarsePointer()

const TIERS: Quality[] = ['low', 'medium', 'high', 'ultra']
const MEDIUM = TIERS.indexOf('medium')
const DPR_STEP = 0.25
const BOOT_GRACE_MS = 3500
const INCLINE_HOLD_MS = 30_000
const REVERSAL_LOCK = 2

interface Props {
  dpr: number
  setDpr: Dispatch<SetStateAction<number>>
}

export default function AdaptiveQuality({ dpr, setDpr }: Props) {
  const dprRef = useRef(dpr)
  const bootAt = useRef(Infinity)
  const declinedAt = useRef(0)
  const lastMove = useRef(0)
  const reversals = useRef(0)

  useEffect(() => {
    dprRef.current = dpr
  }, [dpr])

  useEffect(() => {
    bootAt.current = performance.now()
    const clamp = () => setDpr((d) => Math.min(d, dprCap()))
    const conserve = () => {
      const s = useStore.getState()
      if (s.quality !== 'low') s.setQuality('low')
      clamp()
    }
    if (useStore.getState().saver) conserve()
    const unsub = useStore.subscribe((s, prev) => {
      if (s.saver && !prev.saver) conserve()
    })
    addEventListener('resize', clamp)
    return () => {
      removeEventListener('resize', clamp)
      unsub()
    }
  }, [setDpr])

  const settling = () =>
    useStore.getState().overtureActive || performance.now() - bootAt.current < BOOT_GRACE_MS

  const stepDown = () => {
    const s = useStore.getState()
    const d = dprRef.current
    const q = TIERS.indexOf(s.quality)
    const dprTo = (floor: number) => {
      if (d <= floor + 0.05) return false
      setDpr(Math.max(floor, d - DPR_STEP))
      return true
    }
    const qualityTo = (floor: number) => {
      if (q <= floor) return false
      s.setQuality(TIERS[q - 1])
      return true
    }
    const stepped = coarse
      ? dprTo(DPR_FLOOR) || qualityTo(0)
      : dprTo(1) || qualityTo(MEDIUM) || dprTo(DPR_FLOOR) || qualityTo(0)
    if (stepped) return true
    if (s.fx === 'off') return false
    s.setFx(s.fx === 'full' ? 'reduced' : 'off')
    return true
  }

  const stepUp = () => {
    const s = useStore.getState()
    if (s.fx !== 'full') {
      s.setFx(s.fx === 'off' ? 'reduced' : 'full')
      return true
    }
    const d = dprRef.current
    const q = TIERS.indexOf(s.quality)
    const cap = dprCap()
    const ceiling = s.saver ? 0 : TIERS.indexOf(BOOT_TIER)
    const dprTo = (limit: number) => {
      const top = Math.min(limit, cap)
      if (d >= top - 0.01) return false
      setDpr(Math.min(top, d + DPR_STEP))
      return true
    }
    const qualityTo = (limit: number) => {
      if (q >= Math.min(limit, ceiling)) return false
      s.setQuality(TIERS[q + 1])
      return true
    }
    return coarse
      ? qualityTo(ceiling) || dprTo(cap)
      : qualityTo(MEDIUM) || dprTo(1) || qualityTo(ceiling) || dprTo(cap)
  }

  return (
    <PerformanceMonitor
      onDecline={() => {
        if (settling()) return
        declinedAt.current = performance.now()
        if (!stepDown()) return
        if (lastMove.current > 0) reversals.current++
        lastMove.current = -1
      }}
      onIncline={() => {
        if (settling() || reversals.current >= REVERSAL_LOCK) return
        if (performance.now() - declinedAt.current < INCLINE_HOLD_MS) return
        if (stepUp()) lastMove.current = 1
      }}
    />
  )
}
