import { useStore } from '@/state/store'
import { isCoarsePointer } from '@/device'
import { SOFTWARE_GL } from './gpuTier'

const coarse = isCoarsePointer()

const TARGET_PX = coarse ? 1.2e6 : 5.0e6
export const DPR_FLOOR = 0.7
export const SAVER_DPR = 1

export const dprCap = () => {
  const w = typeof innerWidth !== 'undefined' ? innerWidth : 1
  const h = typeof innerHeight !== 'undefined' ? innerHeight : 1
  const ratio = Math.min(
    typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1,
    coarse ? 1.25 : 1.5,
  )
  const cap = Math.max(DPR_FLOOR, Math.min(ratio, Math.sqrt(TARGET_PX / (w * h))))
  return useStore.getState().saver ? Math.min(cap, SAVER_DPR) : cap
}

export const bootDpr = () => (SOFTWARE_GL ? DPR_FLOOR : dprCap())
