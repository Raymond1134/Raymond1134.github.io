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
import { BEACON_DEFAULT_COLOR } from './beacons/palette'

const STRIKE_WINDOW_LAND = 0.22 + 1.6
const STRIKE_WINDOW_BIG = 0.45 + 4.2

const TINT = toLum('#ffdcae', 1)
const GHOST_TINT = toLum('#9fc4ff', 1)
const NODE_TINT = 0.45

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
          uTint: { value: TINT.clone() },
          uGhostTint: { value: GHOST_TINT },
          uExposure: { value: 1 },
          uTime: { value: 0 },
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
  const nodeTint = useMemo(
    () =>
      new Map(
        [...useStore.getState().graph.nodes.values()].map((n) => [n.id, toLum(n.color ?? BEACON_DEFAULT_COLOR, 1)]),
      ),
    [],
  )
  const strikeAt = useRef(-1e9)
  const strikeId = useRef<string | null>(null)

  useFrame((state) => {
    const m = mesh.current?.material as THREE.ShaderMaterial | undefined
    if (!m) return
    const u = m.uniforms
    const cam = state.camera
    const t = state.clock.elapsedTime
    const s = useStore.getState()

    const st = worldEvents.strike
    if (st.at !== strikeAt.current) {
      strikeAt.current = st.at
      strikeId.current = s.currentId
    }
    const span = st.kind === 'land' ? STRIKE_WINDOW_LAND : STRIKE_WINDOW_BIG
    const strikeLive = st.kind !== 'none' && t - st.at >= 0 && t - st.at < span
    let gain = Math.max(0, worldEvents.grade.shaft - 1)
    let tintId: string | null = null
    if (strikeLive) {
      src.copy(st.origin)
      tintId = strikeId.current
    } else {
      src.copy(cam.position).addScaledVector(ORACLE_DIR, 600)
    }

    const solo = worldEvents.solo.gain * 0.4
    if (solo > gain) {
      gain = solo
      tintId = null
      src.copy(cam.position).addScaledVector(ORACLE_DIR, 600)
    }

    const fl = worldEvents.flare
    if (fl.id && fl.gain * 0.35 > gain) {
      const node = s.graph.nodes.get(fl.id)
      if (node) {
        gain = fl.gain * 0.35
        tintId = fl.id
        src.copy(node.worldPosition)
      }
    }

    if (gain <= 0.004) {
      mesh.current.visible = false
      return
    }

    let vis = 0
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

    const fxK = s.fx === 'full' ? 1 : s.fx === 'reduced' ? 0.65 : 0
    u.uInt.value = LUM.lensFlare * gain * vis * fxK
    if (u.uInt.value <= 0.003) {
      mesh.current.visible = false
      return
    }
    const tint = tintId ? nodeTint.get(tintId) : undefined
    ;(u.uTint.value as THREE.Color).copy(TINT)
    if (tint) (u.uTint.value as THREE.Color).lerp(tint, NODE_TINT)
    u.uExposure.value = worldEvents.grade.exposure
    u.uTime.value = t
    state.gl.getDrawingBufferSize(size)
    u.uAspect.value = size.x / Math.max(1, size.y)
    mesh.current.visible = true
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
