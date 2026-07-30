import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text, Html } from '@react-three/drei'
import * as THREE from 'three'
import panelVert from '@/shaders/holo/panel.vert'
import panelFrag from '@/shaders/holo/panel.frag'
import { useStore } from '@/state/store'
import { input } from '@/input/input'
import { BEACON_DEFAULT_COLOR } from '@/scene/beacons/palette'
import MediaTile from './MediaTile'
import HoloMotes from './HoloMotes'
import { renderInline } from '@/ui/markdown'
import { glyph } from '@/ui/glyphs'
import { panelSizeFor, PANEL_Z, PANEL_LIFT } from './panelLayout'
import '@/styles/holo.css'

const HTML_DISTANCE = 12
const HTML_PX_TO_WORLD = HTML_DISTANCE / 400
const LOOK_FADE_START = 0.14
const LOOK_FADE_END = 0.6

/* Ghost opacity while the user is weighing another beacon. */
const HOVER_GHOST = 0.15

const DAMP_OUT = 7
const DAMP_IN = 3.2
const FACE_DAMP = 0.001

const tmpM = new THREE.Matrix4()
const faceQuat = new THREE.Quaternion()
const WORLD_UP = new THREE.Vector3(0, 1, 0)

interface TroikaText {
  fillOpacity: number
}

