import { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'
import type { GraphNode } from '@/content/layout'
import { hash01 } from '@/content/layout'
import { site } from '@/content'
import { useStore, TRAVEL_LANDING } from '@/state/store'
import { input, TAP_SLOP } from '@/input/input'
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
const ROLE_GAIN = { current: 1.0, reachable: 0.85, distant: 0.7 } as const
const HALO_GAIN = { current: 0.55, reachable: 0.68, distant: 0.45 } as const

const PHONE_GLOW_COMP = NO_COMPOSER ? 1.25 : 1

const MOTE_TIER: Record<Quality, number> = { low: 300, medium: 500, high: 800, ultra: 800 }
const ATMO_OPACITY = 0.045
const LABEL_REST = 0.62

const DEEP_TINT = new THREE.Color('#233252')
const WHITE = new THREE.Color('#ffffff')
const dirSelf = new THREE.Vector3()
const dirCur = new THREE.Vector3()

const CLICK_BLUE = new THREE.Color(CLICK_BLUE_HEX)
const CLICK_BLUE_DEEP = new THREE.Color(CLICK_BLUE_DEEP_HEX)

const QUAD = new THREE.PlaneGeometry(2, 2)
QUAD.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5)

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
        uScale: { value: 1 },
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
  const hoverT = useRef(0)
  const hovered = useStore((s) => s.hoveredId === node.id)
  const setHovered = useStore((s) => s.setHovered)
  const travelTo = useStore((s) => s.travelTo)
  const phase = useStore((s) => s.phase)
  const pendingId = useStore((s) => s.pendingId)
  const canHoverPointer = useStore((s) => s.hover)
  const coarse = useStore((s) => s.coarse)
  const compact = useStore((s) => s.compact)
  const quality = useStore((s) => s.quality)
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

  const labelColor = useMemo(() => CLICK_BLUE.clone().lerp(WHITE, 0.62), [])

  const haloCore = useMemo(() => {
    if (role === 'reachable') return CLICK_BLUE.clone().lerp(WHITE, 0.16)
    return color.clone().lerp(WHITE, 0.6)
  }, [color, role])

  const atmoOn =
    !(quality === 'low' || compact) && (quality !== 'medium' || role === 'current')

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

  const interactive = role === 'reachable' && phase === 'idle'

  useFrame((state, rawDt) => {
    if (!assets) return

    const dt = Math.min(rawDt, 1 / 30)
    const t = state.clock.elapsedTime
    const st = useStore.getState()
    const now = performance.now()
    hoverT.current += ((hovered ? 1 : 0) - hoverT.current) * (1 - Math.pow(0.01, dt))
    const h = hoverT.current

    const flicker =
      0.84 +
      0.10 * Math.sin(t * 1.13 + seed) +
      0.06 * Math.sin(t * 2.37 + seed * 2.1) +
      0.04 * Math.sin(t * 0.61 + seed * 3.7)

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

    const isGoal =
      phase === 'turn' ? pendingId === node.id : phase !== 'idle' && role === 'current'
    const landed =
      st.phase === 'settle' && role === 'current' && st.travelClock - TRAVEL_LANDING < 0.15
    const boost = (boostT.current +=
      ((landed ? 2.3 : isGoal ? 1.8 : 1) - boostT.current) * (1 - Math.pow(0.02, dt)))

    queueT.current += ((st.queuedId === node.id ? 1 : 0) - queueT.current) * (1 - Math.pow(0.001, dt))

    const gain =
      ROLE_GAIN[role] * flicker * (1 + h * 1.8) * nearAtt * boost * distAtt * adm * igniteFlare *
      flareBoost * ack * (1 + queueT.current * 0.25) * worldEvents.grade.ignite
    const cm = core.current.material as THREE.ShaderMaterial
    const mm = motes.current.material as THREE.ShaderMaterial

    core.current.scale.setScalar((0.94 + flicker * 0.12) * (1 + h * 0.7))
    cm.uniforms.uIntensity.value = gain
    cm.uniforms.uNucleusGain.value = THREE.MathUtils.lerp(
      LUM.nucleusMin,
      LUM.nucleusMax,
      Math.min(1, h + Math.max(0, boost - 1)),
    )
    cm.uniforms.uTime.value = t
    cm.uniforms.uExposure.value = worldEvents.grade.exposure
    mm.uniforms.uExposure.value = worldEvents.grade.exposure

    const moteFar = 1 - THREE.MathUtils.smoothstep(d, 140, 300)
    motes.current.visible = moteFar > 0.01 && adm > 0.01
    assets.moteGeo.setDrawRange(
      0,
      Math.min(MOTE_COUNT, d < 140 ? MOTE_TIER[quality] : Math.ceil(MOTE_TIER[quality] * 0.3)),
    )

    mm.uniforms.uTime.value = t
    mm.uniforms.uIntensity.value =
      ROLE_GAIN[role] * flicker * MOTE_DENSITY_TRIM * (role === 'distant' ? 0.5 : 1) *
      (1 + h * 0.6) * moteFar * distAtt * adm * boost
    mm.uniforms.uPixelRatio.value = state.gl.getPixelRatio()
    mm.uniforms.uScale.value = 1
    motes.current.scale.setScalar(1 + h * 0.6)

    const outerW = Math.max(HALO_OUTER, d * 0.016)
    const hm = (halo.current.material as THREE.ShaderMaterial).uniforms
    hm.uWorld.value = (outerW / 2) * (1 + h * 0.85)
    hm.uGain.value =
      LUM.halo * HALO_GAIN[role] * PHONE_GLOW_COMP * flicker * (1 + h * 1.5) * nearAtt * boost *
      distAtt * adm * igniteFlare * flareBoost * ack * worldEvents.grade.ignite
    hm.uExposure.value = worldEvents.grade.exposure
    const coolTo = role === 'reachable' ? CLICK_BLUE_DEEP : DEEP_TINT
    ;(hm.uCore.value as THREE.Color).copy(haloCore).lerp(coolTo, 1 - distAtt)
    ;(hm.uEdge.value as THREE.Color).copy(outerColor).lerp(coolTo, 1 - distAtt)

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
    xm.uTime.value = t
    xm.uExposure.value = worldEvents.grade.exposure

    hit.current.scale.setScalar(THREE.MathUtils.clamp(d * TAP_TARGET_FACTOR, 6, 46))

    if (label.current) {
      label.current.scale.setScalar(Math.max(1.1, Math.pow(d, 0.85) * 0.055))

      let o = phase === 'idle' ? (coarse ? 1 : LABEL_REST + (1 - LABEL_REST) * h) : 0
      o *= (1 - 0.45 * THREE.MathUtils.smoothstep(d, 120, 300)) * adm
      if (role !== 'current') {
        const cur = st.graph.nodes.get(st.currentId)
        if (cur) {
          dirSelf.copy(node.worldPosition).sub(state.camera.position).normalize()
          dirCur.copy(cur.worldPosition).sub(state.camera.position).normalize()
          o *= 1 - 0.85 * THREE.MathUtils.smoothstep(dirSelf.dot(dirCur), 0.985, 0.998) * (1 - h)
        }
      }
      label.current.visible = o > 0.01
      if (labelText.current) {
        const tt = labelText.current as unknown as { fillOpacity: number; outlineOpacity: number }
        tt.fillOpacity = o
        tt.outlineOpacity = o * 0.85
      }
    }
  })

  return (
    <group ref={group} position={node.worldPosition}>
      <mesh
        ref={hit}
        visible={false}
        onPointerOver={(e) => {
          if (!canHoverPointer || !interactive) return
          e.stopPropagation()
          setHovered(node.id)
        }}
        onPointerOut={() => {
          if (!canHoverPointer) return
          if (useStore.getState().hoveredId !== node.id) return
          setHovered(null)
        }}
        onPointerUp={(e) => {
          if (input.dragDistance > TAP_SLOP) return
          if (role !== 'reachable') return
          e.stopPropagation()
          if (useStore.getState().hoveredId === node.id) setHovered(null)
          travelTo(node.id)
        }}
      >
        <sphereGeometry args={[1, 12, 12]} />
      </mesh>

      {assets && (
        <>
          <mesh ref={crystal} geometry={CRYSTAL_GEO} material={assets.crystalMat} />

          <mesh ref={core} material={assets.coreMat}>
            <icosahedronGeometry args={[1.45, 3]} />
          </mesh>

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
            position={[0, -2.6, 0]}
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
