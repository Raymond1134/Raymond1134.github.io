import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { useStore } from '@/state/store'

export default function TextModePark() {
  const setFrameloop = useThree((s) => s.setFrameloop)
  const clock = useThree((s) => s.clock)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null

    const swap = (mode: 'never' | 'always') => {
      const t = clock.elapsedTime
      setFrameloop(mode)
      clock.elapsedTime = t
    }

    const unsub = useStore.subscribe((s, prev) => {
      if (s.textMode === prev.textMode) return
      if (timer) clearTimeout(timer)
      if (s.textMode) {
        timer = setTimeout(() => swap('never'), 700)
      } else if (!document.hidden) {
        swap('always')
      }
    })

    return () => {
      if (timer) clearTimeout(timer)
      unsub()
      if (!document.hidden) swap('always')
    }
  }, [setFrameloop, clock])

  return null
}
