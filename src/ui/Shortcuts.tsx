import { Fragment, useEffect, useRef, useState } from 'react'
import { useStore } from '@/state/store'
import '@/styles/shortcuts.css'

const TOGGLE = 'aether:shortcuts'

const KEYS: [string, string][] = [
  ['Esc', 'up a level'],
  ['M', 'the weave'],
  ['0', 'recentre the view'],
  ['?', 'this list'],
]

const GESTURES: [string, string][] = [
  ['Swipe up', 'from the bottom edge, the weave'],
  ['Drag', 'look around'],
  ['Pinch', 'draw closer, or drift back'],
  ['Tap a light', 'travel to it'],
]

export default function Shortcuts() {
  const [open, setOpen] = useState(false)
  const [render, setRender] = useState(false)

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v)
    addEventListener(TOGGLE, onToggle)
    return () => removeEventListener(TOGGLE, onToggle)
  }, [])

  if (open && !render) setRender(true)
  if (!render) return null
  return <Panel closing={!open} onClose={() => setOpen(false)} onGone={() => setRender(false)} />
}

function Panel({
  closing,
  onClose,
  onGone,
}: {
  closing: boolean
  onClose: () => void
  onGone: () => void
}) {
  const coarse = useStore((s) => s.coarse)
  const panelRef = useRef<HTMLDivElement>(null)
  const rows = coarse ? GESTURES : KEYS

  useEffect(() => {
    if (!closing) return
    const id = setTimeout(onGone, 360)
    return () => clearTimeout(id)
  }, [closing, onGone])

  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null
    panelRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      const panel = panelRef.current
      if (e.key !== 'Tab' || !panel) return
      const stops = [...panel.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')]
      if (!stops.length) return

      const first = stops[0]
      const last = stops[stops.length - 1]
      const active = document.activeElement
      if (e.shiftKey ? active === first || active === panel : active === last) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
      }
    }

    addEventListener('keydown', onKey)
    return () => {
      removeEventListener('keydown', onKey)
      returnTo?.focus?.()
    }
  }, [])

  return (
    <div
      id="shortcuts"
      className="shortcuts"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      data-closing={closing || undefined}
      onAnimationEnd={(e) => {
        if (e.animationName === 'shortcuts-out') onGone()
      }}
    >
      <div className="shortcuts-veil" onPointerDown={onClose} />

      <div className="shortcuts-panel" ref={panelRef} tabIndex={-1}>
        <h2 id="shortcuts-title">Finding your way</h2>

        <dl className="shortcuts-keys">
          {rows.map(([key, what]) => (
            <Fragment key={key}>
              <dt>{key}</dt>
              <dd>{what}</dd>
            </Fragment>
          ))}
        </dl>

        <button className="shortcuts-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
