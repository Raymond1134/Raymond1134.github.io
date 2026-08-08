import { Fragment, useEffect, useState } from 'react'
import { useStore } from '@/state/store'
import { input } from '@/input/input'
import '@/styles/hint.css'

const HINT_MS = 9000
const FADE_MS = 700
const GRACE_MS = 1500
const DRAG_PX = 14

export default function FirstHint() {
  const coarse = useStore((s) => s.coarse)
  const [mounted, setMounted] = useState(true)

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

    const start = () => {
      if (timer) return
      timer = setTimeout(dismiss, HINT_MS)
      graceTimer = setTimeout(() => {
        addEventListener('pointerup', onUp, { passive: true })
        addEventListener('wheel', dismiss, { passive: true })
        addEventListener('keydown', dismiss)
      }, GRACE_MS)
    }

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      document.removeEventListener('visibilitychange', onVisible)
      start()
    }

    if (document.visibilityState === 'visible') start()
    else document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearTimeout(timer)
      clearTimeout(graceTimer)
      clearTimeout(unmountTimer)
      document.removeEventListener('visibilitychange', onVisible)
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
