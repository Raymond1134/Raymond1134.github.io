import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import vaultVert from '@/shaders/env/vault.vert'
import vaultFrag from '@/shaders/env/vault.frag'
import { useStore } from '@/state/store'
import type { Quality } from '@/state/store'
import { breath } from './breath'
import { worldEvents } from './worldEvents'
import { LUM, toLum } from './lightPyramid'
import { VAULT_ORDER } from './renderOrder'
import { NO_COMPOSER } from './composerPolicy'
import { ORACLE_U, ORACLE_V } from './vaultGeom'

const FLOOR_STEPS: Record<Quality, number> = { low: 0, medium: 2, high: 3, ultra: 3 }

const STONE = toLum('#4a5a86', 1)
const GLASS = toLum('#a8d8ff', 1)
const ORACLE = toLum('#ffd9a8', 1)
const RIM = toLum('#ffc98a', 1)
const ABYSS = toLum('#49e0cf', 1)


export default function GreatVault() {
  const mesh = useRef<THREE.Mesh>(null!)
  const quality = useStore((s) => s.quality)
  const compact = useStore((s) => s.compact)
  const tier: Quality = compact ? 'low' : quality

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
        vertexShader: vaultVert,
        fragmentShader: vaultFrag,
        defines: {
          FLOOR_STEPS: FLOOR_STEPS[tier],
          PHONE_GRADE: NO_COMPOSER ? 1 : 0,
          DITHER_K: NO_COMPOSER ? 1.45 : 1.15,
        },
        uniforms: {
          uProjInv: { value: new THREE.Matrix4() },
          uViewInv: { value: new THREE.Matrix4() },
          uTime: { value: 0 },
          uBreath: { value: 0.5 },
          uGlassCol: { value: GLASS },
          uOracleCol: { value: ORACLE },
          uStoneCol: { value: STONE },
          uRimCol: { value: RIM },
          uOracleU: { value: ORACLE_U },
          uOracleV: { value: ORACLE_V },
          uVaultGain: { value: 1 },
          uGlassL: { value: LUM.vaultGlass },
          uApertureL: { value: LUM.aperture },
          uHorizonL: { value: LUM.horizonRim },
          uCrestL: { value: LUM.trenchCrest },
          uAbyssCol: { value: ABYSS },
          uAbyssL: { value: LUM.abyssGlow },
          uExposure: { value: 1 },
          uResolution: { value: new THREE.Vector2(1, 1) },
        },
        transparent: false,
        depthTest: false,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
        toneMapped: false,
      }),
    [tier],
  )
  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => {
    const m = mesh.current?.material as THREE.ShaderMaterial | undefined
    if (!m) return
    const u = m.uniforms
    const cam = state.camera
    const t = state.clock.elapsedTime

    cam.updateMatrixWorld()
    ;(u.uProjInv.value as THREE.Matrix4).copy(cam.projectionMatrixInverse)
    ;(u.uViewInv.value as THREE.Matrix4).copy(cam.matrixWorld)
    u.uTime.value = t
    u.uBreath.value = breath(t)
    u.uVaultGain.value = worldEvents.grade.vault
    u.uExposure.value = worldEvents.grade.exposure
    state.gl.getDrawingBufferSize(u.uResolution.value as THREE.Vector2)
  })

  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={VAULT_ORDER}
    />
  )
}
