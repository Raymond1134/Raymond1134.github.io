import { Canvas } from '@react-three/fiber'
import { Preload } from '@react-three/drei'
import * as THREE from 'three'
import { Suspense, useEffect, useState } from 'react'
import Scene from '@/scene/Scene'
import Hud from '@/ui/Hud'
import TextMode from '@/ui/TextMode'
import SeoContent from '@/ui/SeoContent'
import FirstHint from '@/ui/FirstHint'
import OvertureSkip from '@/ui/OvertureSkip'
import SoundHint from '@/ui/SoundHint'
import CursorWisp from '@/ui/CursorWisp'
import Weave from '@/ui/Weave'
import BeaconTabStops from '@/ui/BeaconTabStops'
import Shortcuts from '@/ui/Shortcuts'
import AudioBridge from '@/audio/AudioBridge'
import FrameGovernor from '@/perf/FrameGovernor'
import BatterySaver from '@/perf/BatterySaver'
import AdaptiveQuality from '@/perf/AdaptiveQuality'
import { bootDpr } from '@/perf/dpr'
import { GL_ATTRIBUTES } from '@/perf/gpuTier'
import { NO_COMPOSER } from '@/scene/composerPolicy'
import { useStore } from '@/state/store'
import { useHashRouting } from '@/state/routing'
import { useViewport } from '@/ui/useViewport'

export default function App() {
  useViewport()
  useHashRouting()
  const textMode = useStore((s) => s.textMode)
  const overture = useStore((s) => s.overtureActive)
  const calm = useStore((s) => s.reducedMotion)
  const [dpr, setDpr] = useState(bootDpr)

  const [textShown, setTextShown] = useState(textMode)
  if (textMode && !textShown) setTextShown(true)
  useEffect(() => {
    if (textMode || !textShown) return
    const id = setTimeout(() => setTextShown(false), 380)
    return () => clearTimeout(id)
  }, [textMode, textShown])

  return (
    <>
      <Canvas
        frameloop="never"
        dpr={dpr}
        gl={GL_ATTRIBUTES}
        camera={{ fov: 62, near: 0.1, far: 4000, position: [0, 0, 26] }}
        onCreated={({ gl }) => {
          gl.setClearColor(new THREE.Color('#03040a'), 1)
          gl.toneMapping = THREE.NoToneMapping
        }}
      >
        <Suspense fallback={null}>
          <Scene />
          <Preload all />
        </Suspense>
        <AdaptiveQuality dpr={dpr} setDpr={setDpr} />
        <FrameGovernor />
      </Canvas>

      <Hud />
      <AudioBridge />
      <BatterySaver />
      {!textMode && <Weave />}
      {!textMode && overture && <OvertureSkip />}
      {!textMode && !overture && <FirstHint />}
      {!textMode && !overture && <SoundHint />}
      {!textMode && <BeaconTabStops />}
      {!textMode && <Shortcuts />}
      {!textMode && <CursorWisp />}
      {textShown && (
        <div className="tm-fade" data-closing={!textMode || undefined}>
          <TextMode />
        </div>
      )}
      {calm && !NO_COMPOSER && <div className="grain-static" aria-hidden />}
      {!textMode && <SeoContent />}
    </>
  )
}
