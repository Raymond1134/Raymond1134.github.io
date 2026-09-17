import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import veilVert from '@/shaders/light/flare.vert'
import veilFrag from '@/shaders/light/veil.frag'
import { useStore, TRAVEL, FADE } from '@/state/store'
import { EASE, swellTight } from '@/motion/tokens'
import { VEIL_ORDER } from './renderOrder'
import { NO_COMPOSER } from './composerPolicy'

const TURN_CLOSED = 0.5

const VEIL_CORE = 0.06

const TUNNEL_TURN = 0.3

const TUNNEL_RUSH = 0.26

const FADE_PEAK = 0.5

const VEIL_COLOR = '#080614'

export default function Veil() {
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
        vertexShader: veilVert,
        fragmentShader: veilFrag,
        defines: { PHONE_GRADE: NO_COMPOSER ? 1 : 0 },
        uniforms: {
          uColor: { value: new THREE.Color(VEIL_COLOR) },
          uFlat: { value: 0 },
          uTunnel: { value: 0 },
          uAspect: { value: 1 },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NormalBlending,
        toneMapped: false,
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => {
    const m = mesh.current?.material as THREE.ShaderMaterial | undefined
    if (!m) return
    const s = useStore.getState()

    let flat = 0
    let tunnel = 0
    if (s.phase === 'turn') {
      flat = Math.pow(Math.min(1, s.travelClock / TURN_CLOSED), 5) * VEIL_CORE
      tunnel = EASE.glide(Math.min(1, s.travelClock / TRAVEL.turn)) * TUNNEL_TURN
    } else if (s.phase === 'flight') {
      const ft = THREE.MathUtils.clamp((s.travelClock - TRAVEL.turn) / TRAVEL.flight, 0, 1)
      flat = VEIL_CORE * (1 - EASE.hearth(Math.min(1, ft / 0.6)))
      tunnel = TUNNEL_TURN * (1 - EASE.glide(ft)) + TUNNEL_RUSH * swellTight(ft)
    } else if (s.phase === 'fade') {
      const t = s.travelClock
      flat =
        t < FADE.close
          ? EASE.gather(t / FADE.close) * FADE_PEAK
          : FADE_PEAK * (1 - EASE.hearth(Math.min(1, (t - FADE.close) / (FADE.total - FADE.close))))
    }

    const u = m.uniforms
    u.uFlat.value = flat
    u.uTunnel.value = tunnel
    u.uAspect.value = state.size.width / Math.max(1, state.size.height)
    mesh.current.visible = flat + tunnel > 0.002
  })

  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={VEIL_ORDER}
    />
  )
}
