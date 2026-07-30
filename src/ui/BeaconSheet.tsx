import { useState } from 'react'
import type { CSSProperties } from 'react'
import { useStore } from '@/state/store'
import { BEACON_DEFAULT_COLOR } from '@/scene/beacons/palette'
import { renderInline } from './markdown'
import { glyph } from './glyphs'
import '@/styles/sheet.css'

export default function BeaconSheet() {
  const compact = useStore((s) => s.compact)
  const currentId = useStore((s) => s.currentId)
  if (!compact) return null
  return <SheetContent key={currentId} />
}

function SheetContent() {
  const phase = useStore((s) => s.phase)
  const node = useStore((s) => s.graph.nodes.get(s.currentId)!)
  const [expanded, setExpanded] = useState(false)

  const hasContent = !!node.body || node.links.length > 0 || node.tags.length > 0
  if (!hasContent) return null

  return (
    <section
      className={`sheet${expanded ? ' is-expanded' : ''}${phase === 'idle' ? '' : ' is-hidden'}`}
      aria-label={`${node.title} details`}
      style={
        {
          '--sheet-accent': node.color ?? BEACON_DEFAULT_COLOR,
          /* .holo-copy / .holo-tags are shared with the 3D panel and tint from this. */
          '--holo-accent': node.color ?? BEACON_DEFAULT_COLOR,
        } as CSSProperties
      }
    >
      <button
        className="sheet-grabber"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="sheet-body"
      >
        <span className="sheet-bar" aria-hidden />
        <span className="sr-only">{expanded ? 'Collapse details' : 'Expand details'}</span>
      </button>

      <div className="sheet-body selectable" id="sheet-body">
        {node.body && (
          <div className="holo-copy">
            {node.body.split('\n\n').map((p, i) => (
              <p key={i} dangerouslySetInnerHTML={{ __html: renderInline(p) }} />
            ))}
          </div>
        )}

        {node.links.length > 0 && (
          <ul className="sheet-links">
            {node.links.map((l) => (
              <li key={l.url}>
                <a
                  href={l.url}
                  target={l.url.startsWith('http') ? '_blank' : undefined}
                  rel="noreferrer noopener"
                >
                  <span className="glyph" aria-hidden>{glyph(l.icon)}</span>
                  <span className="label">{l.label}</span>
                  <span className="chev" aria-hidden>›</span>
                </a>
              </li>
            ))}
          </ul>
        )}

        {node.tags.length > 0 && (
          <ul className="holo-tags">{node.tags.map((t) => <li key={t}>{t}</li>)}</ul>
        )}
      </div>
    </section>
  )
}
