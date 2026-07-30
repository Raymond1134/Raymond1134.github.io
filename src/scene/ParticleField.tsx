import { useRef, useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js'
import velocityShader from '@/shaders/sim/velocity.frag'
import positionShader from '@/shaders/sim/position.frag'
import particleVert from '@/shaders/render/particle.vert'
import particleFrag from '@/shaders/render/particle.frag'
import { site } from '@/content'
import { isCoarsePointer } from '@/device'
import { PARTICLE_ORDER } from './renderOrder'
import { useStore, PARTICLE_TEX } from '@/state/store'

/* Half-size of the cube the field wraps in, centred on the viewer. */
const BOX_HALF = 60

const FADE_START = 40
const FADE_END = 66
const BASE_OPACITY = 0.96

/* Motion slowdown. 1 is the original speed; 1.35 is ~26% slower. */
const TAU = 1.35

/* Pre-slowdown values. */
const BASE = { curlAmp: 11.0, damping: 0.965, speedScale: 22.0 } as const

const MAX_SPEED = 42.0
const COLOR_WARMTH = 0.9

const forceScale = 1 / (TAU * TAU)
const damping = Math.pow(BASE.damping, 1 / TAU)

type Variable = ReturnType<GPUComputationRenderer['addVariable']>
interface FieldAssets {
  gpu: GPUComputationRenderer
  velVar: Variable
  posVar: Variable
  geometry: THREE.BufferGeometry
  material: THREE.ShaderMaterial
}

function buildAssets(gl: THREE.WebGLRenderer, size: number): FieldAssets {
  const gpu = new GPUComputationRenderer(size, size, gl)
  const canRenderFloat = gl.getContext().getExtension('EXT_color_buffer_float') !== null
  if (!canRenderFloat || isCoarsePointer()) gpu.setDataType(THREE.HalfFloatType)

  const pos0 = gpu.createTexture()
  const vel0 = gpu.createTexture()
  seedTextures(pos0, vel0, size)

  const velVar = gpu.addVariable('textureVelocity', velocityShader, vel0)
  const posVar = gpu.addVariable('texturePosition', positionShader, pos0)

  gpu.setVariableDependencies(velVar, [velVar, posVar])
  gpu.setVariableDependencies(posVar, [velVar, posVar])

  Object.assign(velVar.material.uniforms, {
    uTime: { value: 0 },
    uDt: { value: 0 },
    uCurlFreq: { value: 0.028 },
    uCurlAmp: { value: BASE.curlAmp * forceScale },
    uDamping: { value: damping },
    uMaxSpeed: { value: MAX_SPEED },
  })

  Object.assign(posVar.material.uniforms, {
    uDt: { value: 0 },
    uCenter: { value: new THREE.Vector3() },
    uBoxHalf: { value: BOX_HALF },
  })

  const err = gpu.init()
  if (err) console.error('GPUComputationRenderer:', err)

  /* One vertex per texel; aRef is the texel each vertex reads its position from. */
  const count = size * size
  const refs = new Float32Array(count * 2)
  for (let i = 0; i < count; i++) {
    refs[i * 2 + 0] = (i % size) / size + 0.5 / size
    refs[i * 2 + 1] = Math.floor(i / size) / size + 0.5 / size
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('aRef', new THREE.BufferAttribute(refs, 2))
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4)

  const material = new THREE.ShaderMaterial({
    vertexShader: particleVert,
    fragmentShader: particleFrag,
    uniforms: {
      uPositions: { value: null },
      uVelocities: { value: null },
      uSize: { value: 1.0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector3() },
      uFadeStart: { value: FADE_START },
      uFadeEnd: { value: FADE_END },
      uOpacity: { value: BASE_OPACITY },
      uSpeedScale: { value: (BASE.speedScale / TAU) * COLOR_WARMTH },
      uFogDensity: { value: 0.005 },
      uColorCold: { value: new THREE.Color(site.meta.themeColorCold) },
      uColorMid: { value: new THREE.Color(site.meta.themeColorMid) },
      uColorHot: { value: new THREE.Color(site.meta.themeColorHot) },
      uColorAccent: { value: new THREE.Color(site.meta.themeColorAccent) },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })

  return { gpu, velVar, posVar, geometry, material }
}

function positionOnlyStep(a: FieldAssets, dt: number) {
  const gpu = a.gpu as GPUComputationRenderer & { currentTextureIndex: number }
  const cur = gpu.currentTextureIndex
  const next = cur === 0 ? 1 : 0

  const pu = a.posVar.material.uniforms
  pu.uDt.value = dt
  pu.texturePosition.value = a.posVar.renderTargets[cur].texture
  pu.textureVelocity.value = a.velVar.renderTargets[cur].texture
  gpu.doRenderTarget(a.posVar.material, a.posVar.renderTargets[next])

  gpu.renderTexture(a.velVar.renderTargets[cur].texture, a.velVar.renderTargets[next])
  gpu.currentTextureIndex = next
}

export default function ParticleField() {
  const gl = useThree((s) => s.gl)
  const quality = useStore((s) => s.quality)
  const size = PARTICLE_TEX[quality]
  const assetsRef = useRef<FieldAssets | null>(null)
  const [assets, setAssets] = useState<FieldAssets | null>(null)
  const velFrame = useRef(false)
  const velDt = useRef(0)

  useEffect(() => {
    const built = buildAssets(gl, size)
    assetsRef.current = built
    // GPU handles are an external resource this effect owns; deriving them
    // during render is exactly the useMemo arrangement StrictMode breaks.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAssets(built)
    return () => {
      built.gpu.dispose()
      built.geometry.dispose()
      built.material.dispose()
      assetsRef.current = null
    }
  }, [gl, size])

  useFrame((state, rawDt) => {
    // Null for the first frame or two, until the effect above has run.
    const a = assetsRef.current
    if (!a) return

    const dt = Math.min(rawDt, 1 / 30)
    const simTime = state.clock.elapsedTime / TAU
    const cam = state.camera.position

    const vu = a.velVar.material.uniforms
    const pu = a.posVar.material.uniforms
    const mu = a.material.uniforms

    pu.uCenter.value.copy(cam)

    mu.uTime.value = state.clock.elapsedTime
    ;(mu.uCenter.value as THREE.Vector3).copy(cam)
    // When the dynamic pixel ratio drops, point sizes must drop with it or
    // every mote bloats on the upscaled buffer.
    mu.uPixelRatio.value = state.gl.getPixelRatio()
    
    velFrame.current = !velFrame.current
    velDt.current += dt
    if (velFrame.current) {
      vu.uTime.value = simTime
      vu.uDt.value = velDt.current
      velDt.current = 0
      pu.uDt.value = dt
      a.gpu.compute()
    } else {
      positionOnlyStep(a, dt)
    }
    mu.uPositions.value = a.gpu.getCurrentRenderTarget(a.posVar).texture
    mu.uVelocities.value = a.gpu.getCurrentRenderTarget(a.velVar).texture
  })

  if (!assets) return null

  return (
    <points
      geometry={assets.geometry}
      material={assets.material}
      frustumCulled={false}
      renderOrder={PARTICLE_ORDER}
    />
  )
}

/** Uniform through the wrap box, since the field has no centre of its own. */
function seedTextures(pos: THREE.DataTexture, vel: THREE.DataTexture, size: number) {
  const p = pos.image.data as Float32Array
  const v = vel.image.data as Float32Array
  const count = size * size

  for (let i = 0; i < count; i++) {
    const i4 = i * 4

    p[i4 + 0] = (Math.random() * 2 - 1) * BOX_HALF
    p[i4 + 1] = (Math.random() * 2 - 1) * BOX_HALF
    p[i4 + 2] = (Math.random() * 2 - 1) * BOX_HALF
    p[i4 + 3] = 1

    v[i4 + 0] = (Math.random() - 0.5) * 2
    v[i4 + 1] = (Math.random() - 0.5) * 2
    v[i4 + 2] = (Math.random() - 0.5) * 2
    v[i4 + 3] = Math.random()
  }
}
