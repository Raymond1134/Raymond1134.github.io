import type { CSSProperties } from 'react'
import { site, graph } from '@/content'
import type { GraphNode } from '@/content/layout'
import { useStore } from '@/state/store'
import { BEACON_DEFAULT_COLOR } from '@/scene/beacons/palette'
import { renderInline } from './markdown'
import { glyph } from './glyphs'
import '@/styles/text-mode.css'

const external = (url: string) => /^https?:\/\//i.test(url)

export default function TextMode({ standalone = false }: { standalone?: boolean }) {
  const toggle = useStore((s) => s.toggleTextMode)
  const nodes = graph.order.map((id) => graph.nodes.get(id)!).filter((n) => !n.hidden)

  return (
    <div className="text-mode">
      <main className="tm-page">
        <header className="tm-head">
          <h1>{site.meta.name}</h1>
          <p className="tm-role">{site.meta.role}</p>
          <p className="tm-lede">{site.meta.description}</p>

          {standalone ? (
            <p className="tm-note">
              WebGL isn’t available in this browser, so this is the full text version — the same
              work, in words.
            </p>
          ) : (
            <button className="tm-return" onClick={toggle}>
              <span aria-hidden>←</span>
              Return to the drift
            </button>
          )}
        </header>

        {nodes.map((n) => (
          <Section key={n.id} node={n} />
        ))}
      </main>
    </div>
  )
}

function Section({ node: n }: { node: GraphNode }) {
  const root = n.id === graph.rootId
  const level = Math.min(4, Math.max(2, n.depth + 1))
  const heading = root ? null : level === 2 ? (
    <h2 className="tm-title">{n.title}</h2>
  ) : level === 3 ? (
    <h3 className="tm-title">{n.title}</h3>
  ) : (
    <h4 className="tm-title">{n.title}</h4>
  )

  return (
    <section
      id={n.id}
      className="tm-section"
      style={{ '--tm-accent': n.color ?? BEACON_DEFAULT_COLOR } as CSSProperties}
    >
      {heading}
      {n.subtitle && !root && <p className="tm-subtitle">{n.subtitle}</p>}

      {n.body && (
        <div className="tm-copy">
          {n.body.split('\n\n').map((p, i) => (
            <p key={i} dangerouslySetInnerHTML={{ __html: renderInline(p) }} />
          ))}
        </div>
      )}

      {n.media.length > 0 && (
        <div className="tm-media">
          {n.media.map((m) => (
            <figure key={m.src}>
              {m.type === 'video' ? (
                <video
                  src={m.src}
                  poster={m.poster}
                  controls
                  preload="metadata"
                  playsInline
                  aria-label={m.alt}
                />
              ) : (
                <img src={m.src} alt={m.alt} loading="lazy" decoding="async" />
              )}
              {m.caption && <figcaption>{m.caption}</figcaption>}
            </figure>
          ))}
        </div>
      )}

      {n.links.length > 0 && (
        <ul className="tm-links">
          {n.links.map((l) => (
            <li key={l.url}>
              <a
                href={l.url}
                target={external(l.url) ? '_blank' : undefined}
                rel="noreferrer noopener"
              >
                <span className="tm-glyph" aria-hidden>{glyph(l.icon)}</span>
                <span>{l.label}</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {n.tags.length > 0 && <p className="tm-tags">{n.tags.join(' · ')}</p>}
    </section>
  )
}
