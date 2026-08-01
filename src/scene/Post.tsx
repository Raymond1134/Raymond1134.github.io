import { EffectComposer, Bloom, Noise, Vignette, ToneMapping } from '@react-three/postprocessing'
import { BlendFunction, BloomEffect, EffectPass, ToneMappingMode } from 'postprocessing'
import type { EffectComposer as ComposerImpl } from 'postprocessing'
import * as THREE from 'three'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useStore, travelProgress } from '@/state/store'
import { breath } from './breath'
import { BLOOM_KNEE } from './lightPyramid'
import { NO_COMPOSER } from './composerPolicy'

const FULL = { base: 0.6, swell: 0.35 }
const MED = { base: 0.55, swell: 0.25 }

export default function Post() {
  return NO_COMPOSER ? null : <Composer />
}

function Composer() {
  const quality = useStore((s) => s.quality)
  const lite = quality === 'low' || quality === 'medium'
  const composer = useRef<ComposerImpl>(null)
  const bloom = useRef<BloomEffect | null>(null)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)

  useFrame((state) => {
    if (!bloom.current) return
    const s = useStore.getState()
    const { base, swell } = s.quality === 'low' || s.quality === 'medium' ? MED : FULL
    bloom.current.intensity =
      (base + Math.sin(travelProgress(s) * Math.PI) * swell) *
      (0.96 + 0.08 * breath(state.clock.elapsedTime))
  })

  // PerformanceMonitor's dpr steps resize the canvas but never change `size`
  // identity, so the library's own [composer, size] resize effect misses them
  // and every pass keeps rendering at the stale dpr. setSize re-reads the
  // drawing buffer (css × pixelRatio at call time) and re-bases the chain.
  useEffect(() => {
    composer.current?.setSize(size.width, size.height)
  }, [dpr, size])

  // No ref on <Bloom>: React 19 delivers ref as a plain prop and wrapEffect
  // keys its effect memo on JSON.stringify(props), so a live effect in the ref
  // would rebuild the BloomEffect every render. Fish it out of the passes.
  // Cleanup: EffectComposer only removePass()es replaced passes; dispose their
  // materials (never the effects — r3f still owns those) or three's shader
  // cache retains every stranded EffectMaterial for the context's life.
  useEffect(() => {
    const passes = (composer.current?.passes ?? []).filter(
      (p): p is EffectPass => p instanceof EffectPass,
    )
    bloom.current =
      passes
        .flatMap((p) => (p as unknown as { effects: unknown[] }).effects)
        .find((e): e is BloomEffect => e instanceof BloomEffect) ?? null
    return () => {
      bloom.current = null
      for (const p of passes) p.fullscreenMaterial.dispose()
    }
  }, [lite])

  // Children memoized per branch: EffectComposer rebuilds (and strands) its
  // EffectPasses whenever children identity changes — only branch flips earn it.
  const effects = useMemo(
    () =>
      lite ? (
        <>
          <Bloom intensity={MED.base} luminanceThreshold={0.9}
                 luminanceSmoothing={0.3} mipmapBlur radius={0.7} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </>
      ) : (
        <>
          {/* mipmapBlur is essential — the classic kernel reads as cheap blur,
             not glow. (Its mip chain self-downsamples; resolutionScale is a
             no-op for it in this postprocessing version.) */}
          <Bloom intensity={FULL.base} luminanceThreshold={BLOOM_KNEE}
                 luminanceSmoothing={0.3} mipmapBlur radius={0.6} />
          <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.08} />
          <Vignette eskil={false} offset={0.24} darkness={0.6} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </>
      ),
    [lite],
  )

  return (
    <EffectComposer ref={composer} frameBufferType={THREE.HalfFloatType} multisampling={0}>
      {effects}
    </EffectComposer>
  )
}
