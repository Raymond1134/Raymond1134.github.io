import { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'
import type { GraphNode } from '@/content/layout'
import { hash01 } from '@/content/layout'
import { site } from '@/content'
import { useStore } from '@/state/store'
import { input, TAP_SLOP } from '@/input/input'
import beaconVert from '@/shaders/beacon/beacon.vert'
import coreFrag from '@/shaders/beacon/core.frag'
import motesVert from '@/shaders/beacon/motes.vert'
import motesFrag from '@/shaders/beacon/motes.frag'
import { glowTexture, chromaticGlowTexture } from '@/scene/glowTexture'
import { ATMOSPHERE_ORDER } from '@/scene/renderOrder'
import { BEACON_DEFAULT_COLOR } from './palette'
import type { Quality } from '@/state/store'

const TAP_TARGET_FACTOR = 0.11

/* Lights are this many times their size out in the world; the one you are visiting eases back down */
const BEACON_SCALE = 2.5

const NUCLEUS_COLOR = '#fff4e2'
const MOTE_COUNT = 800

const CLUSTER_COLORS = [
  '#ffd0a6', // orange
  '#ffe4b8', // pale gold
  '#ffd9c9', // peach
  '#f0c8e8', // rose
  '#cfd4f2', // lavender-white
] as const

const CLUSTERS = CLUSTER_COLORS.length
const ORBIT_RADIUS = 1.85
const MOTE_DENSITY_TRIM = 0.95

const ROLE_GAIN = { current: 0.8, reachable: 0.9, distant: 0.45 } as const
const HALO_GAIN = { current: 0.29, reachable: 0.6, distant: 0.3 } as const
const MOTE_TIER: Record<Quality, number> = { low: 300, medium: 500, high: 800, ultra: 800 }
const ATMO_OPACITY = 0.045
const LABEL_REST = 0.62

interface Props {
  node: GraphNode
  role: 'current' | 'reachable' | 'distant'
}

interface BeaconAssets {
  coreMat: THREE.ShaderMaterial
  moteMat: THREE.ShaderMaterial
  moteGeo: THREE.BufferGeometry
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
  const palette = CLUSTER_COLORS.map((hex) => new THREE.Color(hex))

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
      uniforms: {
        uCore: { value: new THREE.Color(NUCLEUS_COLOR) },
        uEdge: { value: color },
        uOuter: { value: new THREE.Color(site.meta.themeColorHot) },
        uIntensity: { value: 1 },
        uTime: { value: 0 },
      },
      ...shared,
    }),
    moteMat: new THREE.ShaderMaterial({
      vertexShader: motesVert,
      fragmentShader: motesFrag,
      uniforms: {
        uTime: { value: 0 },
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
  }
}

export default function Beacon({ node, role }: Props) {
  const group = useRef<THREE.Group>(null!)
  const scaleT = useRef(role === 'current' ? 1 : BEACON_SCALE)
  const prevRole = useRef(role)
  const boostT = useRef(1)
  const core = useRef<THREE.Mesh>(null!)
  const motes = useRef<THREE.Points>(null!)
  const glowInner = useRef<THREE.Sprite>(null!)
  const glowOuter = useRef<THREE.Sprite>(null!)
  const atmo = useRef<THREE.Sprite>(null!)
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

  const outerColor = useMemo(
    () => color.clone().lerp(new THREE.Color(site.meta.themeColorHot), 0.85),
    [color],
  )

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
    }
  }, [color, coolColor, clusterSeed, node.id])

  useEffect(() => {
    assets?.moteGeo.setDrawRange(0, Math.min(MOTE_COUNT, MOTE_TIER[quality]))
  }, [assets, quality])

  /* Only reachable beacons respond. */
  const interactive = role === 'reachable' && phase === 'idle'

  useFrame((state, rawDt) => {
    // Null for the first frame, until the effect above has run. The visual
    // children aren't mounted yet either, so their refs are still empty.
    if (!assets) return

    const dt = Math.min(rawDt, 1 / 30)
    const t = state.clock.elapsedTime
    hoverT.current += ((hovered ? 1 : 0) - hoverT.current) * (1 - Math.pow(0.01, dt))
    const h = hoverT.current

    if (prevRole.current !== role) {
      if (phase === 'idle') scaleT.current = role === 'current' ? 1 : BEACON_SCALE
      prevRole.current = role
    }
    const sc = (scaleT.current +=
      ((role === 'current' ? 1 : BEACON_SCALE) - scaleT.current) * (1 - Math.pow(0.02, dt)))
    group.current.scale.setScalar(sc)

    const flicker =
      0.84 +
      0.10 * Math.sin(t * 1.13 + seed) +
      0.06 * Math.sin(t * 2.37 + seed * 2.1) +
      0.04 * Math.sin(t * 0.61 + seed * 3.7)

    const d = state.camera.position.distanceTo(node.worldPosition)
    const nearAtt = THREE.MathUtils.smoothstep(d, 3, 10)

    const isGoal =
      phase === 'turn' ? pendingId === node.id : phase !== 'idle' && role === 'current'
    const boost = (boostT.current +=
      ((isGoal ? 1.8 : 1) - boostT.current) * (1 - Math.pow(0.02, dt)))

    const gain = ROLE_GAIN[role] * flicker * (1 + h * 1.8) * nearAtt * boost
    const cm = core.current.material as THREE.ShaderMaterial
    const mm = motes.current.material as THREE.ShaderMaterial

    core.current.scale.setScalar((0.94 + flicker * 0.12) * (1 + h * 0.7))
    cm.uniforms.uIntensity.value = gain
    cm.uniforms.uTime.value = t

    const farAtt = 1 - THREE.MathUtils.smoothstep(d, 400, 500)
    motes.current.visible = farAtt > 0.01

    mm.uniforms.uTime.value = t
    mm.uniforms.uIntensity.value =
      gain * MOTE_DENSITY_TRIM * (role === 'distant' ? 0.5 : 1) * (1 + h * 0.6) * farAtt
    mm.uniforms.uPixelRatio.value = state.gl.getPixelRatio()
    mm.uniforms.uScale.value = sc
    motes.current.scale.setScalar(1 + h * 0.6)

    const base = THREE.MathUtils.clamp(0.27 * Math.pow(d, 0.7), 1.0, 26)
    glowInner.current.scale.setScalar(base * 0.4 * (1 + h * 0.6))
    glowOuter.current.scale.setScalar(base * 1.25 * (1 + h * 0.85))
    ;(glowInner.current.material as THREE.SpriteMaterial).opacity =
      HALO_GAIN[role] * flicker * (1 + h * 1.5) * nearAtt * boost
    ;(glowOuter.current.material as THREE.SpriteMaterial).opacity =
      HALO_GAIN[role] * 0.2 * flicker * (1 + h * 1.5) * nearAtt * boost

    if (atmo.current) {
      atmo.current.scale.setScalar(base * 3.2)
      ;(atmo.current.material as THREE.SpriteMaterial).opacity =
        ATMO_OPACITY * (0.88 + 0.12 * flicker) * nearAtt
    }

    hit.current.scale.setScalar(THREE.MathUtils.clamp(d * TAP_TARGET_FACTOR, 6, 46) / sc)

    if (label.current) {
      label.current.scale.setScalar(Math.max(1.1, d * 0.028) / sc)

      const o = phase === 'idle' ? (coarse ? 1 : LABEL_REST + (1 - LABEL_REST) * h) : 0
      label.current.visible = o > 0.01
      if (labelText.current) {
        const tt = labelText.current as unknown as { fillOpacity: number; outlineOpacity: number }
        tt.fillOpacity = o
        tt.outlineOpacity = Math.min(1, o * 1.5)
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
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          if (!canHoverPointer) return
          if (useStore.getState().hoveredId !== node.id) return
          setHovered(null)
          document.body.style.cursor = ''
        }}
        onPointerUp={(e) => {
          if (!interactive) return
          if (input.dragDistance > TAP_SLOP) return
          e.stopPropagation()
          setHovered(null)
          travelTo(node.id)
        }}
      >
        <sphereGeometry args={[1, 12, 12]} />
      </mesh>

      {assets && (
        <>
          <mesh ref={core} material={assets.coreMat}>
            <icosahedronGeometry args={[1.45, 3]} />
          </mesh>

          <points
            ref={motes}
            geometry={assets.moteGeo}
            material={assets.moteMat}
            frustumCulled={false}
          />
        </>
      )}

      {/* Only reachable beacons are labelled */}
      {role === 'reachable' && (
        <Billboard ref={label}>
          <Text
            ref={labelText}
            position={[0, -2.6, 0]}
            fontSize={1}
            color={color}
            anchorX="center"
            anchorY="top"
            /* Local font: troika's default is fetched from a Google CDN. */
            font="/fonts/Inter-SemiBold.woff"
            material-toneMapped={false}
            outlineWidth={0.06}
            /* Keeps it legible against a bright particle stream. */
            outlineColor="#03040a"
          >
            {node.title}
          </Text>
        </Billboard>
      )}

      {/* The bake carries the colour ramp; the material stays white. */}
      <sprite ref={glowOuter}>
        <spriteMaterial
          map={chromaticGlowTexture(outerColor)}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          fog={false}
        />
      </sprite>
      <sprite ref={glowInner}>
        <spriteMaterial
          map={chromaticGlowTexture(color)}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          fog={false}
        />
      </sprite>
      {atmoOn && (
        <sprite ref={atmo} renderOrder={ATMOSPHERE_ORDER}>
          <spriteMaterial
            map={glowTexture()}
            color={atmoColor}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
            fog={false}
          />
        </sprite>
      )}
    </group>
  )
}
