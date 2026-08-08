import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text, Html } from '@react-three/drei'
import * as THREE from 'three'
import panelVert from '@/shaders/holo/panel.vert'
import panelFrag from '@/shaders/holo/panel.frag'
import smokeFrag from '@/shaders/holo/smoke.frag'
import { useStore, FADE } from '@/state/store'
import { lookOffset } from '@/input/input'
import { breath } from '@/scene/breath'
import { worldEvents } from '@/scene/worldEvents'
import { NO_COMPOSER } from '@/scene/composerPolicy'
import { LAMBDA } from '@/motion/tokens'
import { BEACON_DEFAULT_COLOR } from '@/scene/beacons/palette'
import MediaTile from './MediaTile'
import HoloMotes from './HoloMotes'
import { renderInline } from '@/ui/markdown'
import { glyph } from '@/ui/glyphs'
import { panelSizeFor, PANEL_Z, PANEL_LIFT } from './panelLayout'
import '@/styles/holo.css'

const HTML_DISTANCE = 12
const HTML_PX_TO_WORLD = HTML_DISTANCE / 400

const LOOK_FADE_START = 0.6
const LOOK_FADE_END = 1.4

const GLOW_PAD_W = 20
const GLOW_PAD_H = 14

const HOVER_DIM = 0.55

const proj = new THREE.Vector3()

const STAGGER = { plate: 0, title: 0.18, subtitle: 0.3, motes: 0.38, body: 0.5, media: 0.6 } as const
const WINDOW = 0.42

interface TroikaText {
  fillOpacity: number
  outlineOpacity: number
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
  const moteFade = useRef(0)
  const mediaFade = useRef(0)
  const [live, setLive] = useState(() => useStore.getState().phase === 'idle')
  const [htmlLive, setHtmlLive] = useState(false)

  const groupRef = useRef<THREE.Group>(null)
  const titleRef = useRef<THREE.Mesh>(null)
  const subRef = useRef<THREE.Mesh>(null)
  const htmlRef = useRef<HTMLDivElement>(null)
  const materialRef = useRef<THREE.ShaderMaterial | null>(null)
  const smokeRef = useRef<THREE.ShaderMaterial | null>(null)
  const [mats, setMats] = useState<{ plate: THREE.ShaderMaterial; smoke: THREE.ShaderMaterial } | null>(null)

