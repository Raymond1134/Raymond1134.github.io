import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import depthsVert from '@/shaders/env/depths.vert'
import depthsFrag from '@/shaders/env/depths.frag'
import { site } from '@/content'
import { useStore, travelProgress } from '@/state/store'
import { breath } from './breath'
import { DEPTHS_ORDER } from './renderOrder'
import { NO_COMPOSER } from './composerPolicy'
import { BEACON_DEFAULT_COLOR } from './beacons/palette'

const NADIR = '#040310'
const MID = '#0a0e22'
const ZENITH = '#16223a'

const AUREOLE = 0.12
const FALLOFF = 0.006

const TIER = {
  low: { oct: 0, warp: 0, lights: 2 },
  medium: { oct: 1, warp: 0, lights: 6 },
  high: { oct: 2, warp: 1, lights: 6 },
  ultra: { oct: 2, warp: 1, lights: 6 },
} as const

interface Aureole {
  id: string
  pos: THREE.Vector3
  col: THREE.Color
  dir: THREE.Vector3
  w: number
  own: number
}

/* The graph is static for the life of the page; so is this list. */
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
  const compact = useStore((s) => s.compact)
  const tier = compact ? TIER.low : TIER[quality]

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
      defines: { DEPTHS_OCT: tier.oct, DEPTHS_WARP: tier.warp, DEPTHS_LIGHTS: L },
      uniforms: {
        uProjInv: { value: new THREE.Matrix4() },
        uViewInv: { value: new THREE.Matrix4() },
        uNadir: { value: new THREE.Color(NADIR) },
        uMid: { value: new THREE.Color(MID) },
        uZenith: { value: new THREE.Color(ZENITH) },
        uVeilCold: { value: new THREE.Color(site.meta.themeColorCold) },
        uVeilMid: { value: new THREE.Color(site.meta.themeColorMid) },
        uTime: { value: 0 },
        uBreath: { value: 0.5 },
        uEnvGain: { value: NO_COMPOSER ? 0.85 : 1 },
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

    const goalId = s.phase === 'turn' ? (s.pendingId ?? s.currentId) : s.currentId
    for (const l of LIGHTS) {
      const dist = cam.position.distanceTo(l.pos)
      l.dir.copy(l.pos).sub(cam.position).normalize()
      const target =
        l.id === goalId ? 0.4 + 0.6 * Math.sin(travelProgress(s) * Math.PI) : 1
      l.own += (target - l.own) * k
      l.w = AUREOLE * Math.exp(-dist * FALLOFF) * l.own
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
