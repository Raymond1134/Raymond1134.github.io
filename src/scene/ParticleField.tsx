import { useMemo, useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js'
import velocityShader from '@/shaders/sim/velocity.frag'
import positionShader from '@/shaders/sim/position.frag'
import particleVert from '@/shaders/render/particle.vert'
import particleFrag from '@/shaders/render/particle.frag'
import { site } from '@/content'
import { hash01 } from '@/content/layout'
import { isCoarsePointer } from '@/device'
import {
  useStore, PARTICLE_TEX, implodeAmount, getCurrentNode, getPreviousNode, TRAVEL,
} from '@/state/store'

const SHELL_RADIUS = 46
const BASE_OPACITY = 0.72
const tmpColor = new THREE.Color()
const homeVec = new THREE.Vector3()

const noiseOffsets = new Map<string, THREE.Vector3>()
function noiseOffsetFor(id: string): THREE.Vector3 {
  let v = noiseOffsets.get(id)
  if (!v) {
    v = new THREE.Vector3(hash01(id, 11), hash01(id, 22), hash01(id, 33)).multiplyScalar(64)
    noiseOffsets.set(id, v)
  }
  return v
}

export default function ParticleField() {
  const gl = useThree((s) => s.gl)
  const quality = useStore((s) => s.quality)
  const size = PARTICLE_TEX[quality]
  const points = useRef<THREE.Points>(null!)

  const sim = useMemo(() => {
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
      uHome: { value: new THREE.Vector3() },
      uFocus: { value: new THREE.Vector3() },
      uImplode: { value: 0 },
      uShellRadius: { value: SHELL_RADIUS },
      uShellSoftness: { value: 0.55 },
      uNoiseOffset: { value: new THREE.Vector3() },
      uCurlFreq: { value: 0.028 },
      uCurlAmp: { value: 11.0 },
      uSwirl: { value: 4.5 },
      uDamping: { value: 0.965 },
      uMaxSpeed: { value: 42.0 },
    })

    Object.assign(posVar.material.uniforms, {
      uTime: { value: 0 },
      uDt: { value: 0 },
      uHome: { value: new THREE.Vector3() },
      uShellRadius: { value: SHELL_RADIUS },
      uLifeScale: { value: 1 },
      uRespawn: { value: 1 },
    })

    const err = gpu.init()
    if (err) console.error('GPUComputationRenderer:', err)

    return { gpu, velVar, posVar }
  }, [gl, size])

  useEffect(() => () => sim.gpu.dispose(), [sim])

  const geometry = useMemo(() => {
    const count = size * size
    const refs = new Float32Array(count * 2)
    for (let i = 0; i < count; i++) {
      refs[i * 2 + 0] = (i % size) / size + 0.5 / size
      refs[i * 2 + 1] = Math.floor(i / size) / size + 0.5 / size
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('aRef', new THREE.BufferAttribute(refs, 2))
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4)
    return g
  }, [size])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: particleVert,
        fragmentShader: particleFrag,
        uniforms: {
          uPositions: { value: null },
          uVelocities: { value: null },
          uSize: { value: 1.0 },
          uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
          uImplode: { value: 0 },
          uTime: { value: 0 },
          uOpacity: { value: BASE_OPACITY },
          uSpeedScale: { value: 22.0 },
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
      }),
    [],
  )

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const s = useStore.getState()
    const node = getCurrentNode()
    const prev = getPreviousNode()
    const implode = implodeAmount(s.phase, s.travelClock)

    if (s.phase === 'disperse' && prev) {
      const t = (s.travelClock - TRAVEL.gather - TRAVEL.veil) / TRAVEL.disperse
      homeVec.copy(prev.worldPosition).lerp(node.worldPosition, t * t * (3 - 2 * t))
    }
    else homeVec.copy(node.worldPosition)

    const vu = sim.velVar.material.uniforms
    const pu = sim.posVar.material.uniforms

    vu.uTime.value = state.clock.elapsedTime
    vu.uDt.value = dt
    vu.uImplode.value = implode
    vu.uHome.value.copy(homeVec)
    vu.uFocus.value.copy(state.camera.position)
    vu.uNoiseOffset.value.copy(noiseOffsetFor(s.currentId))
    vu.uShellRadius.value = SHELL_RADIUS * (1 - implode * 0.55)

    pu.uTime.value = state.clock.elapsedTime
    pu.uDt.value = dt
    pu.uHome.value.copy(homeVec)
    pu.uShellRadius.value = vu.uShellRadius.value
    pu.uRespawn.value = s.phase === 'gather' || s.phase === 'veil' ? 0 : 1
    pu.uLifeScale.value = s.phase === 'disperse' ? 2.2 : 1.0

    // Tint the swarm toward the current beacon's colour.
    tmpColor.set(node.color ?? site.meta.themeColorMid)
    ;(material.uniforms.uColorMid.value as THREE.Color).lerp(tmpColor, 1 - Math.pow(0.06, dt))
    material.uniforms.uImplode.value = implode
    material.uniforms.uTime.value = state.clock.elapsedTime
    material.uniforms.uOpacity.value = BASE_OPACITY * (1.0 + implode * 0.9)

    sim.gpu.compute()
    material.uniforms.uPositions.value = sim.gpu.getCurrentRenderTarget(sim.posVar).texture
    material.uniforms.uVelocities.value = sim.gpu.getCurrentRenderTarget(sim.velVar).texture
  })

  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} />
}

function seedTextures(pos: THREE.DataTexture, vel: THREE.DataTexture, size: number) {
  const p = pos.image.data as Float32Array
  const v = vel.image.data as Float32Array
  const count = size * size

  for (let i = 0; i < count; i++) {
    const i4 = i * 4
    const u = Math.random() * 2 - 1
    const theta = Math.random() * Math.PI * 2
    const r = Math.sqrt(1 - u * u)
    const radius = SHELL_RADIUS * (0.4 + Math.random() * 1.0)

    p[i4 + 0] = Math.cos(theta) * r * radius
    p[i4 + 1] = u * radius
    p[i4 + 2] = Math.sin(theta) * r * radius
    p[i4 + 3] = Math.random()

    v[i4 + 0] = (Math.random() - 0.5) * 2
    v[i4 + 1] = (Math.random() - 0.5) * 2
    v[i4 + 2] = (Math.random() - 0.5) * 2
    v[i4 + 3] = Math.random()
  }
}