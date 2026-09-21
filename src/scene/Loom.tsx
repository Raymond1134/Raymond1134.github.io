import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import beadVert from '@/shaders/loom/bead.vert'
import beadFrag from '@/shaders/loom/bead.frag'
import hazeVert from '@/shaders/loom/haze.vert'
import hazeFrag from '@/shaders/loom/haze.frag'
import { hash01 } from '@/content/layout'
import { useStore, TRAVEL } from '@/state/store'
import { EASE, flightEase } from '@/motion/tokens'
import { breath } from './breath'
import { worldEvents } from './worldEvents'
import { NO_COMPOSER } from './composerPolicy'
import { LUM, toLum } from './lightPyramid'
import { BEACON_DEFAULT_COLOR, CLICK_BLUE } from './beacons/palette'
import { LOOM_ORDER } from './renderOrder'

const BEAD_SPACING = 2.4
const SAG_MAX = 5
const HAZE_SEG = 3

const THREAD_HUE = toLum('#6b7fd4', 1)
const HAZE_HUE = toLum('#d4dcfa', 1)
const CLICK_HUE = toLum(CLICK_BLUE, 1)

const CALM = useStore.getState().reducedMotion

const REVEAL_FLASH = CALM ? 0 : 1.9

const ORDER_IDX = new Map(useStore.getState().graph.order.map((id, i) => [id, i]))
const NODES = ORDER_IDX.size
const PARENT_IDX = Int16Array.from(useStore.getState().graph.order, (id) =>
  ORDER_IDX.get(useStore.getState().graph.nodes.get(id)?.parentId ?? '') ?? -1,
)
const THREAD_LEN = Float32Array.from(useStore.getState().graph.order, (id) => {
  const { nodes } = useStore.getState().graph
  const n = nodes.get(id)
  const p = n?.parentId ? nodes.get(n.parentId) : undefined
  return n && p ? n.worldPosition.distanceTo(p.worldPosition) : 0
})

const COMET_IN = 0.18
const COMET_FADE = 5
const TAIL_MIN = 7
const TAIL_MAX = 32
const TAIL_PER_SPEED = 0.075

const RING_LIFE = 2.2
const RING_REACH = 190
const RING_GAIN = { none: 0, ignite: CALM ? 0 : 0.7, land: CALM ? 0 : 1, picardy: CALM ? 0 : 1.6 } as const

const comet = { idx: -1, rev: 0, head: 0, gain: 0, tail: TAIL_MIN, flying: false }
const ring = { gain: 0, radius: 0 }

const HANDOFF = 0.75
const PATH_IN = 0.28
const PATH_OUT = 0.6
const PATH_TURN = 0.35
const QUICKEN = CALM ? 0.5 : 1.3

const THREAD = new Float32Array(NODES * 4)
const onPath = new Uint8Array(NODES)
const link = { cur: -1, hov: -1 }

const frame = { t: 0, breath: 0.5 }

const toward = (v: number, target: number, step: number) =>
  v < target ? Math.min(target, v + step) : Math.max(target, v - step)

function markPath(a: number, b: number) {
  onPath.fill(0)
  if (a < 0 || b < 0 || a === b) return
  for (let n = a; n >= 0; n = PARENT_IDX[n]) onPath[n] = 1
  let top = b
  while (top >= 0 && onPath[top] !== 1) {
    onPath[top] = 2
    top = PARENT_IDX[top]
  }
  if (top < 0) {
    onPath.fill(0)
    return
  }
  for (let n = PARENT_IDX[top]; n >= 0; n = PARENT_IDX[n]) onPath[n] = 0
}

function stepThreads(dt: number, cur: number, hov: number, snap: boolean) {
  if (cur !== link.cur || hov !== link.hov) {
    markPath(cur, hov)
    link.cur = cur
    link.hov = hov
  }
  for (let c = 0; c < NODES; c++) {
    const p = PARENT_IDX[c]
    if (p < 0) continue
    const k = c * 4
    const adj = p === cur || c === cur ? 1 : 0
    THREAD[k] = snap ? adj : toward(THREAD[k], adj, dt / HANDOFF)
    const on = onPath[c] > 0 && onPath[p] > 0
    const h = THREAD[k + 1]
    THREAD[k + 1] = toward(h, on ? 1 : 0, dt / (on ? PATH_IN : PATH_OUT))
    const w = THREAD[k + 3]
    THREAD[k + 3] = toward(w, on ? (onPath[c] === 1 ? 1 : 0) : h > 0.01 ? w : 0, dt / PATH_TURN)
    THREAD[k + 2] += dt * QUICKEN * h * h * (3 - 2 * h)
  }
}

