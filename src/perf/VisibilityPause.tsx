import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'

export default function VisibilityPause() {
  const setFrameloop = useThree((s) => s.setFrameloop)
  const clock = useThree((s) => s.clock)

  useEffect(() => {
    const swap = (mode: 'never' | 'always') => {
      const t = clock.elapsedTime
      setFrameloop(mode)
      clock.elapsedTime = t
    }
    const sync = () => swap(document.hidden ? 'never' : 'always')
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      swap('always')
    }
  }, [setFrameloop, clock])

  return null
}
