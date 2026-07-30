import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import motesVert from '@/shaders/holo/motes.vert'
import motesFrag from '@/shaders/holo/motes.frag'
import { PANEL_Z, PANEL_LIFT } from './panelLayout'

const COUNT = 640
const COOL = '#bcd9ff'

interface Props {
  width: number
  height: number
  accent: THREE.Color
  fadeRef: { current: number }
}

interface MoteAssets {
  geo: THREE.BufferGeometry
  mat: THREE.ShaderMaterial
}

function buildAssets(): MoteAssets {
  const seeds = new Float32Array(COUNT * 3)
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random()

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3))
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3))

  const mat = new THREE.ShaderMaterial({
    vertexShader: motesVert,
    fragmentShader: motesFrag,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uSize: { value: new THREE.Vector2(30, 17) },
      uAnchor: { value: new THREE.Vector3() },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uColor: { value: new THREE.Color('#ffffff') },
      uCool: { value: new THREE.Color(COOL) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })

  return { geo, mat }
}

export default function HoloMotes({ width, height, accent, fadeRef }: Props) {
  const points = useRef<THREE.Points>(null)
  const assetsRef = useRef<MoteAssets | null>(null)
  const [assets, setAssets] = useState<MoteAssets | null>(null)

  useEffect(() => {
    const built = buildAssets()
    assetsRef.current = built
    setAssets(built)
    return () => {
      built.geo.dispose()
      built.mat.dispose()
      assetsRef.current = null
    }
  }, [])

  useFrame((state) => {
    const a = assetsRef.current
    if (!a) return

    const fade = fadeRef.current
    if (points.current) points.current.visible = fade > 0.01

    const u = a.mat.uniforms
    u.uTime.value = state.clock.elapsedTime
    u.uOpacity.value = fade
    ;(u.uSize.value as THREE.Vector2).set(width, height)
    ;(u.uAnchor.value as THREE.Vector3).set(0, -height * PANEL_LIFT, -PANEL_Z)
    ;(u.uColor.value as THREE.Color).copy(accent)
    u.uPixelRatio.value = state.gl.getPixelRatio()
  })

  if (!assets) return null

  return <points ref={points} geometry={assets.geo} material={assets.mat} frustumCulled={false} />
}
