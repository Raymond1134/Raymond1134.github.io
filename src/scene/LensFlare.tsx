import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import flareVert from '@/shaders/light/flare.vert'
import flareFrag from '@/shaders/light/flare.frag'
import { useStore } from '@/state/store'
import { worldEvents } from './worldEvents'
import { LUM, toLum } from './lightPyramid'
import { FLARE_ORDER } from './renderOrder'
import { NO_COMPOSER } from './composerPolicy'
import { ORACLE_DIR } from './vaultGeom'

const STRIKE_WINDOW = 0.45 + 4.2

const TINT = toLum('#ffdcae', 1)
const GHOST_TINT = toLum('#9fc4ff', 1)

export default function LensFlare() {
  const mesh = useRef<THREE.Mesh>(null!)

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

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: flareVert,
        fragmentShader: flareFrag,
        defines: { PHONE_GRADE: NO_COMPOSER ? 1 : 0 },
        uniforms: {
          uLight: { value: new THREE.Vector2(0, 0) },
          uInt: { value: 0 },
          uAspect: { value: 1 },
          uTint: { value: TINT },
          uGhostTint: { value: GHOST_TINT },
          uExposure: { value: 1 },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  const src = useMemo(() => new THREE.Vector3(), [])
  const toSrc = useMemo(() => new THREE.Vector3(), [])
  const fwd = useMemo(() => new THREE.Vector3(), [])
  const size = useMemo(() => new THREE.Vector2(), [])

  useFrame((state) => {
    const m = mesh.current?.material as THREE.ShaderMaterial | undefined
    if (!m) return
    const u = m.uniforms
    const cam = state.camera
    const t = state.clock.elapsedTime
    const s = useStore.getState()

    const st = worldEvents.strike
    const strikeLive = st.kind !== 'none' && t - st.at >= 0 && t - st.at < STRIKE_WINDOW
    let gain = Math.max(0, worldEvents.grade.shaft - 1)
    if (strikeLive) {
      src.copy(st.origin)
    } else {
      src.copy(cam.position).addScaledVector(ORACLE_DIR, 600)
    }

    const solo = worldEvents.solo.gain * 0.4
    if (solo > gain) {
      gain = solo
      src.copy(cam.position).addScaledVector(ORACLE_DIR, 600)
    }

    const fl = worldEvents.flare
    if (fl.id && fl.gain * 0.35 > gain) {
      const node = s.graph.nodes.get(fl.id)
      if (node) {
        gain = fl.gain * 0.35
        src.copy(node.worldPosition)
      }
    }

    let vis = 0
    if (gain > 0.004) {
      toSrc.copy(src).sub(cam.position)
      cam.getWorldDirection(fwd)
      if (fwd.dot(toSrc) > 0) {
        src.project(cam)
        const edge =
          (1 - THREE.MathUtils.smoothstep(Math.abs(src.x), 0.85, 1.35)) *
          (1 - THREE.MathUtils.smoothstep(Math.abs(src.y), 0.85, 1.35))
        vis = edge
        ;(u.uLight.value as THREE.Vector2).set(src.x, src.y)
      }
    }

    const fxK = s.fx === 'full' ? 1 : s.fx === 'reduced' ? 0.65 : 0
    u.uInt.value = LUM.lensFlare * gain * vis * fxK
    u.uExposure.value = worldEvents.grade.exposure
    state.gl.getDrawingBufferSize(size)
    u.uAspect.value = size.x / Math.max(1, size.y)
    mesh.current.visible = u.uInt.value > 0.003
  })

  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={FLARE_ORDER}
    />
  )
}
