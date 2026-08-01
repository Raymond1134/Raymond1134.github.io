import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor, Preload } from '@react-three/drei'
import * as THREE from 'three'
import { Suspense, useEffect, useRef, useState } from 'react'
import Scene from '@/scene/Scene'
import Hud from '@/ui/Hud'
import TextMode from '@/ui/TextMode'
import FirstHint from '@/ui/FirstHint'
import BeaconSheet from '@/ui/BeaconSheet'
import Weave from '@/ui/Weave'
import VisibilityPause from '@/perf/VisibilityPause'
import { useStore } from '@/state/store'
import type { Quality } from '@/state/store'
import { useHashRouting } from '@/state/routing'
import { useViewport } from '@/ui/useViewport'
import { isCoarsePointer } from '@/device'

const coarse = isCoarsePointer()

const dprCap = () =>
  Math.max(
    1,
    Math.min(typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1, coarse ? 1.25 : 1.5),
  )

const TIERS: Quality[] = ['low', 'medium', 'high', 'ultra']

export default function App() {
  useViewport()
  useHashRouting()
  const textMode = useStore((s) => s.textMode)
  const [dpr, setDpr] = useState(dprCap)
  const dprRef = useRef(dpr)
  const declinedAt = useRef(0)
  useEffect(() => {
    dprRef.current = dpr
  }, [dpr])


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
          // The dome is the real background; this only shows for a frame.
          gl.setClearColor(new THREE.Color('#05060f'), 1)
          gl.toneMapping = THREE.NoToneMapping
          scene.fog = new THREE.FogExp2('#0a0e22', 0.0016)
        }}
      >
        <Suspense fallback={null}>
          <Scene />
          <Preload all />
        </Suspense>
        <PerformanceMonitor
          onDecline={() => {
            declinedAt.current = performance.now()
            if (dprRef.current > 1) {
              setDpr((d) => Math.max(1, d - 0.25))
              return
            }
            const s = useStore.getState()
            const i = TIERS.indexOf(s.quality)
            if (i > 0) s.setQuality(TIERS[i - 1])
          }}
          onIncline={() => {
            // Cooldown: without it a device that fails AT the higher dpr
            // oscillates forever, reallocating the canvas + composer each flip.
            if (performance.now() - declinedAt.current < 30_000) return
            setDpr((d) => Math.min(dprCap(), d + 0.25))
          }}
        />
        <VisibilityPause />
      </Canvas>

      <Hud />
      {!textMode && <Weave />}
      {!textMode && <BeaconSheet />}
      {!textMode && <FirstHint />}
      {textMode && <TextMode />}
    </>
  )
}