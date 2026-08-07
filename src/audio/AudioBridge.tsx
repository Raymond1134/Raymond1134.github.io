import { useEffect } from 'react'
import { useStore } from '@/state/store'
import {
  audioLive,
  disposeAudio,
  restoreAudioPreference,
  setAudioEnabled,
  setPageHidden,
  tryEagerStart,
  unlockAudio,
} from '@/audio/audio'
import {
  condensedArrival,
  playHover,
  playPassage,
  playUi,
  setCurrentIdHint,
} from '@/audio/score'

export default function AudioBridge() {
  useEffect(() => {
    if (restoreAudioPreference()) useStore.setState({ audioEnabled: true })
    setCurrentIdHint(useStore.getState().currentId)
    tryEagerStart()

    const unlock = () => {
      unlockAudio()
      if (!audioLive()) return
      removeEventListener('pointerdown', unlock)
      removeEventListener('keydown', unlock)
    }
    addEventListener('pointerdown', unlock, { passive: true })
    addEventListener('keydown', unlock)

    const onVisibility = () => setPageHidden(document.hidden)
    document.addEventListener('visibilitychange', onVisibility)

    const unsub = useStore.subscribe((s, prev) => {
      if (s.audioEnabled !== prev.audioEnabled) setAudioEnabled(s.audioEnabled)
      if (s.currentId !== prev.currentId) setCurrentIdHint(s.currentId)
      if (s.phase === 'turn' && prev.phase !== 'turn') playPassage(s.pendingId)
      if (s.phase === 'fade' && prev.phase === 'idle' && s.pendingId) condensedArrival(s.pendingId)
      if (s.hoveredId && s.hoveredId !== prev.hoveredId) playHover(s.hoveredId)
      if (s.queuedId && s.queuedId !== prev.queuedId) playUi('tick')
      if (s.mapOpen !== prev.mapOpen) playUi(s.mapOpen ? 'map-open' : 'map-close')
    })

    return () => {
      removeEventListener('pointerdown', unlock)
      removeEventListener('keydown', unlock)
      document.removeEventListener('visibilitychange', onVisibility)
      unsub()
      disposeAudio()
    }
  }, [])

  return null
}
