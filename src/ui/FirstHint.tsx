import { Fragment, useEffect, useState } from 'react'
import { useStore } from '@/state/store'
import { input } from '@/input/input'
import '@/styles/hint.css'

const KEY = 'aether.first-hint'
const HINT_MS = 9000
const FADE_MS = 700
const GRACE_MS = 1500
const DRAG_PX = 14
const POLL_MS = 400

const seen = () => {
  try {
    return !!sessionStorage.getItem(KEY)
  } catch {
    return false
  }
}

const ready = () =>
  document.visibilityState === 'visible' && !document.getElementById('overture-shroud')

export default function FirstHint() {
  const coarse = useStore((s) => s.coarse)
  const [mounted, setMounted] = useState(() => !seen())

  const [hiding, setHiding] = useState(false)

  useEffect(() => {
    if (!mounted) return
    let unmountTimer: ReturnType<typeof setTimeout> | undefined
    let done = false

    const dismiss = () => {
      if (done) return
      done = true

      setHiding(true)
      unmountTimer = setTimeout(() => setMounted(false), FADE_MS)
    }

    const onUp = () => {
      if (input.dragDistance > DRAG_PX) dismiss()
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    let graceTimer: ReturnType<typeof setTimeout> | undefined
    let poll: ReturnType<typeof setInterval> | undefined

    const unsub = useStore.subscribe((s, prev) => {
      if (!timer) return
      if ((prev.phase === 'idle' && s.phase !== 'idle') || (s.mapOpen && !prev.mapOpen)) dismiss()
    })

    const start = () => {
      if (timer || !ready()) return
      clearInterval(poll)
      timer = setTimeout(dismiss, HINT_MS)
      try {
        sessionStorage.setItem(KEY, '1')
      } catch {}
      graceTimer = setTimeout(() => {
        addEventListener('pointerup', onUp, { passive: true })
        addEventListener('wheel', dismiss, { passive: true })
        addEventListener('keydown', dismiss)
      }, GRACE_MS)
    }

    start()
    if (!timer) poll = setInterval(start, POLL_MS)

    return () => {
      unsub()
      clearTimeout(timer)
      clearTimeout(graceTimer)
      clearTimeout(unmountTimer)
      clearInterval(poll)
      removeEventListener('pointerup', onUp)
      removeEventListener('wheel', dismiss)
      removeEventListener('keydown', dismiss)
    }
  }, [mounted])

  if (!mounted) return null

  const segs = coarse
    ? ['Drag to look around', 'Tap a nearby named light to travel', 'Swipe up for the map']
    : ['Drag to look around', 'Click a nearby named light to travel', 'M opens the map']

  return (
    <div className="hint" data-hide={hiding} role="status">
      <p className="hint-text">
        {segs.map((seg, i) => (
          <Fragment key={seg}>
            {i > 0 && ' · '}
            <span className="hint-seg">{seg}</span>
          </Fragment>
        ))}
      </p>
    </div>
  )
}
