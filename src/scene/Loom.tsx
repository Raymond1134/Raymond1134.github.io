import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import beadVert from '@/shaders/loom/bead.vert'
import beadFrag from '@/shaders/loom/bead.frag'
import { hash01 } from '@/content/layout'
import { useStore } from '@/state/store'
import { breath } from './breath'
import { worldEvents } from './worldEvents'
import { NO_COMPOSER } from './composerPolicy'
import { LUM, toLum } from './lightPyramid'
import { BEACON_DEFAULT_COLOR, CLICK_BLUE } from './beacons/palette'
import { LOOM_ORDER } from './renderOrder'

const BEAD_SPACING = 2.4
const SAG_MAX = 5

const THREAD_HUE = toLum('#6b7fd4', 1)
const CLICK_HUE = toLum(CLICK_BLUE, 1)

const CALM = useStore.getState().reducedMotion

const ORDER_IDX = new Map(useStore.getState().graph.order.map((id, i) => [id, i]))

function buildGeometry(): THREE.BufferGeometry {
  const graph = useStore.getState().graph
  const edges = [...graph.nodes.values()].filter((n) => n.parentId)

  let total = 0
  const counts: number[] = []
  for (const child of edges) {
    const parent = graph.nodes.get(child.parentId!)!
    const n = Math.max(6, Math.round(parent.worldPosition.distanceTo(child.worldPosition) / BEAD_SPACING))
    counts.push(n)
    total += n
  }

  const positions = new Float32Array(total * 3)
  const alongs = new Float32Array(total)
  const seeds = new Float32Array(total)
  const ends = new Float32Array(total * 2)
  const lens = new Float32Array(total)
  const phases = new Float32Array(total)
  const cols = new Float32Array(total * 3)

  const p = new THREE.Vector3()
  const colA = new THREE.Color()
  const colB = new THREE.Color()
  const col = new THREE.Color()

  let vi = 0
  for (let e = 0; e < edges.length; e++) {
    const child = edges[e]
    const parent = graph.nodes.get(child.parentId!)!
    const A = parent.worldPosition
    const B = child.worldPosition
    const len = A.distanceTo(B)
    const sag = Math.min(SAG_MAX, len * 0.045)
    const pi = ORDER_IDX.get(parent.id) ?? 0
    const ci = ORDER_IDX.get(child.id) ?? 0
    const phase = hash01(child.id, 77)
    colA.set(parent.color ?? BEACON_DEFAULT_COLOR)
    colB.set(child.color ?? BEACON_DEFAULT_COLOR)

    for (let i = 0; i < counts[e]; i++) {
      const t = (i + 0.5) / counts[e]
      p.copy(A).lerp(B, t)
      p.y -= sag * Math.sin(Math.PI * t)
      col.copy(colA).lerp(colB, t)
      const l = 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b
      col.multiplyScalar(1 / Math.max(l, 1e-6))

      positions[vi * 3 + 0] = p.x
      positions[vi * 3 + 1] = p.y
      positions[vi * 3 + 2] = p.z
      alongs[vi] = t
      seeds[vi] = hash01(child.id, 900 + i)
      ends[vi * 2 + 0] = pi
      ends[vi * 2 + 1] = ci
      lens[vi] = len
      phases[vi] = phase
      cols[vi * 3 + 0] = col.r
      cols[vi * 3 + 1] = col.g
      cols[vi * 3 + 2] = col.b
      vi++
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('aAlong', new THREE.BufferAttribute(alongs, 1))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
  geo.setAttribute('aEnds', new THREE.BufferAttribute(ends, 2))
  geo.setAttribute('aLen', new THREE.BufferAttribute(lens, 1))
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
  geo.setAttribute('aCol', new THREE.BufferAttribute(cols, 3))
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4)
  return geo
}

export default function Loom() {
  const points = useRef<THREE.Points>(null!)

  const geometry = useMemo(() => buildGeometry(), [])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: beadVert,
        fragmentShader: beadFrag,
        defines: { PHONE_GRADE: NO_COMPOSER ? 1 : 0 },
        uniforms: {
          uTime: { value: 0 },
          uBreath: { value: 0.5 },
          uPixelRatio: { value: 1 },
          uSway: { value: CALM ? 0.4 : 1 },
          uCur: { value: 0 },
          uPkSpeed: { value: CALM ? 2 : 7 },
          uReveal: { value: 1 },
          uRevealOrigin: { value: new THREE.Vector3() },
          uThreadL: { value: LUM.thread },
          uPulseL: { value: LUM.threadPulse },
          uCold: { value: THREAD_HUE },
          uClick: { value: CLICK_HUE },
          uExposure: { value: 1 },
          uResolution: { value: new THREE.Vector2(1, 1) },
        },
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => {
    const m = points.current?.material as THREE.ShaderMaterial | undefined
    if (!m) return
    const t = state.clock.elapsedTime
    const u = m.uniforms
    u.uTime.value = t
    u.uBreath.value = breath(t)
    u.uPixelRatio.value = state.gl.getPixelRatio()
    u.uCur.value = ORDER_IDX.get(useStore.getState().currentId) ?? 0
    u.uReveal.value = worldEvents.reveal
    ;(u.uRevealOrigin.value as THREE.Vector3).copy(worldEvents.revealOrigin)
    u.uExposure.value = worldEvents.grade.exposure
    state.gl.getDrawingBufferSize(u.uResolution.value as THREE.Vector2)
  })

  return (
    <points
      ref={points}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={LOOM_ORDER}
    />
  )
}
