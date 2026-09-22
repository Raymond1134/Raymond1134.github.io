import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text, Html } from '@react-three/drei'
import * as THREE from 'three'
import panelVert from '@/shaders/holo/panel.vert'
import panelFrag from '@/shaders/holo/panel.frag'
import smokeFrag from '@/shaders/holo/smoke.frag'
import { useStore, FADE } from '@/state/store'
import { input, lookOffset } from '@/input/input'
import { breath } from '@/scene/breath'
import { worldEvents } from '@/scene/worldEvents'
import { NO_COMPOSER } from '@/scene/composerPolicy'
import { LAMBDA, EASE } from '@/motion/tokens'
import { BEACON_DEFAULT_COLOR } from '@/scene/beacons/palette'
import MediaTile from './MediaTile'
import HoloMotes from './HoloMotes'
import { renderInline } from '@/ui/markdown'
import { glyph } from '@/ui/glyphs'
import { panelSizeFor, panelContent, PANEL_Z, PANEL_LIFT } from './panelLayout'
import '@/styles/holo.css'

type Fit = 'card' | 'tall' | 'wide'

const PX_TO_WORLD: Record<Fit, number> = { card: 12 / 400, tall: 0.065, wide: 0.036 }
const CARD_HTML_PX = 560
const SHOW_AT = 0.85

const LOOK_FADE_START = 0.6
const LOOK_FADE_END = 1.4

const GLOW_PAD_W = 20
const GLOW_PAD_H = 14

const HOVER_DIM = 0.55

const CALM = useStore.getState().reducedMotion
const MIST_K = CALM ? 0.3 : 1

const DRAW_TIME = 0.85
const UNFOLD_FROM = CALM ? 1 : 0.955
const TILT_POINTER_X = 0.05
const TILT_POINTER_Y = 0.075
const TILT_GYRO = 0.25

const TITLE_Z = 0.5
const SUB_Z = 0.4
const HTML_Z = 0.25

const MEASURE_EVERY = 0.4
const MEDIA_GAP = 1.2

const proj = new THREE.Vector3()

const STAGGER = { plate: 0, title: 0.18, subtitle: 0.3, motes: 0.38, body: 0.5, media: 0.6 } as const
const WINDOW = 0.42

const reveal = (fade: number, offset: number) =>
  THREE.MathUtils.smoothstep(fade, offset, offset + WINDOW)

interface TroikaText {
  fillOpacity: number
  outlineOpacity: number
  textRenderInfo?: { blockBounds: number[] } | null
}

function putRect(i: number, x0: number, y0: number, x1: number, y1: number, u: number, oy: number) {
  const r = panelContent.rects[i]
  r.x = ((x0 + x1) / 2) * u
  r.y = oy + ((y0 + y1) / 2) * u
  r.hw = ((x1 - x0) / 2) * u
  r.hh = ((y1 - y0) / 2) * u
}

function putText(i: number, mesh: THREE.Mesh | null, x: number, y: number, u: number, oy: number) {
  const bb = (mesh as unknown as TroikaText | null)?.textRenderInfo?.blockBounds
  if (!bb) return i
  putRect(i, x + bb[0], y + bb[1], x + bb[2], y + bb[3], u, oy)
  return i + 1
}

