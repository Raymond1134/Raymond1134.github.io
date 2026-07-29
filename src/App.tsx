import { Canvas } from '@react-three/fiber'
import { AdaptiveDpr, Preload } from '@react-three/drei'
import * as THREE from 'three'
import { Suspense } from 'react'
import Scene from '@/scene/Scene'
import Hud from '@/ui/Hud'
import TextMode from '@/ui/TextMode'
import FirstHint from '@/ui/FirstHint'
import { useStore } from '@/state/store'
import { useViewport } from '@/ui/useViewport'
import { isCoarsePointer } from '@/device'

const coarse = isCoarsePointer()

export default function App() {
  useViewport()
  const textMode = useStore((s) => s.textMode)

  return (
    <>
      <Canvas
        dpr={coarse ? [1, 1.5] : [1, 2]}
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
        <AdaptiveDpr pixelated />
      </Canvas>

      <Hud />
      {!textMode && <FirstHint />}
      {textMode && <TextMode />}
    </>
  )
}