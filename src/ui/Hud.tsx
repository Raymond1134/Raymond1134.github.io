import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useStore } from '@/state/store'
import { recentre, enableGyro, disableGyro, gyroAvailable, lookOffset, stillFor } from '@/input/input'
import { worldEvents } from '@/scene/worldEvents'
import { playUi } from '@/audio/score'
import { BEACON_DEFAULT_COLOR } from '@/scene/beacons/palette'
import '@/styles/hud.css'

const EDGE = 56
const SWIPE = 70

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

  const travelTo = useStore((s) => s.travelTo)
  const toggleMap = useStore((s) => s.toggleMap)
  const toggleAudio = useStore((s) => s.toggleAudio)
  const toggleTextMode = useStore((s) => s.toggleTextMode)

  const [invite, setInvite] = useState(false)

  const [ghost, setGhost] = useState(false)

  const parentId = graph.nodes.get(currentId)?.parentId ?? null
  const idle = phase === 'idle'

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
    if (!coarse || textMode) return
    let x0 = 0
    let y0 = 0
    let t0 = 0
    let armed = false

    const onDown = (e: PointerEvent) => {
      armed = !useStore.getState().mapOpen && e.clientY > innerHeight - EDGE
      x0 = e.clientX
      y0 = e.clientY
      t0 = performance.now()
    }
    const onUp = (e: PointerEvent) => {
      if (!armed) return
      armed = false
      const up = y0 - e.clientY
      const across = Math.abs(e.clientX - x0)

      if (up > SWIPE && across < up * 0.7 && performance.now() - t0 < 500) {
        useStore.getState().toggleMap()
      }
    }

    addEventListener('pointerdown', onDown, { passive: true })
    addEventListener('pointerup', onUp, { passive: true })
    return () => {
      removeEventListener('pointerdown', onDown)
      removeEventListener('pointerup', onUp)
    }
  }, [coarse, textMode])

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
    if (textMode) return
    const id = setInterval(() => {
      const s = useStore.getState()
      const away = lookOffset() > 0.35
      setGhost(s.phase === 'idle' && !s.mapOpen && away && stillFor() > 4)
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
        className="hud"
        aria-label="Site controls"
        data-dimmed={phase === 'turn' || phase === 'flight' || overture}
        style={
          {
            '--hud-accent': graph.nodes.get(currentId)?.color ?? BEACON_DEFAULT_COLOR,
          } as CSSProperties
        }
      >
        {!textMode && <Chip glyph="✦" label="Map" pressed={mapOpen} onClick={toggleMap} />}

        {!textMode && (
          <Chip
            glyph="↩"
            label="Back"
            disabled={!parentId}
            onClick={() => parentId && travelTo(parentId)}
          />
        )}

        <Chip
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
          <Chip glyph="◎" label="Tilt" pressed={gyroEnabled} onClick={onTilt} />
        )}

        <Chip glyph="≡" label="Text" pressed={textMode} onClick={toggleTextMode} />

        {!textMode && <Chip glyph="?" label={coarse ? 'Help' : 'Keys'} onClick={toggleShortcuts} />}
      </nav>

      {!textMode && ghost && (
        <button
          className="hud-ghost"
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
  glyph,
  label,
  pressed,
  disabled,
  invite,
  onClick,
}: {
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
    >
      <span className="glyph" aria-hidden>
        {glyph}
      </span>
      <span className="label">{label}</span>
    </button>
  )
}
