import { useEffect, useState } from 'react'
import { useStore } from '@/state/store'
import '@/styles/hint.css'

const HINT_MS = 6000
const FADE_MS = 700
const GRACE_MS = 1500

/* Shown on every load; fades after a few seconds or on the first input. */
export default function FirstHint() {
  const coarse = useStore((s) => s.coarse)
  const [mounted, setMounted] = useState(true)

  /* Only drives the fade-OUT; the fade-in is a CSS animation (see hint.css). */
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

    let timer: ReturnType<typeof setTimeout> | undefined
    let graceTimer: ReturnType<typeof setTimeout> | undefined

    const start = () => {
      if (timer) return
      timer = setTimeout(dismiss, HINT_MS)
      // Input only counts once the hint has had time to be read.
      graceTimer = setTimeout(() => {
        addEventListener('pointerdown', dismiss, { passive: true })
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
      // No-ops if the grace period never elapsed and these were never added.
      removeEventListener('pointerdown', dismiss)
      removeEventListener('wheel', dismiss)
      removeEventListener('keydown', dismiss)
    }
  }, [mounted])

  if (!mounted) return null

  return (
    <p className="hint" data-hide={hiding} role="status">
      {coarse ? 'Drag to look · Tap a light to travel' : 'Drag to look · Click a light to travel'}
    </p>
  )
}
