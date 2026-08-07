import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor, Preload } from '@react-three/drei'
import * as THREE from 'three'
import { Suspense, useEffect, useRef, useState } from 'react'
import Scene from '@/scene/Scene'
import Hud from '@/ui/Hud'
import TextMode from '@/ui/TextMode'
import SeoContent from '@/ui/SeoContent'
import FirstHint from '@/ui/FirstHint'
import OvertureSkip from '@/ui/OvertureSkip'
import SoundHint from '@/ui/SoundHint'
import BeaconSheet from '@/ui/BeaconSheet'
import Weave from '@/ui/Weave'
import BeaconTabStops from '@/ui/BeaconTabStops'
import Shortcuts from '@/ui/Shortcuts'
import AudioBridge from '@/audio/AudioBridge'
import VisibilityPause from '@/perf/VisibilityPause'
import TextModePark from '@/perf/TextModePark'
import BatterySaver from '@/perf/BatterySaver'
import { NO_COMPOSER } from '@/scene/composerPolicy'
import { useStore } from '@/state/store'
import type { Quality } from '@/state/store'
import { useHashRouting } from '@/state/routing'
import { useViewport } from '@/ui/useViewport'
import { isCoarsePointer } from '@/device'

const coarse = isCoarsePointer()

const TARGET_PX = coarse ? 1.2e6 : 5.0e6
const DPR_FLOOR = 0.7

const dprCap = () => {
  const w = typeof innerWidth !== 'undefined' ? innerWidth : 1
  const h = typeof innerHeight !== 'undefined' ? innerHeight : 1
  const ratio = Math.min(
    typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1,
    coarse ? 1.25 : 1.5,
  )
  return Math.max(DPR_FLOOR, Math.min(ratio, Math.sqrt(TARGET_PX / (w * h))))
}

const TIERS: Quality[] = ['low', 'medium', 'high', 'ultra']

export default function App() {
  useViewport()
  useHashRouting()
  const textMode = useStore((s) => s.textMode)
  const overture = useStore((s) => s.overtureActive)
  const calm = useStore((s) => s.reducedMotion)
  const [dpr, setDpr] = useState(dprCap)
  const dprRef = useRef(dpr)
  const declinedAt = useRef(0)
  useEffect(() => {
    dprRef.current = dpr
  }, [dpr])

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
        onCreated={({ gl }) => {
          gl.setClearColor(new THREE.Color('#030410'), 1)
          gl.toneMapping = THREE.NoToneMapping

          const ctx = gl.getContext()
          const dbg = ctx.getExtension('WEBGL_debug_renderer_info')
          const name = dbg ? String(ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : ''
          const cores = navigator.hardwareConcurrency ?? 0
          const discrete = /nvidia|geforce|rtx |gtx |radeon (rx|pro)|apple m\d/i.test(name)
          const software = /swiftshader|llvmpipe|software|basic render/i.test(name)
          const s = useStore.getState()
          if (!coarse && s.quality === 'high') {
            if (discrete && cores >= 8) s.setQuality('ultra')
            else if (software || cores <= 4) s.setQuality('medium')
          }
        }}
      >
        <Suspense fallback={null}>
          <Scene />
          <Preload all />
        </Suspense>
        <PerformanceMonitor
          onDecline={() => {
            declinedAt.current = performance.now()
            const s = useStore.getState()
            if (dprRef.current > DPR_FLOOR + 0.05) {
              setDpr((d) => Math.max(DPR_FLOOR, d - 0.25))
              return
            }
            if (s.fx !== 'off') {
              s.setFx(s.fx === 'full' ? 'reduced' : 'off')
              return
            }
            const i = TIERS.indexOf(s.quality)
            if (i > 0) s.setQuality(TIERS[i - 1])
          }}
          onIncline={() => {
            if (performance.now() - declinedAt.current < 30_000) return
            const s = useStore.getState()
            if (s.fx !== 'full') {
              s.setFx(s.fx === 'off' ? 'reduced' : 'full')
              return
            }
            setDpr((d) => Math.min(dprCap(), d + 0.25))
          }}
        />
        <VisibilityPause />
        <TextModePark />
      </Canvas>

      <Hud />
      <AudioBridge />
      <BatterySaver />
      {!textMode && <Weave />}
      {!textMode && <BeaconSheet />}
      {!textMode && overture && <OvertureSkip />}
      {!textMode && !overture && <FirstHint />}
      {!textMode && !overture && <SoundHint />}
      {!textMode && <BeaconTabStops />}
      {!textMode && <Shortcuts />}
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
