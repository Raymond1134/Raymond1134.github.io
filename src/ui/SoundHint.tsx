import { useEffect, useState } from 'react'
import { useStore } from '@/state/store'
import '@/styles/hint.css'

const KEY = 'aether.sound-hint'
const FADE_MS = 700
const SHOW_MS = 8000

export default function SoundHint() {
  const [mounted, setMounted] = useState(false)
  const [hiding, setHiding] = useState(false)

  useEffect(() => {
    let shown = false
    try {
      shown = !!sessionStorage.getItem(KEY)
    } catch {}
    if (shown) return

    let touchedToggle = useStore.getState().audioEnabled

    const unsub = useStore.subscribe((s, prev) => {
      if (s.audioEnabled !== prev.audioEnabled) touchedToggle = true
      if (touchedToggle || s.coarse) return
      if (prev.phase === 'settle' && s.phase === 'idle' && s.previousId) {
        try {
          sessionStorage.setItem(KEY, '1')
        } catch {}
        setMounted(true)
        unsub()
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    if (!mounted) return
    let unmountTimer: ReturnType<typeof setTimeout> | undefined
    const dismiss = () => {
      setHiding(true)
      unmountTimer = setTimeout(() => setMounted(false), FADE_MS)
    }
    const timer = setTimeout(dismiss, SHOW_MS)
    const grace = setTimeout(() => {
      addEventListener('pointerdown', dismiss, { passive: true })
      addEventListener('keydown', dismiss)
    }, 1200)
    return () => {
      clearTimeout(timer)
      clearTimeout(grace)
      clearTimeout(unmountTimer)
      removeEventListener('pointerdown', dismiss)
      removeEventListener('keydown', dismiss)
    }
  }, [mounted])

  if (!mounted) return null

  return (
    <p className="hint" data-hide={hiding} role="status">
      this place has a sound · ♪
    </p>
  )
}
