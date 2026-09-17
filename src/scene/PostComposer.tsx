import { EffectComposer, Bloom, Noise } from '@react-three/postprocessing'
import { BlendFunction, BloomEffect, EffectPass } from 'postprocessing'
import type { EffectComposer as ComposerImpl } from 'postprocessing'
import * as THREE from 'three'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useStore, travelProgress, TRAVEL } from '@/state/store'
import { swellTight } from '@/motion/tokens'
import { breath } from './breath'
import { worldEvents } from './worldEvents'
import { BLOOM_KNEE_TIGHT, BLOOM_KNEE_WIDE } from './lightPyramid'
import { AetherGradeEffect } from './post/AetherGradeEffect'

const BLOOM = {
  low: { base: 0.6, swell: 0.25, radius: 0.7 },
  medium: { base: 0.6, swell: 0.25, radius: 0.7 },
  high: { base: 0.7, swell: 0.35, radius: 0.6 },
  ultra: { base: 0.75, swell: 0.35, radius: 0.7 },
} as const

const GLARE = { low: 0.025, medium: 0.025, high: 0.030, ultra: 0.040 } as const
const GLARE_RES = 0.5
const GLARE_RUSH = 0.9

const HOLD = { low: 0.58, medium: 0.58, high: 0.62, ultra: 0.66 } as const

const CALM = useStore.getState().reducedMotion
const GLARE_LEVELS = useStore.getState().quality === 'ultra' ? 9 : 8
const HOLD_CALM = CALM ? 0.04 : 0

const flightRush = (s: { phase: string; travelClock: number }) =>
  CALM || s.phase !== 'flight'
    ? 0
    : swellTight(THREE.MathUtils.clamp((s.travelClock - TRAVEL.turn) / TRAVEL.flight, 0, 1))

const tuneGrade = (fx: AetherGradeEffect, exposure: number, hold: number, rush: number) => {
  fx.exposure = exposure
  fx.hold = hold
  fx.rush = rush
}

export default function PostComposer() {
  const composer = useRef<ComposerImpl>(null)
  const bloom = useRef<BloomEffect | null>(null)
  const glare = useRef<BloomEffect | null>(null)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)

  const grade = useMemo(
    () => new AetherGradeEffect(HOLD[useStore.getState().quality] + HOLD_CALM, CALM ? 1.3 : 1.15),
    [],
  )
  useEffect(() => () => grade.dispose(), [grade])

  useFrame((state) => {
    const s = useStore.getState()
    const rush = flightRush(s)
    tuneGrade(grade, worldEvents.grade.exposure, HOLD[s.quality] + HOLD_CALM, rush)
    if (!bloom.current) return
    const { base, swell, radius } = BLOOM[s.quality]
    bloom.current.mipmapBlurPass.radius = radius
    bloom.current.intensity =
      (base + Math.sin(travelProgress(s) * Math.PI) * swell) *
      (0.96 + 0.08 * breath(state.clock.elapsedTime)) *
      worldEvents.grade.glare
    if (glare.current) {
      glare.current.intensity = GLARE[s.quality] * worldEvents.grade.glare * (1 + GLARE_RUSH * rush)
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
    if (glare.current) glare.current.luminancePass.resolution.scale = GLARE_RES
    return () => {
      bloom.current = null
      glare.current = null
      for (const p of passes) p.fullscreenMaterial.dispose()
    }
  }, [])

  const effects = useMemo(
    () => (
      <>
        <Bloom
          intensity={BLOOM.high.base}
          luminanceThreshold={BLOOM_KNEE_TIGHT}
          luminanceSmoothing={0.35}
          mipmapBlur
          radius={BLOOM.high.radius}
        />
        <Bloom
          intensity={GLARE.high}
          luminanceThreshold={BLOOM_KNEE_WIDE}
          luminanceSmoothing={0.6}
          mipmapBlur
          radius={0.94}
          levels={GLARE_LEVELS}
        />
        <primitive object={grade} dispose={null} />
        {!CALM && <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.08} />}
      </>
    ),
    [grade],
  )

  return (
    <EffectComposer ref={composer} frameBufferType={THREE.HalfFloatType} multisampling={0}>
      {effects}
    </EffectComposer>
  )
}
