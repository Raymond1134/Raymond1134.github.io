import { useEffect, useRef } from 'react'
import { useStore } from '@/state/store'
import { neighborsOf } from '@/content/layout'

export default function BeaconTabStops() {
  const graph = useStore((s) => s.graph)
  const currentId = useStore((s) => s.currentId)
  const phase = useStore((s) => s.phase)
  const travelTo = useStore((s) => s.travelTo)
  const setHovered = useStore((s) => s.setHovered)
  const navRef = useRef<HTMLElement>(null)
  const travelling = useRef(false)

  useEffect(() => {
    if (phase !== 'idle' || !travelling.current) return
    travelling.current = false
    navRef.current?.focus()
  }, [phase])

  return (
    <nav className="sr-only" aria-label="Lights within reach" ref={navRef} tabIndex={-1}>
      <ul>
        {neighborsOf(graph, currentId).map((id) => {
          const node = graph.nodes.get(id)
          if (!node) return null
          return (
            <li key={id}>
              <button
                disabled={phase !== 'idle'}
                onFocus={() => setHovered(id)}
                onBlur={() => {
                  if (useStore.getState().hoveredId === id) setHovered(null)
                }}
                onClick={() => {
                  travelling.current = true
                  travelTo(id)
                }}
              >
                Travel to {node.title}
                {node.subtitle ? `, ${node.subtitle}` : ''}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