export default function HoloPanel() {
  const node = useStore((s) => s.graph.nodes.get(s.currentId)!)
  const compact = useStore((s) => s.compact)
  const portrait = useStore((s) => s.portrait)

  const { w: PANEL_W, h: PANEL_H } = panelSizeFor(compact, portrait)
  const scale = PANEL_W / 30

  const accent = node.color ?? BEACON_DEFAULT_COLOR
  const accentColor = useMemo(() => new THREE.Color(accent), [accent])

  const fadeRef = useRef(0)
  const [live, setLive] = useState(() => useStore.getState().phase === 'idle')
  const [htmlLive, setHtmlLive] = useState(false)

  const groupRef = useRef<THREE.Group>(null)
  const titleRef = useRef<THREE.Mesh>(null)
  const subRef = useRef<THREE.Mesh>(null)
  const htmlRef = useRef<HTMLDivElement>(null)
  const materialRef = useRef<THREE.ShaderMaterial | null>(null)
  const [material, setMaterial] = useState<THREE.ShaderMaterial | null>(null)

  useEffect(() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: panelVert,
      fragmentShader: panelFrag,
      uniforms: {
        uColor: { value: new THREE.Color(BEACON_DEFAULT_COLOR) },
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uSize: { value: new THREE.Vector2(30, 17) },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    materialRef.current = mat

    setMaterial(mat)
    return () => {
      mat.dispose()
      materialRef.current = null
    }
  }, [])

  useFrame((state, dt) => {
    const s = useStore.getState()

    let target = 0
    if (s.phase === 'idle') {
      const look = Math.hypot(input.look.yaw, input.look.pitch)
      target = 1 - THREE.MathUtils.smoothstep(look, LOOK_FADE_START, LOOK_FADE_END)
      if (s.hoveredId) target = Math.min(target, HOVER_GHOST)
    }

    const fade = THREE.MathUtils.damp(
      fadeRef.current,
      target,
      target > fadeRef.current ? DAMP_IN : DAMP_OUT,
      dt,
    )
    fadeRef.current = fade

    const shouldLive = fade > 0.004 || target > 0
    if (shouldLive !== live) setLive(shouldLive)
    const shouldHtml = !compact && fade > 0.02
    if (shouldHtml !== htmlLive) setHtmlLive(shouldHtml)

    const g = groupRef.current
    if (g) {
      tmpM.lookAt(state.camera.position, node.worldPosition, WORLD_UP)
      faceQuat.setFromRotationMatrix(tmpM)
      if (fade < 0.02) g.quaternion.copy(faceQuat)
      else g.quaternion.slerp(faceQuat, 1 - Math.pow(FACE_DAMP, dt))
    }

    const mat = materialRef.current
    if (mat) {
      mat.uniforms.uTime.value = state.clock.elapsedTime
      mat.uniforms.uOpacity.value = fade
      ;(mat.uniforms.uColor.value as THREE.Color).copy(accentColor)
      ;(mat.uniforms.uSize.value as THREE.Vector2).set(PANEL_W, PANEL_H)
    }

    if (titleRef.current) (titleRef.current as unknown as TroikaText).fillOpacity = fade
    if (subRef.current) (subRef.current as unknown as TroikaText).fillOpacity = fade * 0.85

    const el = htmlRef.current
    if (el) {
      el.style.opacity = String(fade)
      el.classList.toggle('is-live', fade > 0.85)
    }
  })

  if (!live) return null

  const htmlPx = Math.round(520 * scale)
  const htmlWorldW = htmlPx * HTML_PX_TO_WORLD
  const htmlX = -PANEL_W / 2 + 1.4 * scale + htmlWorldW / 2

  return (
    <group ref={groupRef} position={node.worldPosition}>
      <group position={[0, PANEL_H * PANEL_LIFT, PANEL_Z]}>
        {/* aura plate */}
        {material && (
          <mesh material={material}>
            <planeGeometry args={[PANEL_W, PANEL_H]} />
          </mesh>
        )}

        <HoloMotes width={PANEL_W} height={PANEL_H} accent={accentColor} fadeRef={fadeRef} />

        <Text
          ref={titleRef}
          position={[-PANEL_W / 2 + 1.4 * scale, PANEL_H / 2 - 2.2 * scale, 0.05]}
          anchorX="left"
          anchorY="middle"
          fontSize={2.1 * scale}
          maxWidth={PANEL_W - 2.8 * scale}
          letterSpacing={0.02}
          color={accent}
          material-toneMapped={false}
          fillOpacity={0}
          font="/fonts/Inter-SemiBold.woff"
        >
          {node.title}
        </Text>

        {node.subtitle && (
          <Text
            ref={subRef}
            position={[-PANEL_W / 2 + 1.4 * scale, PANEL_H / 2 - 4.5 * scale, 0.05]}
            anchorX="left"
            anchorY="middle"
            fontSize={0.95 * scale}
            maxWidth={PANEL_W - 2.8 * scale}
            color="#9fb6d8"
            material-toneMapped={false}
            fillOpacity={0}
            font="/fonts/Inter-Regular.woff"
          >
            {node.subtitle}
          </Text>
        )}

        {/* On a phone the body and links live in the bottom sheet instead. */}
        {htmlLive && (
          <Html
            transform
            occlude={false}
            distanceFactor={HTML_DISTANCE}
            position={[htmlX, -PANEL_H * 0.08, 0.05]}
            zIndexRange={[20, 0]}
            style={{ width: `${htmlPx}px` }}
            wrapperClass="holo-html"
          >
            <div
              ref={htmlRef}
              className="holo-body"
              style={{ opacity: 0, '--holo-accent': accent } as CSSProperties}
            >
              {node.body && (
                <div className="holo-copy selectable">
                  {node.body.split('\n\n').map((p, i) => (
                    <p key={i} dangerouslySetInnerHTML={{ __html: renderInline(p) }} />
                  ))}
                </div>
              )}

              {node.links.length > 0 && (
                <ul className="holo-links">
                  {node.links.map((l) => (
                    <li key={l.url}>
                      <a
                        href={l.url}
                        target={l.url.startsWith('http') ? '_blank' : undefined}
                        rel="noreferrer noopener"
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <span className="glyph" aria-hidden>{glyph(l.icon)}</span>
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              )}

              {node.tags.length > 0 && (
                <ul className="holo-tags">
                  {node.tags.map((t) => <li key={t}>{t}</li>)}
                </ul>
              )}
            </div>
          </Html>
        )}

        {/* Media floats as textured planes in 3D. */}
        <Suspense fallback={null}>
          {node.media.map((m, i) =>
            compact ? (
              <MediaTile
                key={m.src}
                media={m}
                position={[0, -2 - i * 7, 0.3]}
                width={PANEL_W * 0.72}
                accent={accentColor}
                fadeRef={fadeRef}
              />
            ) : (
              <MediaTile
                key={m.src}
                media={m}
                position={[PANEL_W / 2 - 6.5, PANEL_H / 2 - 6 - i * 8, 0.3]}
                width={10}
                accent={accentColor}
                fadeRef={fadeRef}
              />
            ),
          )}
        </Suspense>
      </group>
    </group>
  )
}
