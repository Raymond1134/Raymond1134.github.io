import { useEffect } from 'react'
import { useStore } from '@/state/store'
import { neighborsOf } from '@/content/layout'
import { recentre } from '@/input/input'
import '@/styles/hud.css'

/* STUB */

export default function Hud() {
  const graph = useStore((s) => s.graph)
  const currentId = useStore((s) => s.currentId)
  const travelTo = useStore((s) => s.travelTo)
  const phase = useStore((s) => s.phase)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState()
      if (e.key === '0') recentre()
      if (e.key === 'Escape') {
        const parent = s.graph.nodes.get(s.currentId)?.parentId
        if (parent) travelTo(parent)
      }
      const n = parseInt(e.key, 10)
      if (n >= 1 && n <= 9) {
        const targets = neighborsOf(s.graph, s.currentId)
        if (targets[n - 1]) travelTo(targets[n - 1])
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [travelTo])

  const targets = neighborsOf(graph, currentId)

  /* Faded out through the turn and the flight. */
  const dimmed = phase === 'turn' || phase === 'flight'

  return (
    <nav className="hud" aria-label="Site controls" data-dimmed={dimmed}>
      {targets.map((id) => (
        <button key={id} onClick={() => travelTo(id)} disabled={phase !== 'idle'}>
          {graph.nodes.get(id)?.title ?? id}
        </button>
      ))}
    </nav>
  )
}
