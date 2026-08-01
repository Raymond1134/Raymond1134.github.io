import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor, Preload } from '@react-three/drei'
import * as THREE from 'three'
import { Suspense, useState } from 'react'
import Scene from '@/scene/Scene'
import Hud from '@/ui/Hud'
import TextMode from '@/ui/TextMode'
import FirstHint from '@/ui/FirstHint'
import BeaconSheet from '@/ui/BeaconSheet'
import Weave from '@/ui/Weave'
import { useStore } from '@/state/store'
import { useHashRouting } from '@/state/routing'
import { useViewport } from '@/ui/useViewport'
import { isCoarsePointer } from '@/device'

const coarse = isCoarsePointer()
const DPR_MAX = coarse ? 1.5 : 2

export default function App() {
  useViewport()
  useHashRouting()
  const textMode = useStore((s) => s.textMode)
  const [dpr, setDpr] = useState(DPR_MAX)

  return (
    <>
      <Canvas
        dpr={dpr}
        gl={{
          antialias: false,
          alpha: false,
          powerPreference: coarse ? 'default' : 'high-performance',
          stencil: false,
          depth: true,
          failIfMajorPerformanceCaveat: false,
        }}
        camera={{ fov: 62, near: 0.1, far: 4000, position: [0, 0, 26] }}
        onCreated={({ gl, scene }) => {
          gl.setClearColor(new THREE.Color('#03040a'), 1)
          gl.toneMapping = THREE.NoToneMapping
          scene.fog = new THREE.FogExp2('#03040a', 0.0016)
        }}
      >
        <Suspense fallback={null}>
          <Scene />
          <Preload all />
        </Suspense>
        <PerformanceMonitor
          onDecline={() => setDpr((d) => Math.max(1, d - 0.25))}
          onIncline={() => setDpr((d) => Math.min(DPR_MAX, d + 0.25))}
        />
      </Canvas>

      <Hud />
      {!textMode && <Weave />}
      {!textMode && <BeaconSheet />}
      {!textMode && <FirstHint />}
      {textMode && <TextMode />}
    </>
  )
}