import { useEffect, useMemo } from 'react'
import Beacon from './Beacon'
import { neighborsOf } from '@/content/layout'
import { useStore } from '@/state/store'

export default function Beacons() {
  useEffect(() => {
    useStore.getState().setBeaconsReady()
  }, [])
  const graph = useStore((s) => s.graph)
  const currentId = useStore((s) => s.currentId)

  const roles = useMemo(() => {
    const reachable = new Set(neighborsOf(graph, currentId))
    return [...graph.nodes.values()].map((node) => ({
      node,
      role: node.id === currentId
        ? ('current' as const)
        : reachable.has(node.id)
        ? ('reachable' as const)
        : ('distant' as const),
    }))
  }, [graph, currentId])

  return (
    <>
      {roles.map(({ node, role }) => (
        <Beacon key={node.id} node={node} role={role} />
      ))}
    </>
  )
}
