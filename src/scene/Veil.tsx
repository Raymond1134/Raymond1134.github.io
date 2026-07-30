import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore, TRAVEL } from '@/state/store'
import { VEIL_ORDER } from './renderOrder'

/* Fraction of the gather by which the veil is already fully closed. */
const GATHER_CLOSED_AT = 0.85

/* Fraction of the disperse the veil stays at peak before opening. */
const DISPERSE_HOLD = 0.22

/* Peak opacity.*/
const VEIL_PEAK = 0.22

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
    if (s.phase === 'gather') {
      // Quintic: sits near zero for most of the gather, then closes.
      const t = Math.min(1, s.travelClock / (TRAVEL.gather * GATHER_CLOSED_AT))
      a = Math.pow(t, 5) * VEIL_PEAK
    }
    else if (s.phase === 'veil') {
      a = VEIL_PEAK
    }
    else if (s.phase === 'disperse') {
      const t = (s.travelClock - TRAVEL.gather - TRAVEL.veil) / TRAVEL.disperse

      // Held fully closed for a beat before opening.
      const d = Math.max(0, (t - DISPERSE_HOLD) / (1 - DISPERSE_HOLD))
      a = Math.pow(1 - d, 2.2) * VEIL_PEAK
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