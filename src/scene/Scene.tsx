import { useMemo } from 'react'
import { useStore } from '@/state/store'
import CameraRig from './CameraRig'

export default function Scene() {
  return (
    <>
      <CameraRig />
      <DebugBeacons />
    </>
  )
}

function DebugBeacons() {
  const graph = useStore((s) => s.graph)
  const nodes = useMemo(() => [...graph.nodes.values()], [graph])

  return (
    <>
      {nodes.map((n) => (
        <mesh key={n.id} position={n.worldPosition}>
          <icosahedronGeometry args={[3, 1]} />
          <meshBasicMaterial color={n.color ?? '#8fd8ff'} wireframe />
        </mesh>
      ))}
    </>
  )
}
