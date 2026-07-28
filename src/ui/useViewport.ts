import { useEffect } from 'react'
import { useStore } from '@/state/store'
import { isCoarsePointer } from '@/device'

export function useViewport() {
  useEffect(() => {
    const update = () => {
      const w = innerWidth
      const h = innerHeight
      useStore.getState().setViewport({
        portrait: h > w,
        compact: isCoarsePointer() && Math.min(w, h) < 600,
      })
      document.documentElement.style.setProperty('--vh', `${h * 0.01}px`)
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
