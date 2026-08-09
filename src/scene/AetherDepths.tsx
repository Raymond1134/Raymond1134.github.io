import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import depthsVert from '@/shaders/env/depths.vert'
import depthsFrag from '@/shaders/env/depths.frag'
import { site } from '@/content'
import { useStore, travelProgress } from '@/state/store'
import { breath } from './breath'
import { worldEvents } from './worldEvents'
import { LUM, DOME_STOPS } from './lightPyramid'
import { DEPTHS_ORDER } from './renderOrder'
import { NO_COMPOSER } from './composerPolicy'
import { BEACON_DEFAULT_COLOR } from './beacons/palette'

const DITHER_K = NO_COMPOSER ? 1.45 : 1.15

const FALLOFF = 0.006

const TIER = {
  low: { oct: 0, warp: 0, lights: 2, bend: 0 },
  medium: { oct: 1, warp: 0, lights: 6, bend: 0.04 },
  high: { oct: 2, warp: 1, lights: 6, bend: 0.055 },
  ultra: { oct: 2, warp: 1, lights: 6, bend: 0.062 },
} as const

const CALM = useStore.getState().reducedMotion

interface Aureole {
  id: string
  pos: THREE.Vector3
  col: THREE.Color
  dir: THREE.Vector3
  w: number
  own: number
}

const hot = new THREE.Color(site.meta.themeColorHot)
const LIGHTS: Aureole[] = [...useStore.getState().graph.nodes.values()].map((n) => ({
  id: n.id,
  pos: n.worldPosition,
  col: new THREE.Color(n.color ?? BEACON_DEFAULT_COLOR).lerp(hot, 0.15),
  dir: new THREE.Vector3(),
  w: 0,
  own: 1,
}))

export default function AetherDepths() {
  const mesh = useRef<THREE.Mesh>(null!)
  const quality = useStore((s) => s.quality)
  const tier = TIER[quality]

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
    )
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5)
    return g
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(() => {
    const L = tier.lights
    return new THREE.ShaderMaterial({
      vertexShader: depthsVert,
      fragmentShader: depthsFrag,
      defines: {
        DEPTHS_OCT: tier.oct,
        DEPTHS_WARP: tier.warp,
        DEPTHS_LIGHTS: L,
        DEPTHS_BEND: tier.bend > 0 ? 1 : 0,
        PHONE_GRADE: NO_COMPOSER ? 1 : 0,
        DITHER_K,
      },
      uniforms: {
        uProjInv: { value: new THREE.Matrix4() },
        uViewInv: { value: new THREE.Matrix4() },
        uNadir: { value: DOME_STOPS.nadir },
        uMid: { value: DOME_STOPS.mid },
        uZenith: { value: DOME_STOPS.zenith },
        uVeilCold: { value: new THREE.Color(site.meta.themeColorCold) },
        uVeilMid: { value: new THREE.Color(site.meta.themeColorMid) },
        uTime: { value: 0 },
        uBreath: { value: 0.5 },
        uDomeGain: { value: 1 },
        uVeils: { value: LUM.veils },
        uEnvAmbientClamp: { value: LUM.envAmbientClamp },
        uEnvSourcedClamp: { value: LUM.envSourcedClamp },
        uExposure: { value: 1 },
        uAuroraDir: { value: new THREE.Vector3(0, 1, 0) },
        uAuroraGain: { value: 0 },
        uBendAmp: { value: tier.bend },
        uBendT: { value: 40 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uLightDir: { value: Array.from({ length: L }, () => new THREE.Vector3()) },
        uLightCol: { value: Array.from({ length: L }, () => new THREE.Color()) },
        uLightW: { value: new Array(L).fill(0) },
      },
      depthTest: false,
      depthWrite: false,
    })
  }, [tier])
  useEffect(() => () => material.dispose(), [material])

  useFrame((state, dt) => {
    const cam = state.camera
    const m = mesh.current?.material as THREE.ShaderMaterial | undefined
    if (!m) return
    const u = m.uniforms
    const s = useStore.getState()
    const t = state.clock.elapsedTime
    const k = 1 - Math.pow(0.02, Math.min(dt, 1 / 30))

    cam.updateMatrixWorld()
    ;(u.uProjInv.value as THREE.Matrix4).copy(cam.projectionMatrixInverse)
    ;(u.uViewInv.value as THREE.Matrix4).copy(cam.matrixWorld)
    u.uTime.value = t
    u.uBreath.value = breath(t)
    u.uDomeGain.value = worldEvents.domeGain
    u.uExposure.value = worldEvents.grade.exposure
    ;(u.uAuroraDir.value as THREE.Vector3).copy(worldEvents.aurora.dir)
    u.uAuroraGain.value = worldEvents.aurora.gain
    u.uBendAmp.value = tier.bend * (1 + 0.9 * worldEvents.grade.caustic)
    if (!CALM) u.uBendT.value = t
    state.gl.getDrawingBufferSize(u.uResolution.value as THREE.Vector2)

    const goalId = s.phase === 'turn' ? (s.pendingId ?? s.currentId) : s.currentId
    for (const l of LIGHTS) {
      const dist = cam.position.distanceTo(l.pos)
      l.dir.copy(l.pos).sub(cam.position).normalize()
      let target = l.id === goalId ? 1.25 + 0.75 * Math.sin(travelProgress(s) * Math.PI) : 1
      if (l.id === worldEvents.flare.id) target *= 1 + 0.5 * worldEvents.flare.gain
      l.own += (target - l.own) * k
      l.w = LUM.aureole * Math.exp(-dist * FALLOFF) * l.own
    }
    LIGHTS.sort((a, b) => b.w - a.w)

    const L = (u.uLightW.value as number[]).length
    for (let i = 0; i < L; i++) {
      ;(u.uLightDir.value as THREE.Vector3[])[i].copy(LIGHTS[i].dir)
      ;(u.uLightCol.value as THREE.Color[])[i].copy(LIGHTS[i].col)
      ;(u.uLightW.value as number[])[i] = LIGHTS[i].w
    }
  })

  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={DEPTHS_ORDER}
    />
  )
}
