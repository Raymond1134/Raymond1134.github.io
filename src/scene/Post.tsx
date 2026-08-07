import { EffectComposer, Bloom, Noise } from '@react-three/postprocessing'
import { BlendFunction, BloomEffect, EffectPass } from 'postprocessing'
import type { EffectComposer as ComposerImpl } from 'postprocessing'
import * as THREE from 'three'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useStore, travelProgress } from '@/state/store'
import { breath } from './breath'
import { worldEvents } from './worldEvents'
import { BLOOM_KNEE_TIGHT, BLOOM_KNEE_WIDE } from './lightPyramid'
import { NO_COMPOSER } from './composerPolicy'
import { AetherGradeEffect } from './post/AetherGradeEffect'

const BLOOM = {
  low: { base: 0.6, swell: 0.25, radius: 0.7 },
  medium: { base: 0.6, swell: 0.25, radius: 0.7 },
  high: { base: 0.7, swell: 0.35, radius: 0.6 },
  ultra: { base: 0.75, swell: 0.35, radius: 0.7 },
} as const

const GLARE = { medium: 0.025, high: 0.030, ultra: 0.040 } as const

const CALM = useStore.getState().reducedMotion

const applyExposure = (fx: AetherGradeEffect, exposure: number) => {
  fx.exposure = exposure
}

export default function Post() {
  return NO_COMPOSER ? null : <Composer />
}

function Composer() {
  const quality = useStore((s) => s.quality)
  const lite = quality === 'low' || quality === 'medium'
  const ultra = quality === 'ultra'
  const composer = useRef<ComposerImpl>(null)
  const bloom = useRef<BloomEffect | null>(null)
  const glare = useRef<BloomEffect | null>(null)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)

  const grade = useMemo(() => {
    const hold = (lite ? 0.58 : ultra ? 0.66 : 0.62) + (CALM ? 0.04 : 0)
    return new AetherGradeEffect(hold, CALM ? 1.3 : 1.15)
  }, [lite, ultra])
  useEffect(() => () => grade.dispose(), [grade])

  useFrame((state) => {
    applyExposure(grade, worldEvents.grade.exposure)
    if (!bloom.current) return
    const s = useStore.getState()
    const { base, swell } = BLOOM[s.quality]
    bloom.current.intensity =
      (base + Math.sin(travelProgress(s) * Math.PI) * swell) *
      (0.96 + 0.08 * breath(state.clock.elapsedTime)) *
      worldEvents.grade.glare
    if (glare.current) {
      const g = lite ? GLARE.medium : ultra ? GLARE.ultra : GLARE.high
      glare.current.intensity = g * worldEvents.grade.glare
    }
  })

  useEffect(() => {
    composer.current?.setSize(size.width, size.height)
  }, [dpr, size])

  useEffect(() => {
    const passes = (composer.current?.passes ?? []).filter(
      (p): p is EffectPass => p instanceof EffectPass,
    )
    const blooms = passes
      .flatMap((p) => (p as unknown as { effects: unknown[] }).effects)
      .filter((e): e is BloomEffect => e instanceof BloomEffect)
    if (import.meta.env.DEV && blooms.length !== 2) {
      const all = passes.flatMap((p) => (p as unknown as { effects: { name: string }[] }).effects)
      console.error(
        `Post: expected 2 BloomEffects, found ${blooms.length}.`,
        'passes:', passes.length,
        'effects:', all.map((e) => e?.name),
      )
    }
    bloom.current = blooms[0] ?? null
    glare.current = blooms[1] ?? null
    return () => {
      bloom.current = null
      glare.current = null
      for (const p of passes) p.fullscreenMaterial.dispose()
    }
  }, [lite, ultra])

  const effects = useMemo(
    () => (
      <>
        <Bloom
          intensity={lite ? BLOOM.medium.base : ultra ? BLOOM.ultra.base : BLOOM.high.base}
          luminanceThreshold={BLOOM_KNEE_TIGHT}
          luminanceSmoothing={0.35}
          mipmapBlur
          radius={lite ? BLOOM.medium.radius : ultra ? BLOOM.ultra.radius : BLOOM.high.radius}
        />
        <Bloom
          intensity={GLARE.high}
          luminanceThreshold={BLOOM_KNEE_WIDE}
          luminanceSmoothing={0.6}
          mipmapBlur
          radius={0.94}
          levels={ultra ? 9 : 8}
        />
        {!CALM && <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.08} />}
        <primitive object={grade} dispose={null} />
      </>
    ),
    [lite, ultra, grade],
  )

  return (
    <EffectComposer ref={composer} frameBufferType={THREE.HalfFloatType} multisampling={0}>
      {effects}
    </EffectComposer>
  )
}
