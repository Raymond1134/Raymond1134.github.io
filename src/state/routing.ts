import { useEffect } from 'react'
import { useStore } from './store'
import { site } from '@/content'
import { BEACON_DEFAULT_COLOR } from '@/scene/beacons/palette'

const VOID = '#03040a'
const BAR_TINT = 0.18

const idFromHash = () => {
  try {
    return decodeURIComponent(location.hash.replace(/^#\/?/, '')).trim()
  } catch {
    return ''
  }
}

const titleFor = (id: string) => {
  const node = useStore.getState().graph.nodes.get(id)
  return !node || id === site.root ? site.meta.name : `${node.title} · ${site.meta.name}`
}

const colorFor = (id: string) => useStore.getState().graph.nodes.get(id)?.color ?? BEACON_DEFAULT_COLOR

const channels = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const mix = (from: string, to: string, k: number) => {
  const a = channels(from)
  const b = channels(to)
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, '0')).join('')
}

const iconFor = (color: string) =>
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<defs><radialGradient id="glow" cx="50%" cy="50%" r="50%">' +
      `<stop offset="0%" stop-color="${mix(color, '#ffffff', 0.45)}"/>` +
      `<stop offset="28%" stop-color="${color}" stop-opacity="0.85"/>` +
      '<stop offset="62%" stop-color="#8a5ce6" stop-opacity="0.22"/>' +
      `<stop offset="100%" stop-color="${VOID}" stop-opacity="0"/>` +
      '</radialGradient></defs>' +
      `<rect width="64" height="64" rx="14" fill="${VOID}"/>` +
      '<circle cx="32" cy="32" r="26" fill="url(#glow)"/>' +
      '<circle cx="32" cy="32" r="5" fill="#fff2dd"/>' +
      '</svg>',
  )

export function useHashRouting() {
  useEffect(() => {
    const s0 = useStore.getState()
    const bar = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')

    const mark = (id: string) => {
      document.title = titleFor(id)
      const color = colorFor(id)
      bar?.setAttribute('content', mix(VOID, color, BAR_TINT))
      if (icon) icon.href = iconFor(color)
    }

    const initial = idFromHash()
    if (initial && initial !== s0.currentId && s0.graph.nodes.has(initial)) {
      s0.travelTo(initial, { instant: true })
    }
    mark(useStore.getState().currentId)

    const syncFromHash = () => {
      const s = useStore.getState()
      const id = idFromHash() || site.root
      if (id !== s.currentId && s.graph.nodes.has(id)) s.travelTo(id)
    }
    addEventListener('hashchange', syncFromHash)

    const unsub = useStore.subscribe((s, prev) => {
      if (s.currentId !== prev.currentId) {
        if ((idFromHash() || site.root) !== s.currentId) {
          history.pushState(null, '', s.currentId === site.root ? '#/' : `#/${s.currentId}`)
        }
        mark(s.currentId)
      }
      if (s.phase === 'idle' && prev.phase !== 'idle') syncFromHash()
    })

    return () => {
      removeEventListener('hashchange', syncFromHash)
      unsub()
    }
  }, [])
}
