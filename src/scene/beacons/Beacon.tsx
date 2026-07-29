import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
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

const TAP_TARGET_FACTOR = 0.11


const DEFAULT_COLOR = '#ffd9a0'
const NUCLEUS_COLOR = '#fff4e2'
const MOTE_COUNT = 180

const CLUSTER_COLORS = [
  '#ffb673', // orange
  '#ffe294', // yellow
  '#ff9fdd', // pink
  '#c19fff', // purple
  '#88c1ff', // blue
] as const

const CLUSTERS = CLUSTER_COLORS.length
const ORBIT_RADIUS = 3.45
const MOTE_DENSITY_TRIM = 0.95

const ROLE_GAIN = { current: 0.8, reachable: 0.9, distant: 0.45 } as const
const HALO_GAIN = { current: 0.34, reachable: 0.7, distant: 0.35 } as const

interface Props {
  node: GraphNode
  role: 'current' | 'reachable' | 'distant'
}

export default function Beacon({ node, role }: Props) {
  const core = useRef<THREE.Mesh>(null!)
  const motes = useRef<THREE.Points>(null!)
  const glowInner = useRef<THREE.Sprite>(null!)
  const glowOuter = useRef<THREE.Sprite>(null!)
  const hit = useRef<THREE.Mesh>(null!)
  const hoverT = useRef(0)
  const hovered = useStore((s) => s.hoveredId === node.id)
  const setHovered = useStore((s) => s.setHovered)
  const travelTo = useStore((s) => s.travelTo)
  const phase = useStore((s) => s.phase)
  const canHoverPointer = useStore((s) => s.hover)
  const color = useMemo(() => new THREE.Color(node.color ?? DEFAULT_COLOR), [node.color])

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

  const clusterSeed = useMemo(() => hash01(node.id, 41) * 97.3, [node.id])
  const seed = useMemo(() => hash01(node.id, 7) * Math.PI * 2, [node.id])

  const { coreMat, moteMat, moteGeo } = useMemo(() => {
    const shared = {
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }

    const seeds = new Float32Array(MOTE_COUNT * 3)
    for (let i = 0; i < seeds.length; i++) seeds[i] = hash01(node.id, 100 + i)

    const clusters = new Float32Array(MOTE_COUNT)
    const trails = new Float32Array(MOTE_COUNT)
    const colors = new Float32Array(MOTE_COUNT * 3)
    const palette = CLUSTER_COLORS.map((hex) => new THREE.Color(hex))

    for (let i = 0; i < MOTE_COUNT; i++) {
      const c = i % CLUSTERS
      clusters[i] = c
      trails[i] = hash01(node.id, 5000 + i)
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
        },
        ...shared,
      }),
      moteGeo: geo,
    }
  }, [color, coolColor, clusterSeed, node.id])

  useEffect(
    () => () => {
      coreMat.dispose()
      moteMat.dispose()
      moteGeo.dispose()
    },
    [coreMat, moteMat, moteGeo],
  )

  /* Only reachable beacons respond. */
  const interactive = role === 'reachable' && phase === 'idle'

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const t = state.clock.elapsedTime
    hoverT.current += ((hovered ? 1 : 0) - hoverT.current) * (1 - Math.pow(0.01, dt))
    const h = hoverT.current

    const flicker =
      0.84 +
      0.10 * Math.sin(t * 1.13 + seed) +
      0.06 * Math.sin(t * 2.37 + seed * 2.1) +
      0.04 * Math.sin(t * 0.61 + seed * 3.7)

    const gain = ROLE_GAIN[role] * flicker * (1 + h * 1.8)
    const cm = core.current.material as THREE.ShaderMaterial
    const mm = motes.current.material as THREE.ShaderMaterial

    core.current.scale.setScalar((0.94 + flicker * 0.12) * (1 + h * 0.7))
    cm.uniforms.uIntensity.value = gain
    cm.uniforms.uTime.value = t

    mm.uniforms.uTime.value = t
    mm.uniforms.uIntensity.value = gain * MOTE_DENSITY_TRIM * (role === 'distant' ? 0.5 : 1) * (1 + h * 0.6)
    motes.current.scale.setScalar(1 + h * 0.6)

    const d = state.camera.position.distanceTo(node.worldPosition)
    const base = THREE.MathUtils.clamp(0.27 * Math.pow(d, 0.7), 1.0, 26)
    glowInner.current.scale.setScalar(base * 0.4 * (1 + h * 0.6))
    glowOuter.current.scale.setScalar(base * 1.25 * (1 + h * 0.85))
    ;(glowInner.current.material as THREE.SpriteMaterial).opacity =
      HALO_GAIN[role] * flicker * (1 + h * 1.5)
    ;(glowOuter.current.material as THREE.SpriteMaterial).opacity =
      HALO_GAIN[role] * 0.2 * flicker * (1 + h * 1.5)
    hit.current.scale.setScalar(THREE.MathUtils.clamp(d * TAP_TARGET_FACTOR, 6, 46))
  })

  return (
    <group position={node.worldPosition}>
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

      <mesh ref={core} material={coreMat}>
        <icosahedronGeometry args={[1.45, 3]} />
      </mesh>

      <points ref={motes} geometry={moteGeo} material={moteMat} frustumCulled={false} />

      <sprite ref={glowOuter}>
        <spriteMaterial
          map={glowTexture()}
          color={outerColor}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          fog={false}
        />
      </sprite>
      <sprite ref={glowInner}>
        <spriteMaterial
          map={glowTexture()}
          color={color}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          fog={false}
        />
      </sprite>
    </group>
  )
}

let glowTex: THREE.Texture | null = null
function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex
  const s = 128
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0.0, 'rgba(255,255,255,1)')
  g.addColorStop(0.08, 'rgba(255,255,255,0.8)')
  g.addColorStop(0.22, 'rgba(255,255,255,0.3)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.07)')
  g.addColorStop(0.78, 'rgba(255,255,255,0.015)')
  g.addColorStop(1.0, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
  glowTex = new THREE.CanvasTexture(c)
  glowTex.colorSpace = THREE.SRGBColorSpace
  return glowTex
}
