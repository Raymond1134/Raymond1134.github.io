import { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'
import type { GraphNode } from '@/content/layout'
import { hash01 } from '@/content/layout'
import { site } from '@/content'
import { useStore, TRAVEL_LANDING } from '@/state/store'
import { input, TAP_SLOP, stillFor } from '@/input/input'
import beaconVert from '@/shaders/beacon/beacon.vert'
import coreFrag from '@/shaders/beacon/core.frag'
import motesVert from '@/shaders/beacon/motes.vert'
import motesFrag from '@/shaders/beacon/motes.frag'
import haloVert from '@/shaders/beacon/halo.vert'
import haloFrag from '@/shaders/beacon/halo.frag'
import crystalVert from '@/shaders/beacon/crystal.vert'
import crystalFrag from '@/shaders/beacon/crystal.frag'
import { ATMOSPHERE_ORDER } from '@/scene/renderOrder'
import { worldEvents } from '@/scene/worldEvents'
import { LUM, AERIAL_K, DOME_STOPS } from '@/scene/lightPyramid'
import { NO_COMPOSER } from '@/scene/composerPolicy'
import { panelContent, PANEL_Z } from '@/scene/ui3d/panelLayout'
import { LAMBDA, EASE } from '@/motion/tokens'
import { BEACON_DEFAULT_COLOR, CLICK_BLUE as CLICK_BLUE_HEX, CLICK_BLUE_DEEP as CLICK_BLUE_DEEP_HEX } from './palette'
import type { Quality } from '@/state/store'

const TAP_TARGET_FACTOR = 0.11

const NUCLEUS_COLOR = '#fff4e2'
const MOTE_COUNT = 800

const CLUSTERS = 5
const ORBIT_RADIUS = 1.85
const MOTE_DENSITY_TRIM = 0.95

const HALO_OUTER = 5.5
const ATMO_WORLD = 14
const ROLE_GAIN = { current: 1.0, reachable: 0.85, distant: 0.55 } as const
const HALO_GAIN = { current: 0.55, reachable: 0.68, distant: 0.32 } as const

const PHONE_GLOW_COMP = NO_COMPOSER ? 1.25 : 1

const MOTE_TIER: Record<Quality, number> = { low: 300, medium: 500, high: 800, ultra: 800 }
const ATMO_OPACITY = 0.045

const CALM = useStore.getState().reducedMotion

const LABEL_REST = 0.92
const LABEL_Y = -2.6
const LABEL_RISE = CALM ? 0 : 0.55
const LABEL_HOVER_LIFT = CALM ? 0 : 0.2
const LABEL_HOVER_SCALE = CALM ? 0 : 0.08
const LABEL_STAGGER = 0.35
const LABEL_LEAD = 0.06
const LABEL_ABOVE = 1.7
const LABEL_SWAP = 0.16
const LABEL_TOP_EDGE = 0.99

const PRESS_CONFIRM = 0.08

const SPIN_REST = CALM ? 0.03 : 0.11
const SPIN_HOVER = CALM ? 0 : 1.5
const SPIN_BOOST = CALM ? 0 : 0.8
const TUMBLE = CALM ? 0 : 1

const RING_LIFE = CALM ? 1.4 : 1.05
const RING_ATTACK = 0.22
const RING_MERGE = 0.3
const RING_SPAN = CALM ? 1 : 2.1
const RING_FROM = 0.3
const RING_TO = CALM ? 0.55 : 1.85
const RING_GAIN = CALM ? 0.35 : 0.85
const RING_K = { hover: 0.5, press: 0.9, goal: 1.0, land: 1.0, beckon: 0.35 } as const

const ORBIT_REST = CALM ? 0.5 : 1
const ORBIT_HOVER = CALM ? 0 : 2.4
const ORBIT_BOOST = CALM ? 0 : 1.2
const BURST_LIFE = 1.3

const SPIKE_HOVER = 1.1
const SPIKE_CURRENT = 0.25
const SPIKE_BOOST = 0.35
const SPIKE_PHONE = NO_COMPOSER ? 1.4 : 1
const SPIKE_SPIN = CALM ? 0 : 0.05

const BECKON_AFTER = 6
const BECKON_PERIOD = 7
const BECKON_SWEEP = 0.3

interface Ring {
  age: number
  k: number
  k0: number
  rise: number
}

const ringK = (r: Ring) =>
  r.k0 + (r.k - r.k0) * THREE.MathUtils.smoothstep(r.age - r.rise, 0, RING_ATTACK)

const ringEnvelope = (r: Ring) => {
  if (r.age >= RING_LIFE) return 0
  const fall = 1 - r.age / RING_LIFE
  return ringK(r) * THREE.MathUtils.smoothstep(r.age, 0, RING_ATTACK) * fall * fall
}

const ringRadius = (r: Ring) =>
  RING_FROM + (RING_TO - RING_FROM) * EASE.hearth(Math.min(1, r.age / RING_LIFE))

function fireRing(rings: Ring[], k: number) {
  const young = rings[0].age < rings[1].age ? rings[0] : rings[1]
  if (young.age < RING_MERGE) {
    if (k > young.k) {
      young.k0 = ringK(young)
      young.k = k
      young.rise = young.age
    }
    return
  }
  const old = young === rings[0] ? rings[1] : rings[0]
  old.age = 0
  old.k = k
  old.k0 = k
  old.rise = 0
}

const DEEP_TINT = new THREE.Color('#233252')
const WHITE = new THREE.Color('#ffffff')
const dirSelf = new THREE.Vector3()
const dirCur = new THREE.Vector3()
const camRight = new THREE.Vector3()
const camUp = new THREE.Vector3()
const camBack = new THREE.Vector3()
const probeA = new THREE.Vector3()
const probeB = new THREE.Vector3()
const lblCenter = new THREE.Vector3()

const CLICK_BLUE = new THREE.Color(CLICK_BLUE_HEX)
const CLICK_BLUE_DEEP = new THREE.Color(CLICK_BLUE_DEEP_HEX)
const LABEL_BASE = CLICK_BLUE.clone().lerp(WHITE, 0.62)

const contentAt = { stamp: -1, n: 0 }
const contentNdc = panelContent.rects.map(() => ({ x: 0, y: 0, hx: 0, hy: 0 }))

function measureContent(camera: THREE.Camera, center: THREE.Vector3, stamp: number) {
  if (contentAt.stamp === stamp) return
  contentAt.stamp = stamp
  camRight.set(1, 0, 0).applyQuaternion(camera.quaternion)
  camUp.set(0, 1, 0).applyQuaternion(camera.quaternion)
  camBack.set(0, 0, 1).applyQuaternion(camera.quaternion)
  contentAt.n = 0
  for (let i = 0; i < panelContent.count; i++) {
    const r = panelContent.rects[i]
    probeA.copy(center).addScaledVector(camRight, r.x).addScaledVector(camUp, r.y).addScaledVector(camBack, PANEL_Z)
    probeB.copy(probeA).addScaledVector(camRight, r.hw).addScaledVector(camUp, r.hh)
    probeA.project(camera)
    probeB.project(camera)
    if (probeA.z >= 1) continue
    const s = contentNdc[contentAt.n++]
    s.x = probeA.x
    s.y = probeA.y
    s.hx = Math.abs(probeB.x - probeA.x)
    s.hy = Math.abs(probeB.y - probeA.y)
  }
}

function labelOverContent(camera: THREE.Camera, center: THREE.Vector3, halfW: number, halfH: number) {
  if (contentAt.n === 0) return 0
  probeB.copy(center).addScaledVector(camRight, halfW).addScaledVector(camUp, halfH).project(camera)
  probeA.copy(center).project(camera)
  if (probeA.z > 1) return 0
  const lhx = Math.abs(probeB.x - probeA.x)
  const lhy = Math.abs(probeB.y - probeA.y)
  let over = 0
  for (let i = 0; i < contentAt.n; i++) {
    const s = contentNdc[i]
    const gx = Math.abs(probeA.x - s.x) - s.hx - lhx
    const gy = Math.abs(probeA.y - s.y) - s.hy - lhy
    over = Math.max(
      over,
      (1 - THREE.MathUtils.smoothstep(gx, -lhx, 0.01)) * (1 - THREE.MathUtils.smoothstep(gy, -lhy, 0.01)),
    )
  }
  return over
}

const QUAD = new THREE.PlaneGeometry(2, 2)
QUAD.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5)

