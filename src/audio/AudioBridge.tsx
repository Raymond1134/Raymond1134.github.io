import { useEffect } from 'react'
import { TRAVEL_LANDING, useStore } from '@/state/store'
import {
  audioRunning,
  disposeAudio,
  restoreAudioPreference,
  setAudioEnabled,
  setPageHidden,
  setSpace,
  tryEagerStart,
  unlockAudio,
} from '@/audio/audio'
import type { AudioSpace } from '@/audio/audio'
import {
  approachLanding,
  condensedArrival,
  playHover,
  playLanding,
  playPassage,
  playUi,
  repayIgnition,
  setCurrentIdHint,
} from '@/audio/score'

export default function AudioBridge() {
  useEffect(() => {
    if (restoreAudioPreference()) useStore.setState({ audioEnabled: true })
    setCurrentIdHint(useStore.getState().currentId)
    setPageHidden(document.hidden)
    const spaceOf = (s: { textMode: boolean; mapOpen: boolean }): AudioSpace =>
      s.textMode ? 'text' : s.mapOpen ? 'map' : 'world'
    setSpace(spaceOf(useStore.getState()))
    tryEagerStart()

    const unlock = () => {
      unlockAudio()
      if (!audioRunning()) return
      removeEventListener('pointerdown', unlock)
      removeEventListener('pointerup', unlock)
      removeEventListener('click', unlock)
      removeEventListener('keydown', unlock)
    }
    addEventListener('pointerdown', unlock, { passive: true })
    addEventListener('pointerup', unlock, { passive: true })
    addEventListener('click', unlock)
    addEventListener('keydown', unlock)

    const onVisibility = () => setPageHidden(document.hidden)
    document.addEventListener('visibilitychange', onVisibility)

    let paceAt = 0
    let pace = 1
    const gliding = (p: string) => p === 'turn' || p === 'flight'

    const unsub = useStore.subscribe((s, prev) => {
      if (s.textMode !== prev.textMode || s.mapOpen !== prev.mapOpen) setSpace(spaceOf(s))
      if (s.audioEnabled !== prev.audioEnabled) setAudioEnabled(s.audioEnabled)
      if (s.currentId !== prev.currentId) setCurrentIdHint(s.currentId)
      if (prev.textMode && !s.textMode) repayIgnition()
      if (s.phase === 'turn' && prev.phase !== 'turn') {
        paceAt = performance.now()
        playPassage(s.pendingId)
      }
      if (gliding(s.phase) && gliding(prev.phase) && s.travelClock > prev.travelClock) {
        const at = performance.now()
        const step = (s.travelClock - prev.travelClock) / Math.max(1e-3, (at - paceAt) / 1000)
        pace += (Math.min(1, step) - pace) * 0.5
        paceAt = at
      }
      if (s.phase === 'flight') {
        approachLanding(s.currentId, (TRAVEL_LANDING - s.travelClock) / Math.max(0.2, pace))
      }
      if (s.phase === 'settle' && prev.phase === 'flight') playLanding(s.currentId)
      if (s.phase === 'fade' && prev.phase === 'idle' && s.pendingId) condensedArrival(s.pendingId)
      if (s.hoveredId && s.hoveredId !== prev.hoveredId) playHover(s.hoveredId)
      if (s.queuedId && s.queuedId !== prev.queuedId) playUi('tick')
      if (s.mapOpen !== prev.mapOpen) playUi(s.mapOpen ? 'map-open' : 'map-close')
    })

    return () => {
      removeEventListener('pointerdown', unlock)
      removeEventListener('pointerup', unlock)
      removeEventListener('click', unlock)
      removeEventListener('keydown', unlock)
      document.removeEventListener('visibilitychange', onVisibility)
      unsub()
      disposeAudio()
    }
  }, [])

  return null
}
