import { z } from 'zod'
import raw from './site.json'
import { SiteSchema } from './schema'
import { buildGraph } from './layout'

const parsed = SiteSchema.safeParse(raw)

if (!parsed.success) {
  console.error('site.json failed validation:\n', z.prettifyError(parsed.error))
  throw new Error('Invalid site.json — see console for details')
}

export const site = parsed.data
export const graph = buildGraph(site)

for (const node of graph.nodes.values()) {
  for (const ref of [...node.children, ...node.related]) {
    if (!graph.nodes.has(ref)) {
      console.warn(`Beacon "${node.id}" references unknown beacon "${ref}"`)
    }
  }
}