function stepComet(dt: number, s: ReturnType<typeof useStore.getState>) {
  const a = s.phase === 'flight' ? ORDER_IDX.get(s.previousId ?? '') ?? -1 : -1
  const b = ORDER_IDX.get(s.currentId) ?? -1
  const fwd = a >= 0 && b >= 0 && PARENT_IDX[b] === a
  const back = a >= 0 && b >= 0 && PARENT_IDX[a] === b
  if (!fwd && !back) {
    comet.flying = false
    comet.gain *= Math.exp(-dt * COMET_FADE)
    return
  }
  const ft = THREE.MathUtils.clamp((s.travelClock - TRAVEL.turn) / TRAVEL.flight, 0, 1)
  const e = flightEase(ft)
  const idx = fwd ? b : a
  if (!comet.flying || comet.idx !== idx) {
    comet.idx = idx
    comet.head = e
    comet.tail = TAIL_MIN
    comet.flying = true
  }
  const speed = (Math.abs(e - comet.head) / Math.max(dt, 1e-3)) * THREAD_LEN[idx]
  const tail = THREE.MathUtils.clamp(TAIL_MIN + TAIL_PER_SPEED * speed, TAIL_MIN, TAIL_MAX)
  comet.tail += (tail - comet.tail) * (1 - Math.exp(-dt * 14))
  comet.rev = fwd ? 0 : 1
  comet.head = e
  comet.gain = EASE.glide(Math.min(1, ft / COMET_IN))
}

function stepRing(t: number) {
  const st = worldEvents.strike
  const age = t - st.at
  if (age < 0 || age >= RING_LIFE) {
    ring.gain = 0
    return
  }
  const x = age / RING_LIFE
  ring.radius = RING_REACH * (1 - (1 - x) * (1 - x))
  ring.gain = RING_GAIN[st.kind] * Math.pow(1 - x, 1.5) * Math.min(1, age / 0.08)
}

function drive(m: THREE.Material | THREE.Material[] | undefined, gl: THREE.WebGLRenderer) {
  if (!m || Array.isArray(m)) return
  const u = (m as THREE.ShaderMaterial).uniforms
  u.uTime.value = frame.t
  u.uBreath.value = frame.breath
  if (u.uPixelRatio) u.uPixelRatio.value = gl.getPixelRatio()
  u.uReveal.value = worldEvents.reveal
  ;(u.uRevealOrigin.value as THREE.Vector3).copy(worldEvents.revealOrigin)
  ;(u.uComet.value as THREE.Vector4).set(comet.idx, comet.rev, comet.head, comet.gain)
  u.uCometTail.value = comet.tail
  const o = worldEvents.strike.origin
  ;(u.uRing.value as THREE.Vector4).set(o.x, o.y, o.z, ring.radius)
  u.uRingGain.value = ring.gain
  u.uExposure.value = worldEvents.grade.exposure
  gl.getDrawingBufferSize(u.uResolution.value as THREE.Vector2)
}

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

