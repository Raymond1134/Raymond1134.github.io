import { useEffect } from 'react'
import { useStore } from '@/state/store'
import { isCoarsePointer } from '@/device'

export function useViewport() {
  useEffect(() => {
    const update = () => {
      const w = innerWidth
      const h = innerHeight
      const portrait = h > w
      const compact = isCoarsePointer() && Math.min(w, h) < 600
      const s = useStore.getState()
      if (s.portrait !== portrait || s.compact !== compact) s.setViewport({ portrait, compact })
    }

    update()

    const onOrientation = () => requestAnimationFrame(update)
    addEventListener('resize', update)
    addEventListener('orientationchange', onOrientation)
    return () => {
      removeEventListener('resize', update)
      removeEventListener('orientationchange', onOrientation)
    }
  }, [])
}
