import * as THREE from 'three'
import type { Beacon, Site } from './schema'

export interface GraphNode extends Beacon {
  depth: number
  parentId: string | null
  worldPosition: THREE.Vector3

  /* Unit vector pointing away from the parent. */
  outward: THREE.Vector3
}
  
export interface Graph {
  nodes: Map<string, GraphNode>
  order: string[]
  rootId: string
}

export function hash01(str: string, salt = 0): number {
  let h = 2166136261 ^ salt
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  }
  return ((h >>> 0) % 1_000_003) / 1_000_003
}
  
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
  
/* Distance from a beacon to its children. */
function ringRadius(depth: number): number {
  return 50 * Math.pow(0.86, depth)
}
  
/* Half-angle of the cone that children are scattered into, in radians. */
function coneSpread(depth: number, childCount: number): number {
  if (depth === 0) return Math.PI * 0.30
  return Math.min(Math.PI * 0.42, 0.5 + childCount * 0.16)
}

const MAX_POLAR = Math.PI * 0.167
  
export function buildGraph(site: Site): Graph {
  const byId = new Map(site.beacons.map((b) => [b.id, b]))
  const nodes = new Map<string, GraphNode>()
  const order: string[] = []
  const root = byId.get(site.root)
  if (!root) throw new Error(`site.root "${site.root}" is not a beacon id`)
  
  const walk = (
    beacon: Beacon,
    parentId: string | null,
    depth: number,
    origin: THREE.Vector3,
    inheritedOutward: THREE.Vector3,
    indexInSiblings: number,
    siblingCount: number) => {
      if (nodes.has(beacon.id)) return
      let pos: THREE.Vector3
      let outward: THREE.Vector3
  
      if (beacon.position) {
        pos = new THREE.Vector3(...beacon.position)
        outward = pos.clone().sub(origin).normalize()
        if (outward.lengthSq() < 1e-6) outward = new THREE.Vector3(0, 0, -1)
      }
      else if (parentId === null) {
        pos = new THREE.Vector3(0, 0, 0)
        outward = new THREE.Vector3(0, 0, -1)
      }
      else {
        const spread = coneSpread(depth - 1, siblingCount)
        const t = siblingCount === 1 ? 0 : indexInSiblings / (siblingCount - 1)
        const polar = Math.min(
          MAX_POLAR,
          spread * (0.35 + 0.65 * t) * (0.7 + 0.6 * hash01(beacon.id, 1)),
        )
        const azimuth = indexInSiblings * GOLDEN_ANGLE + hash01(beacon.id, 2) * Math.PI * 2
        const axis = inheritedOutward.clone().normalize()
        const helper = Math.abs(axis.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
        const right = new THREE.Vector3().crossVectors(axis, helper).normalize()
        const up = new THREE.Vector3().crossVectors(right, axis).normalize()
  
        const dir = axis
          .clone()
          .multiplyScalar(Math.cos(polar))
          .addScaledVector(right, Math.sin(polar) * Math.cos(azimuth))
          .addScaledVector(up, Math.sin(polar) * Math.sin(azimuth))
          .normalize()
  
        const r = ringRadius(depth - 1) * beacon.spread * (0.85 + 0.3 * hash01(beacon.id, 3))
        pos = origin.clone().addScaledVector(dir, r)
        outward = dir
      }
  
      nodes.set(beacon.id, {
        ...beacon,
        depth,
        parentId,
        worldPosition: pos,
        outward,
      })

      order.push(beacon.id)
      const kids = beacon.children.map((id) => byId.get(id)).filter(Boolean) as Beacon[]
      kids.forEach((kid, i) => walk(kid, beacon.id, depth + 1, pos, outward, i, kids.length))
    }
  
    walk(root, null, 0, new THREE.Vector3(), new THREE.Vector3(0, 0, -1), 0, 1)
    
    /* Handle orphaned beacons. */
    site.beacons.forEach((b, i) => {
      if (nodes.has(b.id)) return
      const a = i * GOLDEN_ANGLE
      const y = 1 - (i / Math.max(1, site.beacons.length)) * 2
      const r = Math.sqrt(Math.max(0, 1 - y * y))
      nodes.set(b.id, {
        ...b,
        depth: 1,
        parentId: site.root,
        worldPosition: new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r).multiplyScalar(200),
        outward: new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r).normalize(),
      })
      order.push(b.id)
    })
  
    return { nodes, order, rootId: site.root }
  }
  
/* Beacons reachable in one hop: children + parent + siblings. */
export function neighborsOf(graph: Graph, id: string): string[] {
  const node = graph.nodes.get(id)
  if (!node) return []
  const out = new Set<string>(node.children)
  node.related.forEach((r) => out.add(r))
  if (node.parentId) {
    out.add(node.parentId)
    const parent = graph.nodes.get(node.parentId)
    parent?.children.forEach((s) => { if (s !== id) out.add(s) })
  }
  return [...out].filter((n) => graph.nodes.has(n))
}