import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { audioFrame, audioLive } from './audio'

export default function AudioFrameSync() {
  const acc = useRef(0)

  useFrame((state, dt) => {
    if (!audioLive() || document.hidden) return
    acc.current += dt
    if (acc.current < 0.1) return
    acc.current = 0
    audioFrame(state.clock.elapsedTime, state.camera)
  })

  return null
}