function buildHazeGeometry(): THREE.BufferGeometry {
  const graph = useStore.getState().graph
  const edges = [...graph.nodes.values()].filter((n) => n.parentId)

  let vTotal = 0
  let iTotal = 0
  const counts: number[] = []
  for (const child of edges) {
    const parent = graph.nodes.get(child.parentId!)!
    const segs = Math.max(6, Math.ceil(parent.worldPosition.distanceTo(child.worldPosition) / HAZE_SEG))
    counts.push(segs)
    vTotal += (segs + 1) * 2
    iTotal += segs * 6
  }

  const positions = new Float32Array(vTotal * 3)
  const dirs = new Float32Array(vTotal * 3)
  const sides = new Float32Array(vTotal)
  const alongs = new Float32Array(vTotal)
  const ends = new Float32Array(vTotal * 2)
  const lens = new Float32Array(vTotal)
  const phases = new Float32Array(vTotal)
  const cols = new Float32Array(vTotal * 3)
  const index = new Uint16Array(iTotal)

  const p = new THREE.Vector3()
  const d = new THREE.Vector3()
  const colA = new THREE.Color()
  const colB = new THREE.Color()
  const col = new THREE.Color()

  let vi = 0
  let ii = 0
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
    const base = vi

    for (let i = 0; i <= counts[e]; i++) {
      const t = i / counts[e]
      p.copy(A).lerp(B, t)
      p.y -= sag * Math.sin(Math.PI * t)
      d.copy(B).sub(A)
      d.y -= sag * Math.PI * Math.cos(Math.PI * t)
      d.normalize()
      col.copy(colA).lerp(colB, t)
      const l = 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b
      col.multiplyScalar(1 / Math.max(l, 1e-6))

      for (let s = -1; s <= 1; s += 2) {
        positions[vi * 3 + 0] = p.x
        positions[vi * 3 + 1] = p.y
        positions[vi * 3 + 2] = p.z
        dirs[vi * 3 + 0] = d.x
        dirs[vi * 3 + 1] = d.y
        dirs[vi * 3 + 2] = d.z
        sides[vi] = s
        alongs[vi] = t
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

    for (let i = 0; i < counts[e]; i++) {
      const r = base + i * 2
      index[ii++] = r
      index[ii++] = r + 1
      index[ii++] = r + 2
      index[ii++] = r + 1
      index[ii++] = r + 3
      index[ii++] = r + 2
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('aDir', new THREE.BufferAttribute(dirs, 3))
  geo.setAttribute('aSide', new THREE.BufferAttribute(sides, 1))
  geo.setAttribute('aAlong', new THREE.BufferAttribute(alongs, 1))
  geo.setAttribute('aEnds', new THREE.BufferAttribute(ends, 2))
  geo.setAttribute('aLen', new THREE.BufferAttribute(lens, 1))
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
  geo.setAttribute('aCol', new THREE.BufferAttribute(cols, 3))
  geo.setIndex(new THREE.BufferAttribute(index, 1))
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4)
  return geo
}

export default function Loom() {
  const points = useRef<THREE.Points>(null!)
  const haze = useRef<THREE.Mesh>(null!)

  const geometry = useMemo(() => buildGeometry(), [])
  const hazeGeometry = useMemo(() => buildHazeGeometry(), [])
  useEffect(() => () => {
    geometry.dispose()
    hazeGeometry.dispose()
  }, [geometry, hazeGeometry])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: beadVert,
        fragmentShader: beadFrag,
        defines: { PHONE_GRADE: NO_COMPOSER ? 1 : 0, THREADS: NODES },
        uniforms: {
          uTime: { value: 0 },
          uBreath: { value: 0.5 },
          uPixelRatio: { value: 1 },
          uSway: { value: CALM ? 0.4 : 1 },
          uThread: { value: THREAD },
          uPkSpeed: { value: CALM ? 2 : 7 },
          uReveal: { value: 1 },
          uRevealOrigin: { value: new THREE.Vector3() },
          uRevealFlash: { value: REVEAL_FLASH },
          uComet: { value: new THREE.Vector4(-10, 0, 0, 0) },
          uCometTail: { value: TAIL_MIN },
          uRing: { value: new THREE.Vector4() },
          uRingGain: { value: 0 },
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
  const hazeMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: hazeVert,
        fragmentShader: hazeFrag,
        defines: { PHONE_GRADE: NO_COMPOSER ? 1 : 0, THREADS: NODES },
        uniforms: {
          uTime: { value: 0 },
          uBreath: { value: 0.5 },
          uSway: { value: CALM ? 0.4 : 1 },
          uThread: { value: THREAD },
          uPkSpeed: { value: CALM ? 2 : 7 },
          uReveal: { value: 1 },
          uRevealOrigin: { value: new THREE.Vector3() },
          uRevealFlash: { value: REVEAL_FLASH * 1.6 },
          uComet: { value: new THREE.Vector4(-10, 0, 0, 0) },
          uCometTail: { value: TAIL_MIN },
          uRing: { value: new THREE.Vector4() },
          uRingGain: { value: 0 },
          uHazeL: { value: LUM.threadHaze },
          uPulseL: { value: LUM.threadPulse * 0.3 },
          uCold: { value: HAZE_HUE },
          uClick: { value: CLICK_HUE },
          uExposure: { value: 1 },
          uResolution: { value: new THREE.Vector2(1, 1) },
        },
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [],
  )
  useEffect(() => () => {
    material.dispose()
    hazeMaterial.dispose()
  }, [material, hazeMaterial])

  useFrame((state, dt) => {
    const s = useStore.getState()
    const t = state.clock.elapsedTime
    frame.t = t
    frame.breath = breath(t)
    const cur = ORDER_IDX.get(s.currentId) ?? 0
    const hov = s.hoveredId ? ORDER_IDX.get(s.hoveredId) ?? -1 : -1
    const step = Math.min(dt, 0.1)
    stepThreads(step, cur, hov, link.cur < 0)
    stepComet(step, s)
    stepRing(t)
    drive(points.current?.material, state.gl)
    drive(haze.current?.material, state.gl)
  })

  return (
    <group>
      <mesh
        ref={haze}
        geometry={hazeGeometry}
        material={hazeMaterial}
        frustumCulled={false}
        renderOrder={LOOM_ORDER}
      />
      <points
        ref={points}
        geometry={geometry}
        material={material}
        frustumCulled={false}
        renderOrder={LOOM_ORDER}
      />
    </group>
  )
}
