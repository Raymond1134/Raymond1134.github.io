import * as THREE from 'three'
import type { Beacon, Site } from './schema'

export interface GraphNode extends Beacon {
  depth: number
  parentId: string | null
  worldPosition: THREE.Vector3

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

const RING_X = 115
const RING_Y = 62
const RING_DROP = 95
const DEPTH_JITTER = 18

export function buildGraph(site: Site): Graph {
  const byId = new Map(site.beacons.map((b) => [b.id, b]))
  const root = byId.get(site.root)
  if (!root) throw new Error(`site.root "${site.root}" is not a beacon id`)

  const kids = new Map<string, Beacon[]>()
  const seen = new Set([root.id])
  const claim = (b: Beacon) => {
    const cs = b.children
      .map((id) => byId.get(id))
      .filter((c): c is Beacon => !!c && !seen.has(c.id))
    cs.forEach((c) => seen.add(c.id))
    kids.set(b.id, cs)
    return cs
  }
  const queue = [root]
  while (queue.length) queue.push(...claim(queue.shift()!))

  const strays = site.beacons.filter((b) => !seen.has(b.id))
  if (strays.length) {
    strays.forEach((s) => seen.add(s.id))
    kids.get(root.id)!.push(...strays)
    const q = [...strays]
    while (q.length) q.push(...claim(q.shift()!))
  }

  const leaves = new Map<string, number>()
  const measure = (b: Beacon): number => {
    const cs = kids.get(b.id) ?? []
    const n = cs.length ? cs.reduce((sum, c) => sum + measure(c), 0) : 1
    leaves.set(b.id, n)
    return n
  }
  measure(root)

  const nodes = new Map<string, GraphNode>()
  const order: string[] = []

  const place = (b: Beacon, parent: GraphNode | null, depth: number, a0: number, a1: number) => {
    const mid = (a0 + a1) / 2 + (hash01(b.id, 2) - 0.5) * (a1 - a0) * 0.22
    const r = depth * b.spread * (0.92 + 0.16 * hash01(b.id, 3))
    const pos = b.position
      ? new THREE.Vector3(...b.position)
      : new THREE.Vector3(
          Math.cos(mid) * RING_X * r,
          -Math.sin(mid) * RING_Y * r,
          -RING_DROP * r + (depth ? (hash01(b.id, 5) - 0.5) * 2 * DEPTH_JITTER : 0),
        )

    let outward = parent
      ? pos.clone().sub(parent.worldPosition).normalize()
      : new THREE.Vector3(0, 0, -1)
    if (outward.lengthSq() < 1e-6) outward = new THREE.Vector3(0, 0, -1)

    const node: GraphNode = { ...b, depth, parentId: parent?.id ?? null, worldPosition: pos, outward }
    nodes.set(b.id, node)
    order.push(b.id)

    const cs = kids.get(b.id) ?? []
    const total = cs.reduce((sum, c) => sum + (leaves.get(c.id) ?? 1), 0) || 1
    let a = a0
    for (const c of cs) {
      const span = ((leaves.get(c.id) ?? 1) / total) * (a1 - a0)
      place(c, node, depth + 1, a, a + span)
      a += span
    }
  }
  place(root, null, 0, -Math.PI / 2, Math.PI * 1.5)

  return { nodes, order, rootId: site.root }
}

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