export default function HoloPanel() {
  const node = useStore((s) => s.graph.nodes.get(s.currentId)!)
  const portrait = useStore((s) => s.portrait)
  const compact = useStore((s) => s.compact)

  const { w: PANEL_W, h: PANEL_H } = panelSizeFor(portrait, compact)
  const scale = PANEL_W / 30

  const accent = node.color ?? BEACON_DEFAULT_COLOR
  const accentColor = useMemo(() => new THREE.Color(accent), [accent])

  const fit: Fit = compact ? (portrait ? 'tall' : 'wide') : 'card'
  const textX = -PANEL_W / 2 + 2.2 * scale
  const titleY = PANEL_H / 2 - 2.3 * scale
  const subY = PANEL_H / 2 - 4.7 * scale
  const titleSize = Math.min(2.45 * scale, (PANEL_W - 4.4 * scale) / (node.title.length * 0.6))
  const subSize = node.subtitle
    ? Math.min((fit === 'tall' ? 1.3 : 1.15) * scale, (PANEL_W - 4.4 * scale) / (node.subtitle.length * 0.58))
    : 0

  const pxToWorld = PX_TO_WORLD[fit]
  const htmlPx =
    fit === 'card' ? Math.round(CARD_HTML_PX * scale) : Math.round((PANEL_W - 4.4 * scale) / pxToWorld)
  const htmlWorldW = htmlPx * pxToWorld
  const htmlX = textX + htmlWorldW / 2
  const htmlY =
    fit === 'card' ? -PANEL_H * 0.15 : PANEL_H / 2 - (node.subtitle ? 6.3 : 4.2) * scale
  const linkCount = node.links.length

  const mediaW = fit === 'card' ? 10 : Math.min(PANEL_W - 4.4 * scale, 12)
  const mediaX = fit === 'card' ? PANEL_W / 2 - 6.5 : textX + mediaW / 2
  const mediaY = fit === 'card' ? PANEL_H / 2 - 6 : -mediaW / 3.2
  const mediaStep = fit === 'card' ? 8 : mediaW / 1.6 + 1

  const fadeRef = useRef(0)
  const moteFade = useRef(0)
  const mediaFade = useRef(0)
  const [live, setLive] = useState(() => useStore.getState().phase === 'idle')
  const [htmlLive, setHtmlLive] = useState(false)

  const groupRef = useRef<THREE.Group>(null)
  const innerRef = useRef<THREE.Group>(null)
  const drawT = useRef(0)
  const tilt = useRef({ x: 0, y: 0 })
  const htmlEl = useRef<HTMLDivElement | null>(null)
  const htmlOpacity = useRef(-1)
  const htmlOn = useRef<boolean | null>(null)
  const htmlShown = useRef(false)
  const htmlH = useRef(0)
  const measureIn = useRef(0)
  const mediaRef = useRef<THREE.Group>(null)
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
        uDraw: { value: CALM ? 1 : 0 },
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
        uColor: { value: new THREE.Color(BEACON_DEFAULT_COLOR) },
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

    moteFade.current = reveal(fade, STAGGER.motes)
    mediaFade.current = reveal(fade, STAGGER.media)

    const shouldLive = fade > 0.004 || target > 0
    if (shouldLive !== live) setLive(shouldLive)
    const shouldHtml = fade > 0.02
    if (shouldHtml !== htmlLive) setHtmlLive(shouldHtml)

    const g = groupRef.current
    if (g) g.quaternion.copy(state.camera.quaternion)

    drawT.current = fade < 0.01 ? 0 : Math.min(1, drawT.current + dt / DRAW_TIME)

    const inner = innerRef.current
    if (inner) {
      const open = Math.min(EASE.hearth(drawT.current), EASE.hearth(Math.min(1, fade)))
      const unfold = UNFOLD_FROM + (1 - UNFOLD_FROM) * open
      inner.scale.setScalar(unfold)
      inner.position.set(0, PANEL_H * PANEL_LIFT * unfold, PANEL_Z)
      let tx = 0
      let ty = 0
      if (!CALM && s.phase === 'idle') {
        if (input.gyro) {
          tx = -input.gyro.y * TILT_GYRO
          ty = -input.gyro.x * TILT_GYRO
        } else if (s.hover && input.pointer.active) {
          tx = -input.pointer.y * TILT_POINTER_X
          ty = input.pointer.x * TILT_POINTER_Y
        }
      }
      const tl = tilt.current
      tl.x = THREE.MathUtils.damp(tl.x, tx, LAMBDA.settle, dt)
      tl.y = THREE.MathUtils.damp(tl.y, ty, LAMBDA.settle, dt)
      inner.rotation.set(tl.x, tl.y, 0)
    }

    const mat = materialRef.current
    if (mat) {
      mat.uniforms.uDraw.value = CALM ? 1 : EASE.glide(drawT.current)
      mat.uniforms.uTime.value = state.clock.elapsedTime * MIST_K
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
      ;(smoke.uniforms.uColor.value as THREE.Color).copy(accentColor)
    }

    const efTitle = reveal(fade, STAGGER.title)
    if (titleRef.current) {
      const t = titleRef.current as unknown as TroikaText
      t.fillOpacity = efTitle
      t.outlineOpacity = efTitle * 0.7
      titleRef.current.position.y = titleY - (1 - efTitle) * 0.4
    }
    const efSub = reveal(fade, STAGGER.subtitle)
    if (subRef.current) {
      const t = subRef.current as unknown as TroikaText
      t.fillOpacity = efSub * 0.85
      t.outlineOpacity = efSub * 0.55
      subRef.current.position.y = subY - (1 - efSub) * 0.4
    }

    const el = htmlRef.current
    if (el !== htmlEl.current) {
      htmlEl.current = el
      htmlOpacity.current = -1
      htmlOn.current = null
      htmlShown.current = false
      htmlH.current = 0
      measureIn.current = 0
    }
    if (el) {
      measureIn.current -= dt
      if (measureIn.current <= 0) {
        measureIn.current = MEASURE_EVERY
        htmlH.current = el.offsetHeight
      }
      const o = Math.round(reveal(fade, STAGGER.body) * 500) / 500
      if (o !== htmlOpacity.current) {
        htmlOpacity.current = o
        el.style.opacity = String(o)
      }
      const on = fade > SHOW_AT
      if (on !== htmlOn.current) {
        htmlOn.current = on
        el.classList.toggle('is-live', on)
      }
      if (on && !htmlShown.current) {
        htmlShown.current = true
        el.classList.add('is-shown')
      }
    }

    const htmlWorldH = htmlH.current * pxToWorld
    const mg = mediaRef.current
    if (mg) mg.position.y = fit === 'card' ? 0 : htmlY - htmlWorldH - MEDIA_GAP

    let n = 0
    if (inner && fade > 0.01) {
      const u = inner.scale.x
      const oy = inner.position.y
      n = putText(n, titleRef.current, textX, titleY, u, oy)
      n = putText(n, subRef.current, textX, subY, u, oy)
      if (el && htmlWorldH > 0) {
        const top = fit === 'card' ? htmlY + htmlWorldH / 2 : htmlY
        putRect(n++, htmlX - htmlWorldW / 2, top - htmlWorldH, htmlX + htmlWorldW / 2, top, u, oy)
      }
    }
    panelContent.count = n
  })

  if (!live) return null

  return (
    <group ref={groupRef} position={node.worldPosition}>
      <group ref={innerRef} position={[0, PANEL_H * PANEL_LIFT, PANEL_Z]}>
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
          position={[textX, titleY, TITLE_Z]}
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
            position={[textX, subY, SUB_Z]}
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
            distanceFactor={pxToWorld * 400}
            position={[htmlX, htmlY, HTML_Z]}
            zIndexRange={[20, 0]}
            style={{ width: `${htmlPx}px` }}
            wrapperClass="holo-html"
          >
            <div
              ref={htmlRef}
              className="holo-body"
              data-fit={fit === 'card' ? undefined : fit}
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
                  {node.links.map((l, i) => (
                    <li key={l.url} style={{ '--i': i } as CSSProperties}>
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
                  {node.tags.map((t, i) => (
                    <li key={t} style={{ '--i': linkCount + i } as CSSProperties}>{t}</li>
                  ))}
                </ul>
              )}
            </div>
          </Html>
        )}

        <group ref={mediaRef}>
          <Suspense fallback={null}>
            {node.media.map((m, i) => (
              <MediaTile
                key={m.src}
                media={m}
                position={[mediaX, mediaY - i * mediaStep, 0.3]}
                width={mediaW}
                accent={accentColor}
                fadeRef={mediaFade}
              />
            ))}
          </Suspense>
        </group>
      </group>
    </group>
  )
}
