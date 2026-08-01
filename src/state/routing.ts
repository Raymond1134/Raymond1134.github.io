import { useEffect } from 'react'
import { useStore } from './store'
import { site } from '@/content'

const idFromHash = () => decodeURIComponent(location.hash.replace(/^#\/?/, '')).trim()

const titleFor = (id: string) => {
  const node = useStore.getState().graph.nodes.get(id)
  return !node || id === site.root ? site.meta.name : `${node.title} · ${site.meta.name}`
}

export function useHashRouting() {
  useEffect(() => {
    const s0 = useStore.getState()

    const initial = idFromHash()
    if (initial && initial !== s0.currentId && s0.graph.nodes.has(initial)) {
      s0.travelTo(initial, { instant: true })
    }
    document.title = titleFor(useStore.getState().currentId)

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
        document.title = titleFor(s.currentId)
      }
      if (s.phase === 'idle' && prev.phase !== 'idle') syncFromHash()
    })

    return () => {
      removeEventListener('hashchange', syncFromHash)
      unsub()
    }
  }, [])
}
