import { useRef, useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js'
import velocityShader from '@/shaders/sim/velocity.frag'
import positionShader from '@/shaders/sim/position.frag'
import particleVert from '@/shaders/render/particle.vert'
import particleFrag from '@/shaders/render/particle.frag'
import { site } from '@/content'
import { PARTICLE_ORDER } from './renderOrder'
import { breath } from './breath'
import { worldEvents } from './worldEvents'
import { NO_COMPOSER } from './composerPolicy'
import { CASTE, DEEP } from './lightPyramid'
import { BEACON_DEFAULT_COLOR } from './beacons/palette'
import { input } from '@/input/input'
import { LAMBDA } from '@/motion/tokens'
import { useStore, PARTICLE_TEX, TRAVEL } from '@/state/store'
import type { Quality } from '@/state/store'

const BOX_HALF = 60

const FADE_START = 40
const FADE_END = 66
const BASE_OPACITY = 0.8
const TAU = 1.35
const BASE = { curlAmp: 22.0, damping: 0.93, speedScale: 22.0 } as const

const CALM = useStore.getState().reducedMotion
const CALM_K = CALM ? 0.35 : 1
const MAX_SPEED = CALM ? 10.0 : 42.0
const COLOR_WARMTH = 1.3
const CONDENSE = 34.0
const SIZE_TIER: Record<Quality, number> = { low: 1.35, medium: 1.3, high: 1.2, ultra: 1.0 }
const LIGHT_RADIUS = 30

const WAKE_DEPTH = 28
const WAKE_CALM = CALM ? 0.35 : 1

const forceScale = 1 / (TAU * TAU)
const damping = Math.pow(BASE.damping, 1 / TAU)

const field = { center: new THREE.Vector3(), init: false }

const wake = { speed: 0 }

const handoff: {
  claimable: FieldAssets | null
  timer: ReturnType<typeof setTimeout> | null
  dying: FieldAssets | null
} = { claimable: null, timer: null, dying: null }

const tmpV = new THREE.Vector3()
const rayV = new THREE.Vector3()
const viewV = new THREE.Vector3()
const bufV = new THREE.Vector2()

type Variable = ReturnType<GPUComputationRenderer['addVariable']>
interface Hearth {
  pos: THREE.Vector3
  col: THREE.Color
}
interface FieldAssets {
  gpu: GPUComputationRenderer
  velVar: Variable
  posVar: Variable
  geometry: THREE.BufferGeometry
  material: THREE.ShaderMaterial
  posIdx: number
  velIdx: number

  hearths: Hearth[]
  lightPos: THREE.Vector4[]
  lightCol: THREE.Color[]
}

function disposeAssets(a: FieldAssets) {
  a.gpu.dispose()
  a.geometry.dispose()
  a.material.dispose()
}

function buildAssets(gl: THREE.WebGLRenderer, size: number, opacity: number): FieldAssets {
  const gpu = new GPUComputationRenderer(size, size, gl)

  const canRenderFloat = gl.getContext().getExtension('EXT_color_buffer_float') !== null
  if (!canRenderFloat) gpu.setDataType(THREE.HalfFloatType)

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
    uCurlAmp: { value: BASE.curlAmp * CALM_K * forceScale },
    uDamping: { value: damping },
    uMaxSpeed: { value: MAX_SPEED },
    uCondense: { value: CONDENSE * forceScale },
    uTravelDir: { value: new THREE.Vector3() },
    uTravelBoost: { value: 0 },
    uBreath: { value: 0.5 },
    uPointer: { value: new THREE.Vector4(0, 0, 0, 0) },
    uViewDir: { value: new THREE.Vector3(0, 0, -1) },
    uPulseOrigin: { value: new THREE.Vector3() },
    uPulseRadius: { value: -1e3 },
    uPulseBand: { value: 8 },
    uPulseForce: { value: 0 },
    uAttract: { value: new THREE.Vector4(0, 0, 0, 0) },
  })

  Object.assign(posVar.material.uniforms, {
    uDt: { value: 0 },
    uCenter: { value: new THREE.Vector3() },
    uBoxHalf: { value: BOX_HALF },
  })

  const err = gpu.init()
  if (err) console.error('GPUComputationRenderer:', err)

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

  const hearths: Hearth[] = [...useStore.getState().graph.nodes.values()].map((n) => ({
    pos: n.worldPosition,
    col: new THREE.Color(n.color ?? BEACON_DEFAULT_COLOR),
  }))
  const lightPos = Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 1e6, LIGHT_RADIUS))
  const lightCol = Array.from({ length: 6 }, () => new THREE.Color(0, 0, 0))

  const material = new THREE.ShaderMaterial({
    vertexShader: particleVert,
    fragmentShader: particleFrag,
    defines: { PHONE_GRADE: NO_COMPOSER ? 1 : 0 },
    uniforms: {
      uPositions: { value: null },
      uVelocities: { value: null },
      uSize: { value: 1.0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector3() },
      uFadeStart: { value: FADE_START },
      uFadeEnd: { value: FADE_END },
      uOpacity: { value: opacity },
      uSpeedScale: { value: (BASE.speedScale / TAU) * COLOR_WARMTH * CALM_K },
      uFogDensity: { value: 0.01 },
      uExposure: { value: 1 },
      uSeaScale: { value: NO_COMPOSER ? CASTE.phoneSea : CASTE.seaTrim },
      uDeepColor: { value: new THREE.Color(DEEP) },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uLights: { value: lightPos },
      uLightCols: { value: lightCol },
      uReveal: { value: 1 },
      uRevealOrigin: { value: new THREE.Vector3() },
      uPulseOrigin: { value: new THREE.Vector3() },
      uPulseRadius: { value: -1e3 },
      uPulseBand: { value: 8 },
      uPulseGlow: { value: 0 },
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

  return { gpu, velVar, posVar, geometry, material, posIdx: 0, velIdx: 0, hearths, lightPos, lightCol }
}

function step(a: FieldAssets, dt: number, doVel: boolean) {
  if (doVel) {
    const next = 1 - a.velIdx
    const vu = a.velVar.material.uniforms
    vu.texturePosition.value = a.posVar.renderTargets[a.posIdx].texture
    vu.textureVelocity.value = a.velVar.renderTargets[a.velIdx].texture
    a.gpu.doRenderTarget(a.velVar.material, a.velVar.renderTargets[next])
    a.velIdx = next
  }
  const next = 1 - a.posIdx
  const pu = a.posVar.material.uniforms
  pu.uDt.value = dt
  pu.texturePosition.value = a.posVar.renderTargets[a.posIdx].texture
  pu.textureVelocity.value = a.velVar.renderTargets[a.velIdx].texture
  a.gpu.doRenderTarget(a.posVar.material, a.posVar.renderTargets[next])
  a.posIdx = next
}

export default function ParticleField() {
  const gl = useThree((s) => s.gl)
  const quality = useStore((s) => s.quality)
  const compact = useStore((s) => s.compact)
  const size = PARTICLE_TEX[quality]
  const assetsRef = useRef<FieldAssets | null>(null)
  const [assets, setAssets] = useState<FieldAssets | null>(null)
  const [dying, setDying] = useState<FieldAssets | null>(null)
  const frame = useRef(0)
  const velDt = useRef(0)
  const travelDir = useRef(new THREE.Vector3())

  const velEvery = quality === 'low' || compact ? 3 : 2

  useEffect(() => {
    let prev: FieldAssets | null = null
    if (handoff.claimable) {
      if (handoff.timer) clearTimeout(handoff.timer)
      prev = handoff.claimable
      handoff.claimable = null
      handoff.timer = null
    }
    if (handoff.dying) {
      disposeAssets(handoff.dying)
      handoff.dying = null
    }
    handoff.dying = prev

    const built = buildAssets(gl, size, prev ? 0 : BASE_OPACITY)
    assetsRef.current = built
    setAssets(built)
    useStore.getState().setFieldReady()
    return () => {
      assetsRef.current = null
      handoff.claimable = built
      handoff.timer = setTimeout(() => {
        if (handoff.claimable === built) {
          disposeAssets(built)
          handoff.claimable = null
        }
      }, 60)
    }
  }, [gl, size])

  useFrame((state, rawDt) => {
    const a = assetsRef.current
    if (!a) return

    const dt = Math.min(rawDt, 1 / 30)
    const s = useStore.getState()
    const t = state.clock.elapsedTime
    const simTime = t / TAU
    const cam = state.camera.position

    const vu = a.velVar.material.uniforms
    const pu = a.posVar.material.uniforms
    const mu = a.material.uniforms

    if (!field.init) {
      field.center.copy(cam)
      field.init = true
    }
    const tau = s.phase === 'flight' ? 0.35 : 2.5
    field.center.lerp(cam, 1 - Math.exp(-dt / tau))
    tmpV.copy(field.center).sub(cam)
    const lag = tmpV.length()
    if (lag > 18) field.center.copy(cam).addScaledVector(tmpV, 18 / lag - 1)
    pu.uCenter.value.copy(field.center)

    mu.uTime.value = t
    mu.uExposure.value = worldEvents.grade.exposure
    ;(mu.uCenter.value as THREE.Vector3).copy(field.center)
    mu.uPixelRatio.value = state.gl.getPixelRatio()
    mu.uSize.value = SIZE_TIER[s.quality]
    state.gl.getDrawingBufferSize(bufV)
    ;(mu.uResolution.value as THREE.Vector2).copy(bufV)

    mu.uReveal.value = worldEvents.reveal
    ;(mu.uRevealOrigin.value as THREE.Vector3).copy(worldEvents.revealOrigin)

    const pl = worldEvents.pulse
    const age = pl.t0 >= 0 ? t - pl.t0 : -1
    const pulseLive = age >= 0 && age < 0.8
    ;(mu.uPulseOrigin.value as THREE.Vector3).copy(pl.origin)
    mu.uPulseRadius.value = pulseLive ? age * pl.speed : -1e3
    mu.uPulseBand.value = pl.band
    mu.uPulseGlow.value = pulseLive ? pl.glow * (1 - age / 0.8) : 0

    a.hearths.sort((x, y) => x.pos.distanceToSquared(cam) - y.pos.distanceToSquared(cam))
    for (let i = 0; i < a.lightPos.length; i++) {
      const h = a.hearths[i]
      if (!h) break
      a.lightPos[i].set(h.pos.x, h.pos.y, h.pos.z, LIGHT_RADIUS)
      a.lightCol[i].copy(h.col)
    }
    if (worldEvents.flare.id && worldEvents.flare.gain > 0.01) {
      const node = s.graph.nodes.get(worldEvents.flare.id)
      if (node) {
        const slot = a.lightPos.length - 1
        a.lightPos[slot].set(node.worldPosition.x, node.worldPosition.y, node.worldPosition.z, LIGHT_RADIUS * 1.5)
        a.lightCol[slot].copy(a.hearths[0].col)
        const hn = a.hearths.find((h) => h.pos === node.worldPosition)
        if (hn) a.lightCol[slot].copy(hn.col)
        a.lightCol[slot].multiplyScalar(worldEvents.flare.gain)
      }
    }

    const pe = worldEvents.pointer
    const ip = input.pointer
    const fresh = ip.active && performance.now() - ip.movedAt < 2000
    wake.speed += ((fresh ? ip.speed : 0) - wake.speed) * (1 - Math.exp(-dt / 0.12))
    let targetW = 0
    if (s.phase === 'idle' && !s.overtureActive && fresh) {
      targetW = THREE.MathUtils.clamp(wake.speed / 400, 0.25, 1) * WAKE_CALM
    }
    pe.w = THREE.MathUtils.damp(pe.w, targetW, targetW > pe.w ? LAMBDA.snap : LAMBDA.calm, dt)
    if (pe.w > 0.001) {
      rayV.set(ip.x, ip.y, 0.5).unproject(state.camera).sub(cam).normalize()
      pe.pos.copy(cam).addScaledVector(rayV, WAKE_DEPTH)
    }

    velDt.current += dt
    frame.current++
    const doVel = frame.current % velEvery === 0
    if (doVel) {
      vu.uTime.value = simTime
      vu.uDt.value = velDt.current
      vu.uBreath.value = breath(t)
      vu.uMaxSpeed.value = MAX_SPEED * (s.phase === 'flight' ? 2 : 1)
      ;(vu.uPointer.value as THREE.Vector4).set(pe.pos.x, pe.pos.y, pe.pos.z, pe.w)
      state.camera.getWorldDirection(viewV)
      ;(vu.uViewDir.value as THREE.Vector3).copy(viewV)
      ;(vu.uPulseOrigin.value as THREE.Vector3).copy(pl.origin)
      vu.uPulseRadius.value = pulseLive ? age * pl.speed : -1e3
      vu.uPulseBand.value = pl.band
      vu.uPulseForce.value = age >= 0 && age < 0.6 ? pl.force * (1 - age / 0.6) : 0
      const at = worldEvents.attractor
      ;(vu.uAttract.value as THREE.Vector4).set(at.pos.x, at.pos.y, at.pos.z, at.w)

      if (s.phase === 'flight' || s.phase === 'settle') {
        const cur = s.graph.nodes.get(s.currentId)
        const prev = s.previousId ? s.graph.nodes.get(s.previousId) : null
        if (cur && prev) {
          travelDir.current.copy(cur.worldPosition).sub(prev.worldPosition)
          if (travelDir.current.lengthSq() > 1e-6) travelDir.current.normalize()
        }
        ;(vu.uTravelDir.value as THREE.Vector3).copy(travelDir.current)
        const ft = THREE.MathUtils.clamp((s.travelClock - TRAVEL.turn) / TRAVEL.flight, 0, 1)
        vu.uTravelBoost.value = Math.pow(Math.sin(ft * Math.PI), 1.5) * 26
      } else {
        vu.uTravelBoost.value = 0
      }
      velDt.current = 0
    }
    step(a, dt, doVel)

    mu.uPositions.value = a.posVar.renderTargets[a.posIdx].texture
    mu.uVelocities.value = a.velVar.renderTargets[a.velIdx].texture

    if (handoff.dying && dying !== handoff.dying) setDying(handoff.dying)
    if (handoff.dying) {
      const du = handoff.dying.material.uniforms
      du.uOpacity.value = THREE.MathUtils.damp(du.uOpacity.value as number, 0, LAMBDA.settle, dt)
      mu.uOpacity.value = THREE.MathUtils.damp(mu.uOpacity.value as number, BASE_OPACITY, LAMBDA.settle, dt)
      if ((du.uOpacity.value as number) < 0.02) {
        disposeAssets(handoff.dying)
        handoff.dying = null
        setDying(null)
        mu.uOpacity.value = BASE_OPACITY
      }
    }
  })

  if (!assets) return null

  return (
    <>
      <points
        geometry={assets.geometry}
        material={assets.material}
        frustumCulled={false}
        renderOrder={PARTICLE_ORDER}
      />
      {dying && (
        <points
          geometry={dying.geometry}
          material={dying.material}
          frustumCulled={false}
          renderOrder={PARTICLE_ORDER}
        />
      )}
    </>
  )
}

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
