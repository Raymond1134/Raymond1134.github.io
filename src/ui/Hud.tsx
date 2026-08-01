import { useEffect } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useStore } from '@/state/store'
import { neighborsOf } from '@/content/layout'
import { recentre, enableGyro, disableGyro, gyroAvailable } from '@/input/input'
import { BEACON_DEFAULT_COLOR } from '@/scene/beacons/palette'
import '@/styles/hud.css'

/* Distance a drag has to start to count as a swipe-up that opens the weave. */
const EDGE = 56
const SWIPE = 70

export default function Hud() {
  const graph = useStore((s) => s.graph)
  const currentId = useStore((s) => s.currentId)
  const phase = useStore((s) => s.phase)
  const mapOpen = useStore((s) => s.mapOpen)
  const audioEnabled = useStore((s) => s.audioEnabled)
  const gyroEnabled = useStore((s) => s.gyroEnabled)
  const textMode = useStore((s) => s.textMode)
  const coarse = useStore((s) => s.coarse)

  const travelTo = useStore((s) => s.travelTo)
  const toggleMap = useStore((s) => s.toggleMap)
  const toggleAudio = useStore((s) => s.toggleAudio)
  const toggleTextMode = useStore((s) => s.toggleTextMode)

  const parentId = graph.nodes.get(currentId)?.parentId ?? null
  const idle = phase === 'idle'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const s = useStore.getState()

      if (e.key === 'm' || e.key === 'M') return s.toggleMap()
      if (e.key === '0') return recentre()
      if (e.key === 'Escape') {
        if (s.mapOpen) return s.toggleMap()
        const parent = s.graph.nodes.get(s.currentId)?.parentId
        if (parent) s.travelTo(parent)
        return
      }

      const n = Number(e.key)
      if (n >= 1 && n <= 9) {
        const targets = neighborsOf(s.graph, s.currentId)
        if (targets[n - 1]) s.travelTo(targets[n - 1])
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
        data-dimmed={phase === 'turn' || phase === 'flight'}
        style={
          {
            '--hud-accent': graph.nodes.get(currentId)?.color ?? BEACON_DEFAULT_COLOR,
          } as CSSProperties
        }
      >
        <Chip glyph="✦" label="Map" pressed={mapOpen} onClick={toggleMap} />

        <Chip
          glyph="↩"
          label="Back"
          disabled={!parentId || !idle}
          onClick={() => parentId && travelTo(parentId)}
        />

        <Chip glyph="♪" label="Sound" pressed={audioEnabled} onClick={toggleAudio} />

        {coarse && gyroAvailable() && (
          <Chip glyph="◎" label="Tilt" pressed={gyroEnabled} onClick={onTilt} />
        )}

        <Chip glyph="≡" label="Text" pressed={textMode} onClick={toggleTextMode} />
      </nav>

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
  onClick,
}: {
  glyph: ReactNode
  label: string
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      className="hud-chip"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      data-on={pressed || undefined}
    >
      <span className="glyph" aria-hidden>
        {glyph}
      </span>
      {/* The glyph alone means nothing to someone with one chance to get it. */}
      <span className="label">{label}</span>
    </button>
  )
}
