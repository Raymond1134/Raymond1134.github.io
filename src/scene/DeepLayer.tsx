import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import deepVert from '@/shaders/render/deep.vert'
import deepFrag from '@/shaders/render/deep.frag'
import { useStore } from '@/state/store'
import type { Quality } from '@/state/store'
import { breath } from './breath'
import { worldEvents } from './worldEvents'
import { LUM, DEEP } from './lightPyramid'
import { DEEP_ORDER } from './renderOrder'
import { NO_COMPOSER } from './composerPolicy'

const COUNT: Record<Quality, number> = { low: 800, medium: 1200, high: 2000, ultra: 3000 }

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export default function DeepLayer() {
  const quality = useStore((s) => s.quality)
  const compact = useStore((s) => s.compact)
  const calm = useStore((s) => s.reducedMotion)
  const mat = useRef<THREE.ShaderMaterial>(null!)
  const count = COUNT[compact ? 'low' : quality]

  const geometry = useMemo(() => {
    const rand = mulberry32(1134)
    const nodes = [...useStore.getState().graph.nodes.values()]
    const centroid = new THREE.Vector3()
    for (const n of nodes) centroid.add(n.worldPosition)
    centroid.divideScalar(Math.max(1, nodes.length))

    const risers = Math.round(count * 0.22)
    const total = count + risers
    const pos = new Float32Array(total * 3)
    const size = new Float32Array(total)
    const seed = new Float32Array(total)
    const role = new Float32Array(total)
    const col = new Float32Array(total * 3)
    const deep = new THREE.Color(DEEP)
    const lift = new THREE.Color('#2b3a6b')
    const spark = new THREE.Color('#3ec9bc')
    const c = new THREE.Color()
    const v = new THREE.Vector3()

    for (let i = 0; i < total; i++) {
      if (i >= count) {
        v.set((rand() * 2 - 1) * 430, -300, -170 + (rand() * 2 - 1) * 430)
        role[i] = 1
        size[i] = 0.5 + 0.6 * rand()
        c.copy(deep).lerp(spark, 0.5 + 0.4 * rand())
      } else {
        const clustered = rand() < 0.3 && nodes.length > 0
        if (clustered) {
          const n = nodes[(rand() * nodes.length) | 0]
          sphereDir(rand, v).multiplyScalar(8 + 17 * rand())
          v.add(n.worldPosition)
        } else {
          const r = Math.cbrt(THREE.MathUtils.lerp(80 ** 3, 360 ** 3, rand()))
          sphereDir(rand, v).multiplyScalar(r).add(centroid)
        }
        role[i] = 0
        size[i] = 0.35 + 0.55 * rand()
        c.copy(deep).lerp(lift, rand() * 0.7)
      }
      pos[i * 3 + 0] = v.x
      pos[i * 3 + 1] = v.y
      pos[i * 3 + 2] = v.z
      seed[i] = rand() * 100
      col[i * 3 + 0] = c.r
      col[i * 3 + 1] = c.g
      col[i * 3 + 2] = c.b
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    g.setAttribute('aRole', new THREE.BufferAttribute(role, 1))
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3))
    g.boundingSphere = new THREE.Sphere(centroid.clone(), 800)
    return g
  }, [count])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: deepVert,
        fragmentShader: deepFrag,
        defines: { PHONE_GRADE: NO_COMPOSER ? 1 : 0 },
        uniforms: {
          uTime: { value: 0 },
          uExposure: { value: 1 },
          uBreath: { value: 0.5 },
          uPixelRatio: { value: Math.min(typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1, 2) },
          uDrift: { value: calm ? 0 : 1 },
          uReveal: { value: 1 },
          uRevealOrigin: { value: new THREE.Vector3() },
          uAlpha: { value: LUM.deepSnow },
        },
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [calm],
  )
  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => {
    const u = mat.current?.uniforms
    if (!u) return
    u.uTime.value = state.clock.elapsedTime
    u.uBreath.value = breath(state.clock.elapsedTime)
    u.uExposure.value = worldEvents.grade.exposure
    u.uPixelRatio.value = state.gl.getPixelRatio()
    u.uReveal.value = worldEvents.reveal
    ;(u.uRevealOrigin.value as THREE.Vector3).copy(worldEvents.revealOrigin)
  })

  return (
    <points geometry={geometry} frustumCulled={false} renderOrder={DEEP_ORDER}>
      <primitive object={material} attach="material" ref={mat} />
    </points>
  )
}

function sphereDir(rand: () => number, out: THREE.Vector3) {
  const z = rand() * 2 - 1
  const a = rand() * Math.PI * 2
  const r = Math.sqrt(Math.max(0, 1 - z * z))
  return out.set(r * Math.cos(a), r * Math.sin(a), z)
}