const CORE_GEO = new THREE.IcosahedronGeometry(1.45, 2)
const HIT_GEO = new THREE.SphereGeometry(1, 12, 12)

const FLICKER_K = CALM ? 0.35 : 1
const TIME_K = CALM ? 0.35 : 1
const MOTE_ROLE = { current: 1, reachable: 1, distant: 0.45 } as const
const MOTE_FX = { full: 1, reduced: 0.75, off: 0.5 } as const
const MOTE_REACH = 8

const frustum = new THREE.Frustum()
const viewProj = new THREE.Matrix4()
const cullSphere = new THREE.Sphere()
const frustumAt = { stamp: -1 }

function viewFrustum(camera: THREE.Camera, stamp: number) {
  if (frustumAt.stamp !== stamp) {
    frustumAt.stamp = stamp
    camera.updateMatrixWorld()
    frustum.setFromProjectionMatrix(
      viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    )
  }
  return frustum
}

const CRYSTAL_R = 0.92
const CRYSTAL_GEO = (() => {
  const g = new THREE.IcosahedronGeometry(CRYSTAL_R, 0).toNonIndexed()
  g.computeVertexNormals()
  const n = g.attributes.position.count
  const facet = new Float32Array(n)
  for (let i = 0; i < n; i++) facet[i] = Math.floor(i / 3)
  g.setAttribute('aFacet', new THREE.BufferAttribute(facet, 1))
  return g
})()