  useEffect(() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: panelVert,
      fragmentShader: panelFrag,
      defines: { PHONE_GRADE: NO_COMPOSER ? 1 : 0 },
      uniforms: {
        uColor: { value: new THREE.Color(BEACON_DEFAULT_COLOR) },
        uTime: { value: 0 },
        uBreath: { value: 0.5 },
        uOpacity: { value: 0 },
        uSize: { value: new THREE.Vector2(30, 17) },
        uExposure: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    materialRef.current = mat

    const smoke = new THREE.ShaderMaterial({
      vertexShader: panelVert,
      fragmentShader: smokeFrag,
      uniforms: {
        uSize: { value: new THREE.Vector2(30, 17) },
        uOpacity: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      toneMapped: false,
    })
    smokeRef.current = smoke

    setMats({ plate: mat, smoke })
    return () => {
      mat.dispose()
      smoke.dispose()
      materialRef.current = null
      smokeRef.current = null
    }
  }, [])

  useFrame((state, dt) => {
    const s = useStore.getState()

    let target = 0
    if (s.phase === 'idle') {
      const look = lookOffset()
      target = 1 - THREE.MathUtils.smoothstep(look, LOOK_FADE_START, LOOK_FADE_END)
      if (s.hoveredId) {
        const hn = s.graph.nodes.get(s.hoveredId)
        if (hn) {
          proj.copy(hn.worldPosition).project(state.camera)
          if (Math.abs(proj.x) < 0.7 && Math.abs(proj.y) < 1 && proj.z < 1) {
            target = Math.min(target, HOVER_DIM)
          }
        }
      }
    } else if (s.phase === 'settle') {
      target = 1
    } else if (s.phase === 'fade') {
      target = s.travelClock >= FADE.close ? 1 : 0
    }
    target *= worldEvents.panelGate

    const rising = target > fadeRef.current
    const lambda = rising ? LAMBDA.quick : s.phase === 'idle' ? LAMBDA.ease : LAMBDA.quick
    const fade = THREE.MathUtils.damp(fadeRef.current, target, lambda, dt)
    fadeRef.current = fade
    worldEvents.panelDim = fade

    const ef = (offset: number) => THREE.MathUtils.smoothstep(fade, offset, offset + WINDOW)
    moteFade.current = ef(STAGGER.motes)
    mediaFade.current = ef(STAGGER.media)

    const shouldLive = fade > 0.004 || target > 0
    if (shouldLive !== live) setLive(shouldLive)
    const shouldHtml = !compact && fade > 0.02
    if (shouldHtml !== htmlLive) setHtmlLive(shouldHtml)

    const g = groupRef.current
    if (g) g.quaternion.copy(state.camera.quaternion)

    const mat = materialRef.current
    if (mat) {
      mat.uniforms.uTime.value = state.clock.elapsedTime
      mat.uniforms.uBreath.value = breath(state.clock.elapsedTime)
      mat.uniforms.uExposure.value = worldEvents.grade.exposure
      mat.uniforms.uOpacity.value = fade
      ;(mat.uniforms.uColor.value as THREE.Color).copy(accentColor)
      ;(mat.uniforms.uSize.value as THREE.Vector2).set(PANEL_W + GLOW_PAD_W, PANEL_H + GLOW_PAD_H)
    }
    const smoke = smokeRef.current
    if (smoke) {
      smoke.uniforms.uOpacity.value = 0.85 * fade
      ;(smoke.uniforms.uSize.value as THREE.Vector2).set(PANEL_W + GLOW_PAD_W, PANEL_H + GLOW_PAD_H)
    }

    const efTitle = ef(STAGGER.title)
    if (titleRef.current) {
      const t = titleRef.current as unknown as TroikaText
      t.fillOpacity = efTitle
      t.outlineOpacity = efTitle * 0.7
      titleRef.current.position.y = PANEL_H / 2 - 2.3 * scale - (1 - efTitle) * 0.4
    }
    const efSub = ef(STAGGER.subtitle)
    if (subRef.current) {
      const t = subRef.current as unknown as TroikaText
      t.fillOpacity = efSub * 0.85
      t.outlineOpacity = efSub * 0.55
      subRef.current.position.y = PANEL_H / 2 - 4.7 * scale - (1 - efSub) * 0.4
    }

    const el = htmlRef.current
    if (el) {
      el.style.opacity = String(ef(STAGGER.body))
      el.classList.toggle('is-live', fade > 0.85)
    }
  })

  if (!live) return null

  const titleSize = Math.min(2.45 * scale, (PANEL_W - 4.4 * scale) / (node.title.length * 0.6))
  const subSize = node.subtitle
    ? Math.min(1.15 * scale, (PANEL_W - 4.4 * scale) / (node.subtitle.length * 0.58))
    : 0

  const htmlPx = Math.round(560 * scale)
  const htmlWorldW = htmlPx * HTML_PX_TO_WORLD
  const htmlX = -PANEL_W / 2 + 2.2 * scale + htmlWorldW / 2

  return (
    <group ref={groupRef} position={node.worldPosition}>
      <group position={[0, PANEL_H * PANEL_LIFT, PANEL_Z]}>
        {mats && (
          <mesh material={mats.smoke} position={[0, 0, -0.06]} renderOrder={1}>
            <planeGeometry args={[PANEL_W + GLOW_PAD_W, PANEL_H + GLOW_PAD_H]} />
          </mesh>
        )}

        {mats && (
          <mesh material={mats.plate} renderOrder={2}>
            <planeGeometry args={[PANEL_W + GLOW_PAD_W, PANEL_H + GLOW_PAD_H]} />
          </mesh>
        )}

        <HoloMotes width={PANEL_W} height={PANEL_H} accent={accentColor} fadeRef={moteFade} />

        <Text
          ref={titleRef}
          position={[-PANEL_W / 2 + 2.2 * scale, PANEL_H / 2 - 2.3 * scale, 0.05]}
          renderOrder={3}
          anchorX="left"
          anchorY="middle"
          fontSize={titleSize}
          maxWidth={PANEL_W - 4.4 * scale}
          letterSpacing={0.012}
          color={accent}
          material-toneMapped={false}
          fillOpacity={0}
          outlineWidth="4%"
          outlineBlur="10%"
          outlineColor="#04060f"
          outlineOpacity={0}
          font="/fonts/Inter-SemiBold.woff"
        >
          {node.title}
        </Text>

        {node.subtitle && (
          <Text
            ref={subRef}
            position={[-PANEL_W / 2 + 2.2 * scale, PANEL_H / 2 - 4.7 * scale, 0.05]}
            renderOrder={3}
            anchorX="left"
            anchorY="middle"
            fontSize={subSize}
            maxWidth={PANEL_W - 4.4 * scale}
            letterSpacing={0.035}
            color="#b6c8e4"
            material-toneMapped={false}
            fillOpacity={0}
            outlineWidth="6%"
            outlineBlur="18%"
            outlineColor="#04060f"
            outlineOpacity={0}
            font="/fonts/Inter-Regular.woff"
          >
            {node.subtitle}
          </Text>
        )}

        {htmlLive && (
          <Html
            transform
            occlude={false}
            distanceFactor={HTML_DISTANCE}
            position={[htmlX, -PANEL_H * 0.15, 0.05]}
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

        <Suspense fallback={null}>
          {node.media.map((m, i) =>
            compact ? (
              <MediaTile
                key={m.src}
                media={m}
                position={[0, -2 - i * 7, 0.3]}
                width={PANEL_W * 0.72}
                accent={accentColor}
                fadeRef={mediaFade}
              />
            ) : (
              <MediaTile
                key={m.src}
                media={m}
                position={[PANEL_W / 2 - 6.5, PANEL_H / 2 - 6 - i * 8, 0.3]}
                width={10}
                accent={accentColor}
                fadeRef={mediaFade}
              />
            ),
          )}
        </Suspense>
      </group>
    </group>
  )
}
