import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useStore } from '@/state/store'
import { input, recentre, enableGyro, disableGyro, gyroAvailable, awayOffset, stillFor } from '@/input/input'
import { worldEvents } from '@/scene/worldEvents'
import { playUi } from '@/audio/score'
import { BEACON_DEFAULT_COLOR } from '@/scene/beacons/palette'
import '@/styles/hud.css'

const EDGE = 56
const SWIPE = 70
const SWIPE_MS = 1200
const GYRO_RANGE = 0.55
const LEVEL_PX = 5
const MAP_INVITE_KEY = 'aether.map-invite'

const FIELD = /^(input|textarea|select)$/i

const toggleShortcuts = () => dispatchEvent(new Event('aether:shortcuts'))
const shortcutsOpen = () => !!document.querySelector('#shortcuts:not([data-closing])')

export default function Hud() {
  const graph = useStore((s) => s.graph)
  const currentId = useStore((s) => s.currentId)
  const phase = useStore((s) => s.phase)
  const mapOpen = useStore((s) => s.mapOpen)
  const audioEnabled = useStore((s) => s.audioEnabled)
  const gyroEnabled = useStore((s) => s.gyroEnabled)
  const textMode = useStore((s) => s.textMode)
  const overture = useStore((s) => s.overtureActive)
  const coarse = useStore((s) => s.coarse)
  const calm = useStore((s) => s.reducedMotion)

  const travelTo = useStore((s) => s.travelTo)
  const toggleMap = useStore((s) => s.toggleMap)
  const toggleAudio = useStore((s) => s.toggleAudio)
  const toggleTextMode = useStore((s) => s.toggleTextMode)

  const [invite, setInvite] = useState(false)
  const [mapInvite, setMapInvite] = useState(false)

  const [ghost, setGhost] = useState(false)
  const navRef = useRef<HTMLElement>(null)

  const parentId = graph.nodes.get(currentId)?.parentId ?? null
  const idle = phase === 'idle'
  const accent = { '--hud-accent': graph.nodes.get(currentId)?.color ?? BEACON_DEFAULT_COLOR } as CSSProperties

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t?.isContentEditable || FIELD.test(t?.tagName ?? '')) return
      const s = useStore.getState()
      if (s.textMode) return
      const help = shortcutsOpen()

      if (e.key === '?') return toggleShortcuts()
      if (e.key === 'Escape' && help) return toggleShortcuts()
      if (help) return

      if (e.key === 'm' || e.key === 'M') return s.toggleMap()
      if (e.key === '0') {
        recentre()
        playUi('recentre')
        return
      }
      if (e.key === 'Escape') {
        if (s.mapOpen) return s.toggleMap()
        const parent = s.graph.nodes.get(s.currentId)?.parentId
        if (parent) {
          s.travelTo(parent)
        } else {
          recentre()
          worldEvents.homePulseAt = performance.now()
          playUi('home')
        }
        return
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    const sync = (q: string) => {
      if (root.dataset.q !== q) root.dataset.q = q
    }
    sync(useStore.getState().quality)
    return useStore.subscribe((s) => sync(s.quality))
  }, [])

  useEffect(() => {
    const nav = navRef.current
    if (!coarse || textMode || !nav) return
    let x0 = 0
    let y0 = 0
    let t0 = 0
    let armed = false
    let pull = 0

    const setPull = (v: number) => {
      if (v === pull) return
      if (!pull) nav.dataset.pulling = ''
      if (!v) delete nav.dataset.pulling
      pull = v
      nav.style.setProperty('--pull', String(v))
    }

    const disarm = () => {
      armed = false
      setPull(0)
    }

    const armLine = () => {
      const r = nav.getBoundingClientRect()
      const sab = Math.max(0, (parseFloat(getComputedStyle(nav).paddingBottom) || 0) - 6)
      const edge = innerHeight - EDGE - sab
      const dock = r.bottom >= innerHeight - 1 && r.width > r.height
      return dock ? Math.min(edge, r.top - 8) : edge
    }

    const swiped = (e: PointerEvent) => {
      const up = y0 - e.clientY
      return up > SWIPE && Math.abs(e.clientX - x0) < up * 0.7 && performance.now() - t0 < SWIPE_MS
    }

    const fire = () => {
      disarm()
      if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(8)
      const s = useStore.getState()
      if (!s.mapOpen) s.toggleMap()
    }

    const onDown = (e: PointerEvent) => {
      if (!e.isPrimary) {
        disarm()
        return
      }
      armed = !useStore.getState().mapOpen && !shortcutsOpen() && e.clientY > armLine()
      x0 = e.clientX
      y0 = e.clientY
      t0 = performance.now()
    }

    const onMove = (e: PointerEvent) => {
      if (!armed || !e.isPrimary) return
      const up = y0 - e.clientY
      const across = Math.abs(e.clientX - x0)
      if (across > 28 && across > up) {
        disarm()
        return
      }
      if (swiped(e)) {
        fire()
        return
      }
      setPull(Math.round(Math.min(1, Math.max(0, up / SWIPE)) * 50) / 50)
    }

    const onUp = (e: PointerEvent) => {
      if (!armed || !e.isPrimary) return
      if (swiped(e)) fire()
      else disarm()
    }

    addEventListener('pointerdown', onDown, { passive: true })
    addEventListener('pointermove', onMove, { passive: true })
    addEventListener('pointerup', onUp, { passive: true })
    addEventListener('pointercancel', disarm, { passive: true })
    return () => {
      removeEventListener('pointerdown', onDown)
      removeEventListener('pointermove', onMove)
      removeEventListener('pointerup', onUp)
      removeEventListener('pointercancel', disarm)
      disarm()
    }
  }, [coarse, textMode])

  useEffect(() => {
    const glyph = navRef.current?.querySelector<HTMLElement>("[data-kind='tilt'] .glyph")
    if (!gyroEnabled || calm || textMode || !glyph) return
    let raf = 0
    let gx = 0
    let gy = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const g = input.gyro
      const x = g ? Math.round(Math.max(-1, Math.min(1, g.x / GYRO_RANGE)) * 60) / 60 : 0
      const y = g ? Math.round(Math.max(-1, Math.min(1, g.y / GYRO_RANGE)) * 60) / 60 : 0
      if (x === gx && y === gy) return
      gx = x
      gy = y
      glyph.style.translate = `${(-x * LEVEL_PX).toFixed(2)}px ${(-y * LEVEL_PX).toFixed(2)}px`
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      glyph.style.translate = ''
    }
  }, [gyroEnabled, calm, textMode])

  useEffect(() => {
    if (!coarse) return
    const unsub = useStore.subscribe((s, prev) => {
      if (prev.overtureActive && !s.overtureActive && !s.audioEnabled) {
        setInvite(true)
        setTimeout(() => setInvite(false), 1600)
        unsub()
      }
    })
    return unsub
  }, [coarse])

  useEffect(() => {
    try { if (sessionStorage.getItem(MAP_INVITE_KEY)) return } catch {}
    const unsub = useStore.subscribe((s, prev) => {
      if (prev.phase === 'settle' && s.phase === 'idle' && s.previousId) {
        try { sessionStorage.setItem(MAP_INVITE_KEY, '1') } catch {}
        setMapInvite(true)
        setTimeout(() => setMapInvite(false), 1600)
        unsub()
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    if (textMode) return
    const id = setInterval(() => {
      const s = useStore.getState()
      if (s.phase !== 'idle' || s.mapOpen || s.overtureActive || document.querySelector('.hint')) {
        setGhost(false)
        return
      }
      setGhost(awayOffset() > 0.35 && stillFor() > 4)
    }, 400)
    return () => clearInterval(id)
  }, [textMode])

  const onTilt = () => {
    const s = useStore.getState()
    if (s.gyroEnabled) {
      disableGyro()
      s.setGyro(false)
      return
    }
    enableGyro().then((ok) => useStore.getState().setGyro(ok))
  }

  return (
    <>
      <nav
        ref={navRef}
        className="hud"
        aria-label="Site controls"
        data-dimmed={phase === 'turn' || phase === 'flight' || overture}
        data-text={textMode || undefined}
        style={accent}
      >
        {!textMode && (
          <Chip kind="map" glyph="✦" label="Map" pressed={mapOpen} invite={mapInvite} onClick={toggleMap} />
        )}

        {!textMode && (
          <Chip
            kind="back"
            glyph="↩"
            label="Back"
            disabled={!parentId}
            onClick={() => parentId && travelTo(parentId)}
          />
        )}

        <Chip
          kind="sound"
          glyph="♪"
          label="Sound"
          pressed={audioEnabled}
          invite={invite}
          onClick={() => {
            if (!useStore.getState().audioEnabled) worldEvents.soundGlintAt = performance.now()
            toggleAudio()
          }}
        />

        {coarse && gyroAvailable() && (
          <Chip kind="tilt" glyph="◎" label="Tilt" pressed={gyroEnabled} onClick={onTilt} />
        )}

        <Chip kind="text" glyph="≡" label="Text" pressed={textMode} onClick={toggleTextMode} />

        {!textMode && (
          <Chip kind="help" glyph="?" label={coarse ? 'Help' : 'Keys'} onClick={toggleShortcuts} />
        )}
      </nav>

      {!textMode && ghost && (
        <button
          className="hud-ghost"
          style={accent}
          onClick={() => {
            recentre()
            playUi('recentre')
            setGhost(false)
          }}
        >
          <span aria-hidden>◎</span> recentre
        </button>
      )}

      <div className="sr-only" role="status" aria-live="polite">
        {idle ? `Arrived at ${graph.nodes.get(currentId)?.title ?? ''}` : ''}
      </div>
    </>
  )
}

function Chip({
  kind,
  glyph,
  label,
  pressed,
  disabled,
  invite,
  onClick,
}: {
  kind?: string
  glyph: ReactNode
  label: string
  pressed?: boolean
  disabled?: boolean
  invite?: boolean
  onClick: () => void
}) {
  return (
    <button
      className="hud-chip"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      data-on={pressed || undefined}
      data-invite={invite || undefined}
      data-kind={kind}
    >
      <span className="glyph" aria-hidden>
        {glyph}
      </span>
      <span className="label">{label}</span>
    </button>
  )
}