interface Props {
  node: GraphNode
  role: 'current' | 'reachable' | 'distant'
}

interface TroikaLabel {
  fillOpacity: number
  outlineOpacity: number
  textRenderInfo?: { blockBounds: number[] } | null
}

interface BeaconAssets {
  coreMat: THREE.ShaderMaterial
  moteMat: THREE.ShaderMaterial
  moteGeo: THREE.BufferGeometry
  haloMat: THREE.ShaderMaterial
  atmoMat: THREE.ShaderMaterial
  crystalMat: THREE.ShaderMaterial
}

function glowMat(coreW: number, skirt: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: haloVert,
    fragmentShader: haloFrag,
    defines: { PHONE_GRADE: NO_COMPOSER ? 1 : 0 },
    uniforms: {
      uWorld: { value: 1 },
      uCore: { value: new THREE.Color() },
      uEdge: { value: new THREE.Color() },
      uGain: { value: 0 },
      uCoreW: { value: coreW },
      uSkirt: { value: skirt },
      uExposure: { value: 1 },
      uSpan: { value: 1 },
      uRing: { value: new THREE.Vector2() },
      uRingGain: { value: new THREE.Vector2() },
      uSpike: { value: 0 },
      uSpin: { value: new THREE.Vector2(1, 0) },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
}

function buildAssets(
  nodeId: string,
  color: THREE.Color,
  coolColor: THREE.Color,
  clusterSeed: number,
): BeaconAssets {
  const shared = {
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }

  const seeds = new Float32Array(MOTE_COUNT * 3)
  for (let i = 0; i < seeds.length; i++) seeds[i] = hash01(nodeId, 100 + i)

  const clusters = new Float32Array(MOTE_COUNT)
  const trails = new Float32Array(MOTE_COUNT)
  const colors = new Float32Array(MOTE_COUNT * 3)

  const nucleus = new THREE.Color(NUCLEUS_COLOR)
  const palette = [
    color.clone().lerp(nucleus, 0.55),
    color.clone().lerp(nucleus, 0.25),
    color.clone(),
    color.clone().lerp(coolColor, 0.3),
    color.clone().lerp(coolColor, 0.62).offsetHSL(0.03, 0.08, 0),
  ]

  for (let i = 0; i < MOTE_COUNT; i++) {
    const c = i % CLUSTERS
    clusters[i] = c
    trails[i] = hash01(nodeId, 5000 + i)
    colors[i * 3 + 0] = palette[c].r
    colors[i * 3 + 1] = palette[c].g
    colors[i * 3 + 2] = palette[c].b
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3))
  geo.setAttribute('aCluster', new THREE.BufferAttribute(clusters, 1))
  geo.setAttribute('aTrail', new THREE.BufferAttribute(trails, 1))
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOTE_COUNT * 3), 3))

  return {
    coreMat: new THREE.ShaderMaterial({
      vertexShader: beaconVert,
      fragmentShader: coreFrag,
      defines: { PHONE_GRADE: NO_COMPOSER ? 1 : 0 },
      uniforms: {
        uCore: { value: new THREE.Color(NUCLEUS_COLOR) },
        uEdge: { value: color },
        uOuter: { value: new THREE.Color(site.meta.themeColorHot) },
        uIntensity: { value: 1 },
        uNucleusGain: { value: LUM.nucleusMin },
        uTime: { value: 0 },
        uExposure: { value: 1 },
      },
      ...shared,
    }),
    moteMat: new THREE.ShaderMaterial({
      vertexShader: motesVert,
      fragmentShader: motesFrag,
      defines: { PHONE_GRADE: NO_COMPOSER ? 1 : 0 },
      uniforms: {
        uTime: { value: 0 },
        uExposure: { value: 1 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uColorCool: { value: coolColor },
        uIntensity: { value: 1 },
        uOrbitRadius: { value: ORBIT_RADIUS },
        uClusters: { value: CLUSTERS },
        uClusterSeed: { value: clusterSeed },
        uOrbit: { value: 0 },
        uBurst: { value: 0 },
      },
      ...shared,
    }),
    moteGeo: geo,
    haloMat: glowMat(1, 0.28),
    atmoMat: glowMat(0, 1),
    crystalMat: new THREE.ShaderMaterial({
      vertexShader: crystalVert,
      fragmentShader: crystalFrag,
      defines: { PHONE_GRADE: NO_COMPOSER ? 1 : 0 },
      uniforms: {
        uNadir: { value: DOME_STOPS.nadir },
        uMid: { value: DOME_STOPS.mid },
        uZenith: { value: DOME_STOPS.zenith },
        uNucleusGain: { value: LUM.nucleusMin },
        uIntensity: { value: 1 },
        uTime: { value: 0 },
        uExposure: { value: 1 },
        uHover: { value: 0 },
      },
      transparent: false,
      depthWrite: true,
      depthTest: true,
      toneMapped: false,
    }),
  }
}

