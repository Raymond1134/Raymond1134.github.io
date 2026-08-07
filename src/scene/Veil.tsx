import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore, TRAVEL, FADE } from '@/state/store'
import { EASE } from '@/motion/tokens'
import { VEIL_ORDER } from './renderOrder'

const TURN_CLOSED = 0.5

const VEIL_PEAK = 0.18

const FADE_PEAK = 0.5

const VEIL_COLOR = '#080614'

export default function Veil() {
  const mesh = useRef<THREE.Mesh>(null!)
  const mat = useRef<THREE.MeshBasicMaterial>(null!)

  useFrame((state) => {
    const s = useStore.getState()
    const cam = state.camera

    mesh.current.position.copy(cam.position)
    mesh.current.quaternion.copy(cam.quaternion)
    mesh.current.translateZ(-0.4)

    let a = 0
    if (s.phase === 'turn') {
      const t = Math.min(1, s.travelClock / TURN_CLOSED)
      a = Math.pow(t, 5) * VEIL_PEAK
    } else if (s.phase === 'flight') {
      const ft = (s.travelClock - TRAVEL.turn) / TRAVEL.flight
      a = ft < 0.72 ? VEIL_PEAK : VEIL_PEAK * (1 - 0.9 * EASE.hearth((ft - 0.72) / 0.28))
    } else if (s.phase === 'settle') {
      const ts = s.travelClock - TRAVEL.turn - TRAVEL.flight
      a = VEIL_PEAK * 0.1 * (1 - Math.min(1, ts / 0.25))
    } else if (s.phase === 'fade') {
      const t = s.travelClock
      a =
        t < FADE.close
          ? EASE.gather(t / FADE.close) * FADE_PEAK
          : FADE_PEAK * (1 - EASE.hearth(Math.min(1, (t - FADE.close) / (FADE.total - FADE.close))))
    }

    mat.current.opacity = a
    mesh.current.visible = a > 0.002
  })

  return (
    <mesh ref={mesh} renderOrder={VEIL_ORDER} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <meshBasicMaterial
        ref={mat}
        color={VEIL_COLOR}
        transparent
        opacity={0}
        depthTest={false}
        depthWrite={false}
        blending={THREE.NormalBlending}
        toneMapped={false}
      />
    </mesh>
  )
}
