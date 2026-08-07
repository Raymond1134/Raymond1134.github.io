import { site, graph } from '@/content'
import { renderInline } from './markdown'
import '@/styles/text-mode.css'

export default function SeoContent() {
  const nodes = graph.order.map((id) => graph.nodes.get(id)!).filter((n) => !n.hidden)

  return (
    <div className="sr-only" id="seo-content">
      <h1>{site.meta.name}</h1>
      <p>{site.meta.role}</p>
      <p>{site.meta.description}</p>

      {nodes.map((n) => {
        const root = n.id === graph.rootId
        const level = Math.min(4, Math.max(2, n.depth + 1))
        const heading = root ? null : level === 2 ? (
          <h2>{n.title}</h2>
        ) : level === 3 ? (
          <h3>{n.title}</h3>
        ) : (
          <h4>{n.title}</h4>
        )

        return (
          <section key={n.id}>
            {heading}
            {n.subtitle && !root && <p>{n.subtitle}</p>}
            {n.body?.split('\n\n').map((p, i) => (
              <p key={i} dangerouslySetInnerHTML={{ __html: renderInline(p) }} />
            ))}
            {n.links.length > 0 && (
              <ul>
                {n.links.map((l) => (
                  <li key={l.url}>
                    <a href={l.url} rel="noreferrer noopener" tabIndex={-1}>
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {n.tags.length > 0 && <p>{n.tags.join(' · ')}</p>}
          </section>
        )
      })}
    </div>
  )
}
