import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import ribbonVert from '@/shaders/ribbon/ribbon.vert'
import ribbonFrag from '@/shaders/ribbon/ribbon.frag'
import { site } from '@/content'
import { useStore } from '@/state/store'
import type { Quality } from '@/state/store'
import { breath } from './breath'
import { RIBBON_ORDER } from './renderOrder'

/* The silk: a few great torn curtains of cold light winding through the
   beacon band — the weave made physical. One merged geometry, one draw. */

const RIBBON_TIER: Record<Quality, number> = { low: 1, medium: 2, high: 3, ultra: 4 }

const ALONG = 96
const ACROSS = 6

/* Deterministic layout — the silk hangs where it hangs, every visit. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildGeometry(count: number): THREE.BufferGeometry {
  const nodes = [...useStore.getState().graph.nodes.values()]
  const center = new THREE.Vector3()
  for (const n of nodes) center.add(n.worldPosition)
  center.divideScalar(Math.max(1, nodes.length))

  const verts = count * ALONG * ACROSS
  const positions = new Float32Array(verts * 3)
  const alongs = new Float32Array(verts)
  const acrosses = new Float32Array(verts)
  const phases = new Float32Array(verts)
  const index: number[] = []

  const rand = mulberry32(1134)
  const up = new THREE.Vector3(0, 1, 0)
  const tangent = new THREE.Vector3()
  const side = new THREE.Vector3()
  const spine = new THREE.Vector3()
  const next = new THREE.Vector3()

  const arcPoint = (
    out: THREE.Vector3,
    e1: THREE.Vector3,
    e2: THREE.Vector3,
    radius: number,
    wobble: number,
    phi: number,
    theta: number,
  ) =>
    out
      .copy(center)
      .addScaledVector(e1, Math.cos(theta) * radius)
      .addScaledVector(e2, Math.sin(theta) * radius)
      .addScaledVector(up, Math.sin(theta * 2.0 + phi) * wobble)

  let vi = 0
  for (let r = 0; r < count; r++) {
    // A gently tilted plane through the beacon band.
    const tilt = new THREE.Vector3(rand() - 0.5, 1, rand() - 0.5).normalize()
    const e1 = new THREE.Vector3().crossVectors(tilt, new THREE.Vector3(1, 0, 0.3)).normalize()
    const e2 = new THREE.Vector3().crossVectors(tilt, e1).normalize()

    const radius = 100 + rand() * 40
    const theta0 = rand() * Math.PI * 2
    const arc = (1.2 + rand() * 0.8) * (rand() < 0.5 ? -1 : 1)
    const halfWidth = 9 + rand() * 8.5
    const wobble = 14 + rand() * 14
    const phi = rand() * Math.PI * 2
    const phase = rand()

    for (let i = 0; i < ALONG; i++) {
      const along = i / (ALONG - 1)
      const theta = theta0 + arc * along
      arcPoint(spine, e1, e2, radius, wobble, phi, theta)
      arcPoint(next, e1, e2, radius, wobble, phi, theta + arc * 0.01)
      tangent.copy(next).sub(spine).normalize()

      // The curtain hangs: width is near-vertical, twisting slowly.
      side.copy(up).addScaledVector(tangent, -up.dot(tangent)).normalize()
      side.applyAxisAngle(tangent, 0.5 * Math.sin(theta * 2.0 + phi))

      const w = halfWidth * Math.pow(Math.sin(Math.PI * along), 0.7)

      for (let j = 0; j < ACROSS; j++) {
        const across = (j / (ACROSS - 1)) * 2 - 1
        positions[vi * 3 + 0] = spine.x + side.x * across * w
        positions[vi * 3 + 1] = spine.y + side.y * across * w
        positions[vi * 3 + 2] = spine.z + side.z * across * w
        alongs[vi] = along
        acrosses[vi] = across
        phases[vi] = phase
        vi++
      }
    }

    const base = r * ALONG * ACROSS
    for (let i = 0; i < ALONG - 1; i++) {
      for (let j = 0; j < ACROSS - 1; j++) {
        const a = base + i * ACROSS + j
        const b = a + ACROSS
        index.push(a, b, a + 1, b, b + 1, a + 1)
      }
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('aAlong', new THREE.BufferAttribute(alongs, 1))
  geo.setAttribute('aAcross', new THREE.BufferAttribute(acrosses, 1))
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
  geo.setIndex(index)
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4)
  return geo
}

export default function Ribbons() {
  const mesh = useRef<THREE.Mesh>(null!)
  const quality = useStore((s) => s.quality)
  const compact = useStore((s) => s.compact)
  const count = compact ? 1 : RIBBON_TIER[quality]

  const geometry = useMemo(() => buildGeometry(count), [count])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: ribbonVert,
        fragmentShader: ribbonFrag,
        uniforms: {
          uTime: { value: 0 },
          uBreath: { value: 0.5 },
          uCold: { value: new THREE.Color(site.meta.themeColorCold) },
          uMid: { value: new THREE.Color(site.meta.themeColorMid) },
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
  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => {
    const m = mesh.current?.material as THREE.ShaderMaterial | undefined
    if (!m) return
    const t = state.clock.elapsedTime
    m.uniforms.uTime.value = t
    m.uniforms.uBreath.value = breath(t)
  })

  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={RIBBON_ORDER}
    />
  )
}
