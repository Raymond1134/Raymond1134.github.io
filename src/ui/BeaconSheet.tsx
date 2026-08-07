import { useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { useStore } from '@/state/store'
import { TAP_SLOP } from '@/input/input'
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
  const bodyRef = useRef<HTMLDivElement>(null)
  const swipe = useRef<{ y: number; grab: boolean } | null>(null)

  const onDown = (e: ReactPointerEvent) => {
    const body = bodyRef.current
    const target = e.target as HTMLElement
    swipe.current =
      body?.contains(target) && body.scrollTop > 0
        ? null
        : { y: e.clientY, grab: !!target.closest('.sheet-grabber') }
  }

  const onUp = (e: ReactPointerEvent) => {
    const s = swipe.current
    swipe.current = null
    if (!s) return
    const dy = e.clientY - s.y
    if (Math.abs(dy) < TAP_SLOP) {
      if (s.grab) setExpanded((v) => !v)
      return
    }
    setExpanded(dy < 0)
  }

  const hasContent = !!node.body || node.links.length > 0 || node.tags.length > 0
  if (!hasContent) return null

  return (
    <section
      className={`sheet${expanded ? ' is-expanded' : ''}${phase === 'idle' ? '' : ' is-hidden'}`}
      aria-label={`${node.title} details`}
      onPointerDown={onDown}
      onPointerUp={onUp}
      style={
        {
          '--sheet-accent': node.color ?? BEACON_DEFAULT_COLOR,
          '--holo-accent': node.color ?? BEACON_DEFAULT_COLOR,
        } as CSSProperties
      }
    >
      <button
        className="sheet-grabber"
        onClick={(e) => { if (e.detail === 0) setExpanded((v) => !v) }}
        aria-expanded={expanded}
        aria-controls="sheet-body"
      >
        <span className="sheet-bar" aria-hidden />
        <span className="sr-only">{expanded ? 'Collapse details' : 'Expand details'}</span>
      </button>

      <div className="sheet-body selectable" id="sheet-body" ref={bodyRef}>
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