export default function Beacon({ node, role }: Props) {
  const group = useRef<THREE.Group>(null!)
  const boostT = useRef(1)
  const queueT = useRef(0)
  const core = useRef<THREE.Mesh>(null!)
  const motes = useRef<THREE.Points>(null!)
  const halo = useRef<THREE.Mesh>(null!)
  const atmo = useRef<THREE.Mesh>(null!)
  const crystal = useRef<THREE.Mesh>(null!)
  const hit = useRef<THREE.Mesh>(null!)
  const label = useRef<THREE.Group>(null)
  const labelText = useRef<THREE.Mesh>(null)
  const labelT = useRef(0)
  const labelSide = useRef(0)
  const labelSwap = useRef(1)
  const idleAt = useRef(0)
  const wasIdle = useRef(false)
  const hoverT = useRef(0)
  const pressed = useRef(false)
  const spin = useRef(0)
  const pressT = useRef(0)
  const pressFired = useRef(false)
  const rings = useRef<Ring[]>([
    { age: 9, k: 0, k0: 0, rise: 0 },
    { age: 9, k: 0, k0: 0, rise: 0 },
  ])
  const wasHovered = useRef(false)
  const wasGoal = useRef(false)
  const wasLanded = useRef(false)
  const orbitT = useRef(0)
  const burstT = useRef(1)
  const beckonCyc = useRef(0)
  const hovered = useStore((s) => s.hoveredId === node.id)
  const setHovered = useStore((s) => s.setHovered)
  const travelTo = useStore((s) => s.travelTo)
  const idle = useStore((s) => s.phase === 'idle')
  const canHoverPointer = useStore((s) => s.hover)
  const coarse = useStore((s) => s.coarse)
  const compact = useStore((s) => s.compact)
  const quality = useStore((s) => s.quality)
  const fx = useStore((s) => s.fx)
  const color = useMemo(() => new THREE.Color(node.color ?? BEACON_DEFAULT_COLOR), [node.color])

  const outerColor = useMemo(() => {
    if (role === 'reachable') return CLICK_BLUE_DEEP.clone()
    return color.clone().lerp(new THREE.Color(site.meta.themeColorHot), 0.85)
  }, [color, role])

  const coolColor = useMemo(
    () =>
      new THREE.Color(site.meta.themeColorAccent).lerp(
        new THREE.Color(site.meta.themeColorCold),
        0.45,
      ),
    [],
  )

  const atmoColor = useMemo(
    () => color.clone().lerp(new THREE.Color(site.meta.themeColorMid), 0.4),
    [color],
  )

  const labelColor = useMemo(() => LABEL_BASE.clone(), [])
  const labelDelay = useMemo(() => LABEL_LEAD + hash01(node.id, 9) * LABEL_STAGGER, [node.id])

  const haloCore = useMemo(() => {
    if (role === 'reachable') return CLICK_BLUE.clone().lerp(WHITE, 0.16)
    return color.clone().lerp(WHITE, 0.6)
  }, [color, role])

  const atmoOn =
    fx === 'full' && !(quality === 'low' || compact) && (quality !== 'medium' || role === 'current')

  const clusterSeed = useMemo(() => hash01(node.id, 41) * 97.3, [node.id])
  const seed = useMemo(() => hash01(node.id, 7) * Math.PI * 2, [node.id])
  const [assets, setAssets] = useState<BeaconAssets | null>(null)

  useEffect(() => {
    const built = buildAssets(node.id, color, coolColor, clusterSeed)

    setAssets(built)
    return () => {
      built.coreMat.dispose()
      built.moteMat.dispose()
      built.moteGeo.dispose()
      built.haloMat.dispose()
      built.atmoMat.dispose()
      built.crystalMat.dispose()
    }
  }, [color, coolColor, clusterSeed, node.id])

  const interactive = role === 'reachable' && idle

  useFrame((state, rawDt) => {
    if (!assets) return

    const dt = Math.min(rawDt, 1 / 30)
    const t = state.clock.elapsedTime
    const st = useStore.getState()
    const now = performance.now()
    if (pressed.current && (!input.dragging || input.dragDistance > TAP_SLOP)) pressed.current = false
    if (pressed.current) pressT.current += dt
    const pressLit = pressed.current && pressT.current >= PRESS_CONFIRM
    if (pressLit && !pressFired.current) {
      pressFired.current = true
      fireRing(rings.current, RING_K.press)
    }
    const lit = hovered || pressLit
    hoverT.current +=
      ((lit ? 1 : 0) - hoverT.current) * (1 - Math.pow(pressLit ? 1e-4 : 0.01, dt))
    const h = hoverT.current
    if (hovered && !wasHovered.current) fireRing(rings.current, RING_K.hover)
    wasHovered.current = hovered

    const flicker =
      0.84 +
      FLICKER_K *
        (0.10 * Math.sin(t * 1.13 + seed) +
          0.06 * Math.sin(t * 2.37 + seed * 2.1) +
          0.04 * Math.sin(t * 0.61 + seed * 3.7))

    const d = state.camera.position.distanceTo(node.worldPosition)
    const nearAtt = THREE.MathUtils.smoothstep(d, 3, 10)

    const distAtt = Math.min(1, Math.exp(-(d - 32) * AERIAL_K))

    let adm = 1
    let igniteFlare = 1
    if (worldEvents.reveal < 1) {
      const d0 = node.worldPosition.distanceTo(worldEvents.revealOrigin)
      const front = worldEvents.reveal * 380
      adm = worldEvents.reveal <= 0.001 ? 0 : 1 - THREE.MathUtils.smoothstep(d0, front - 14, front)
      igniteFlare = 1 + 0.4 * Math.exp(-Math.abs(d0 - front) / 10)
      if (worldEvents.ember.id === node.id) adm = Math.max(adm, worldEvents.ember.gain)
    }

    const flareBoost =
      worldEvents.flare.id === node.id ? 1 + worldEvents.flare.gain * 1.8 : 1

    let ack = 1
    if (role === 'current') {
      const hp = (now - worldEvents.homePulseAt) / 1000
      if (hp >= 0 && hp < 0.4) ack *= 1 + 0.15 * Math.sin((hp / 0.4) * Math.PI)
      const sg = (now - worldEvents.soundGlintAt) / 1000
      if (sg >= 0 && sg < 0.6)
        ack *= 1 + 0.2 * Math.sin((sg / 0.6) * Math.PI) * (0.7 + 0.3 * Math.sin(sg * Math.PI * 10))
    }

    const isGoal = st.phase !== 'idle' && (st.pendingId ?? st.currentId) === node.id
    const landed =
      st.phase === 'settle' && st.currentId === node.id && st.travelClock - TRAVEL_LANDING < 0.15
    const boost = (boostT.current +=
      ((landed ? 2.3 : isGoal ? 1.8 : 1) - boostT.current) * (1 - Math.pow(0.02, dt)))

    if (isGoal && !wasGoal.current) fireRing(rings.current, RING_K.goal)
    wasGoal.current = isGoal
    if (landed && !wasLanded.current) {
      fireRing(rings.current, RING_K.land)
      if (!CALM) burstT.current = 0
    }
    wasLanded.current = landed

    queueT.current += ((st.queuedId === node.id ? 1 : 0) - queueT.current) * (1 - Math.pow(0.001, dt))

    const pd = role === 'current' ? 1 - 0.6 * worldEvents.panelDim : 1

    const gain =
      ROLE_GAIN[role] * flicker * (1 + h * 1.8) * nearAtt * boost * distAtt * adm * igniteFlare *
      flareBoost * ack * (1 + queueT.current * 0.25) * worldEvents.grade.ignite * pd
    const cm = core.current.material as THREE.ShaderMaterial
    const mm = motes.current.material as THREE.ShaderMaterial

    core.current.scale.setScalar((0.94 + flicker * 0.12) * (1 + h * 0.7))
    cm.uniforms.uIntensity.value = gain
    cm.uniforms.uNucleusGain.value = THREE.MathUtils.lerp(
      LUM.nucleusMin,
      LUM.nucleusMax,
      Math.min(1, h + Math.max(0, boost - 1)),
    ) * (role === 'current' ? 1 - 0.5 * worldEvents.panelDim : 1)
    cm.uniforms.uTime.value = t * TIME_K
    cm.uniforms.uExposure.value = worldEvents.grade.exposure
    mm.uniforms.uExposure.value = worldEvents.grade.exposure

    const moteFar = 1 - THREE.MathUtils.smoothstep(d, 140, 300)
    const moteBudget = MOTE_TIER[quality] * MOTE_ROLE[role] * MOTE_FX[fx] * (d < 140 ? 1 : 0.3)
    assets.moteGeo.setDrawRange(0, Math.min(MOTE_COUNT, Math.ceil(moteBudget)))

    mm.uniforms.uTime.value = t * TIME_K
    mm.uniforms.uIntensity.value =
      ROLE_GAIN[role] * flicker * MOTE_DENSITY_TRIM * (role === 'distant' ? 0.5 : 1) *
      (1 + h * 0.6) * moteFar * distAtt * adm * boost * pd
    mm.uniforms.uPixelRatio.value = state.gl.getPixelRatio()
    orbitT.current += dt * (ORBIT_REST + ORBIT_HOVER * h + ORBIT_BOOST * Math.max(0, boost - 1))
    mm.uniforms.uOrbit.value = orbitT.current
    burstT.current = Math.min(1, burstT.current + dt / BURST_LIFE)
    const bt = burstT.current
    mm.uniforms.uBurst.value = bt < 1 ? EASE.hearth(Math.min(1, bt * 5)) * (1 - EASE.glide(bt)) : 0
    motes.current.scale.setScalar(1 + h * 0.6)

    const outerW = Math.max(HALO_OUTER, d * 0.016)
    const hm = (halo.current.material as THREE.ShaderMaterial).uniforms
    hm.uWorld.value = (outerW / 2) * (1 + h * 0.85)
    hm.uGain.value =
      LUM.halo * HALO_GAIN[role] * PHONE_GLOW_COMP * flicker * (1 + h * 1.5) * nearAtt * boost *
      distAtt * adm * igniteFlare * flareBoost * ack * worldEvents.grade.ignite * pd
    hm.uExposure.value = worldEvents.grade.exposure
    const coolTo = role === 'reachable' ? CLICK_BLUE_DEEP : DEEP_TINT
    ;(hm.uCore.value as THREE.Color).copy(haloCore).lerp(coolTo, 1 - distAtt)
    ;(hm.uEdge.value as THREE.Color).copy(outerColor).lerp(coolTo, 1 - distAtt)

    const spikeK =
      SPIKE_HOVER * h + (role === 'current' ? SPIKE_CURRENT : 0) + SPIKE_BOOST * Math.max(0, boost - 1)
    hm.uSpike.value = hm.uGain.value * spikeK * SPIKE_PHONE
    const spinA = seed + t * SPIKE_SPIN
    ;(hm.uSpin.value as THREE.Vector2).set(Math.cos(spinA), Math.sin(spinA))

    if (role === 'reachable' && !canHoverPointer && !CALM && st.phase === 'idle') {
      const cur = st.graph.nodes.get(st.currentId)
      let sweep = hash01(node.id, 13)
      if (cur) {
        camRight.set(1, 0, 0).applyQuaternion(state.camera.quaternion)
        camUp.set(0, 1, 0).applyQuaternion(state.camera.quaternion)
        probeA.copy(node.worldPosition).sub(cur.worldPosition)
        sweep = (Math.atan2(-probeA.dot(camUp), probeA.dot(camRight)) / (Math.PI * 2) + 1) % 1
      }
      const cyc = (t / BECKON_PERIOD + sweep * BECKON_SWEEP) % 1
      if (cyc + 0.5 < beckonCyc.current && stillFor() > BECKON_AFTER) {
        fireRing(rings.current, RING_K.beckon)
      }
      beckonCyc.current = cyc
    }

    const ra = rings.current[0]
    const rb = rings.current[1]
    ra.age += dt
    rb.age += dt
    const ga = ringEnvelope(ra)
    const gb = ringEnvelope(rb)
    const ringBase =
      LUM.halo * HALO_GAIN[role] * RING_GAIN * nearAtt * distAtt * adm *
      worldEvents.grade.ignite * pd
    hm.uSpan.value = ga + gb > 0 ? RING_SPAN : 1
    ;(hm.uRing.value as THREE.Vector2).set(ringRadius(ra), ringRadius(rb))
    ;(hm.uRingGain.value as THREE.Vector2).set(ga * ringBase, gb * ringBase)

    cullSphere.center.copy(node.worldPosition)
    cullSphere.radius =
      Math.SQRT2 *
      Math.max(hm.uWorld.value * hm.uSpan.value, atmo.current ? ATMO_WORLD / 2 : 0, MOTE_REACH)
    const inView = viewFrustum(state.camera, t).intersectsSphere(cullSphere) && adm > 0.001
    halo.current.visible = inView
    if (atmo.current) atmo.current.visible = inView
    motes.current.visible = inView && moteFar > 0.01 && adm > 0.01

    if (atmo.current) {
      const am = (atmo.current.material as THREE.ShaderMaterial).uniforms
      am.uWorld.value = ATMO_WORLD / 2
      am.uGain.value = ATMO_OPACITY * (0.88 + 0.12 * flicker) * nearAtt * distAtt * adm
      am.uExposure.value = worldEvents.grade.exposure
      ;(am.uEdge.value as THREE.Color).copy(atmoColor).lerp(DEEP_TINT, 1 - distAtt)
    }

    const xm = (crystal.current.material as THREE.ShaderMaterial).uniforms
    xm.uNucleusGain.value = cm.uniforms.uNucleusGain.value
    xm.uIntensity.value = adm
    xm.uTime.value = t * TIME_K
    xm.uExposure.value = worldEvents.grade.exposure
    xm.uHover.value = h

    spin.current += dt * (SPIN_REST + SPIN_HOVER * h + SPIN_BOOST * Math.max(0, boost - 1))
    const tw = t * TUMBLE
    crystal.current.rotation.set(
      0.3 * Math.sin(tw * 0.047 + seed),
      seed + spin.current,
      0.16 * Math.sin(tw * 0.063 + seed * 1.9),
    )

    hit.current.scale.setScalar(THREE.MathUtils.clamp(d * TAP_TARGET_FACTOR, 6, 46))

    const idleNow = st.phase === 'idle'
    if (idleNow && !wasIdle.current) idleAt.current = t
    wasIdle.current = idleNow

    if (label.current) {
      const want = idleNow && t - idleAt.current > labelDelay ? 1 : 0
      labelT.current = THREE.MathUtils.damp(
        labelT.current,
        want,
        want > labelT.current ? LAMBDA.ease : LAMBDA.snap,
        dt,
      )
      const lt = labelT.current
      const ls = Math.max(1.1, Math.pow(d, 0.85) * 0.055)
      label.current.scale.setScalar(ls * (1 + LABEL_HOVER_SCALE * h))
      labelColor.copy(LABEL_BASE).lerp(WHITE, 0.4 * h)

      let o = (coarse ? 1 : LABEL_REST + (1 - LABEL_REST) * h) * lt
      o *= (1 - 0.45 * THREE.MathUtils.smoothstep(d, 120, 300)) * adm
      const lm = labelText.current
      if (lm) {
        const tt = lm as unknown as TroikaLabel
        const bb = tt.textRenderInfo?.blockBounds
        const halfW = bb ? (bb[2] - bb[0]) / 2 : node.title.length * 0.33
        const halfH = bb ? (bb[3] - bb[1]) / 2 : 0.55
        const lift = h * LABEL_HOVER_LIFT - (1 - lt) * LABEL_RISE
        const cur = st.graph.nodes.get(st.currentId)
        const veil = THREE.MathUtils.smoothstep(worldEvents.panelDim, 0.02, 0.45)
        let side = labelSide.current
        let below = 0
        let above = 0
        if (cur && veil > 0.01 && (idleNow || lt > 0.01)) {
          measureContent(state.camera, cur.worldPosition, t)
          lblCenter.copy(node.worldPosition).addScaledVector(camUp, (LABEL_Y + lift - halfH) * ls)
          below = labelOverContent(state.camera, lblCenter, halfW * ls, halfH * ls)
          lblCenter.copy(node.worldPosition).addScaledVector(camUp, (LABEL_ABOVE + lift + halfH) * ls)
          above = labelOverContent(state.camera, lblCenter, halfW * ls, halfH * ls)
          probeA.copy(lblCenter).addScaledVector(camUp, halfH * ls).project(state.camera)
          if (probeA.y > LABEL_TOP_EDGE) above = 1
          if (h < 0.05) {
            if (side === 0 && below > 0.5 && above < 0.05) side = 1
            else if (side === 1 && (below < 0.05 || above > below)) side = 0
          }
        } else if (h < 0.05) {
          side = 0
        }
        if (side !== labelSide.current && o < 0.02) {
          labelSide.current = side
          labelSwap.current = 1
        } else if (side !== labelSide.current) {
          labelSwap.current = Math.max(0, labelSwap.current - dt / LABEL_SWAP)
          if (labelSwap.current === 0) labelSide.current = side
        } else {
          labelSwap.current = Math.min(1, labelSwap.current + dt / LABEL_SWAP)
        }
        lm.position.y = (labelSide.current ? LABEL_ABOVE + 2 * halfH : LABEL_Y) + lift
        o *= 1 - (labelSide.current ? above : below) * veil * (1 - h)
        o *= labelSwap.current * labelSwap.current
        if (cur && o > 0.01) {
          dirSelf.copy(node.worldPosition).sub(state.camera.position).normalize()
          dirCur.copy(cur.worldPosition).sub(state.camera.position).normalize()
          o *= 1 - 0.85 * THREE.MathUtils.smoothstep(dirSelf.dot(dirCur), 0.985, 0.998) * (1 - h)
        }
        tt.fillOpacity = o
        tt.outlineOpacity = o * 0.85
      }
      label.current.visible = o > 0.01
    }
  })

  return (
    <group ref={group} position={node.worldPosition}>
      <mesh
        ref={hit}
        geometry={HIT_GEO}
        visible={false}
        onPointerOver={(e) => {
          if (!canHoverPointer || !interactive) return
          e.stopPropagation()
          setHovered(node.id)
        }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' || e.button !== 0 || !interactive) return
          e.stopPropagation()
          pressed.current = true
          pressT.current = 0
          pressFired.current = false
        }}
        onPointerMove={(e) => {
          if (!canHoverPointer || !interactive) return
          e.stopPropagation()
          if (useStore.getState().hoveredId !== node.id) setHovered(node.id)
        }}
        onPointerOut={() => {
          if (!canHoverPointer) return
          if (useStore.getState().hoveredId !== node.id) return
          setHovered(null)
        }}
        onPointerUp={(e) => {
          if (e.button !== 0) return
          if (input.dragDistance > TAP_SLOP) return
          if (role !== 'reachable') return
          e.stopPropagation()
          if (useStore.getState().hoveredId === node.id) setHovered(null)
          if (e.pointerType === 'touch') navigator.vibrate?.(8)
          travelTo(node.id)
        }}
      />

      {assets && (
        <>
          <mesh ref={crystal} geometry={CRYSTAL_GEO} material={assets.crystalMat} />

          <mesh ref={core} geometry={CORE_GEO} material={assets.coreMat} />

          <points
            ref={motes}
            geometry={assets.moteGeo}
            material={assets.moteMat}
            frustumCulled={false}
          />

          <mesh ref={halo} geometry={QUAD} material={assets.haloMat} frustumCulled={false} />
          {atmoOn && (
            <mesh
              ref={atmo}
              geometry={QUAD}
              material={assets.atmoMat}
              frustumCulled={false}
              renderOrder={ATMOSPHERE_ORDER}
            />
          )}
        </>
      )}

      {role === 'reachable' && (
        <Billboard ref={label}>
          <Text
            ref={labelText}
            position={[0, LABEL_Y - LABEL_RISE, 0]}
            fillOpacity={0}
            outlineOpacity={0}
            fontSize={0.92}
            letterSpacing={0.12}
            color={labelColor}
            anchorX="center"
            anchorY="top"
            font="/fonts/Inter-Regular.woff"
            material-toneMapped={false}
            outlineWidth={0}
            outlineBlur={0.24}
            outlineColor="#05060f"
          >
            {node.title}
          </Text>
        </Billboard>
      )}

    </group>
  )
}
