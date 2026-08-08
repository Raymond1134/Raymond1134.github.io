import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useStore } from '@/state/store'
import { site } from '@/content'
import type { Graph } from '@/content/layout'
import { BEACON_DEFAULT_COLOR } from '@/scene/beacons/palette'
import '@/styles/weave.css'

const hrefFor = (id: string) => (id === site.root ? '#/' : `#/${id}`)

export default function Weave() {
  const open = useStore((s) => s.mapOpen)
  const [render, setRender] = useState(open)
  if (open && !render) setRender(true)
  if (!render) return null
  return <WeaveOverlay closing={!open} onGone={() => setRender(false)} />
}

function WeaveOverlay({ closing, onGone }: { closing: boolean; onGone: () => void }) {
  const compact = useStore((s) => s.compact)
  const toggleMap = useStore((s) => s.toggleMap)
  const panelRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    const cur = el?.querySelector('.is-current')
    if (!el || !cur) return
    const c = cur.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    el.scrollLeft += c.left + c.width / 2 - (r.left + r.width / 2)
    el.scrollTop += c.top + c.height / 2 - (r.top + r.height / 2)
  }, [])

  useEffect(() => {
    if (!closing) return
    const id = setTimeout(onGone, 400)
    return () => clearTimeout(id)
  }, [closing, onGone])

  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null
    panelRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      const panel = panelRef.current
      if (e.key !== 'Tab' || !panel) return
      const stops = [...panel.querySelectorAll<HTMLElement | SVGElement>('button:not([disabled]), a[href]')]
      if (!stops.length) return

      const active = document.activeElement
      const first = stops[0]
      const last = stops[stops.length - 1]
      if (e.shiftKey ? active === first || active === panel : active === last) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
      }
    }

    addEventListener('keydown', onKey)
    return () => {
      removeEventListener('keydown', onKey)
      returnTo?.focus?.()
    }
  }, [])

  return (
    <div
      className="weave"
      role="dialog"
      aria-modal="true"
      aria-label="The weave"
      data-closing={closing || undefined}
      onAnimationEnd={(e) => {
        if (e.animationName === 'weave-out') onGone()
      }}
    >
      <div className="weave-backdrop" onPointerDown={toggleMap} />
      <div className="weave-panel" ref={panelRef} tabIndex={-1}>
        <header className="weave-head">
          <h2>The weave</h2>
          <button className="weave-close" onClick={toggleMap} aria-label="Close the weave">
            ✕
          </button>
        </header>

        {compact ? (
          <div className="weave-scroll" ref={scrollRef}>
            <WeaveGraph />
          </div>
        ) : (
          <WeaveGraph />
        )}

        <p className="weave-hint">Choose a light{compact ? '' : ' · Esc to close'}</p>
      </div>
    </div>
  )
}

const VIEW = { w: 1000, h: 760 }

const MARGIN = { x: 132, y: 76 }

interface Pt {
  x: number
  y: number
}

function layout(graph: Graph) {
  const pts = new Map<string, Pt>()
  for (const id of graph.order) {
    const n = graph.nodes.get(id)
    if (n) pts.set(id, { x: n.worldPosition.x, y: -n.worldPosition.y })
  }

  const xs = [...pts.values()].map((p) => p.x)
  const ys = [...pts.values()].map((p) => p.y)
  const spanX = Math.max(...xs) - Math.min(...xs)
  const spanY = Math.max(...ys) - Math.min(...ys)
  const k = Math.min(
    spanX > 1 ? (VIEW.w - 2 * MARGIN.x) / spanX : Infinity,
    spanY > 1 ? (VIEW.h - 2 * MARGIN.y) / spanY : Infinity,
  )
  if (Number.isFinite(k)) {
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2
    for (const p of pts.values()) {
      p.x = VIEW.w / 2 + (p.x - cx) * k
      p.y = VIEW.h / 2 + (p.y - cy) * k
    }
  }

  const drawn = new Set<string>()
  const threads: { a: Pt; b: Pt; from: string; to: string; bow: number }[] = []

  const thread = (from: string, to: string, bow: number) => {
    const key = from < to ? `${from}|${to}` : `${to}|${from}`
    const a = pts.get(from)
    const b = pts.get(to)
    if (!a || !b || drawn.has(key)) return
    drawn.add(key)
    threads.push({ a, b, from, to, bow })
  }

  for (const id of graph.order) {
    const n = graph.nodes.get(id)
    n?.children.forEach((c) => thread(id, c, 1))
    n?.related.forEach((r) => thread(id, r, 2.2))
  }

  return { pts, threads }
}

function threadPath(a: Pt, b: Pt, k: number): string {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const bow = Math.min(26, len * 0.18) * k * (Math.round(a.x * 13 + b.y * 7) % 2 ? 1 : -1)
  const cx = (a.x + b.x) / 2 - (dy / len) * bow
  const cy = (a.y + b.y) / 2 + (dx / len) * bow
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`
}

function WeaveGraph() {
  const graph = useStore((s) => s.graph)
  const currentId = useStore((s) => s.currentId)
  const toggleMap = useStore((s) => s.toggleMap)
  const { pts, threads } = useMemo(() => layout(graph), [graph])

  const colorOf = (id: string) => graph.nodes.get(id)?.color ?? BEACON_DEFAULT_COLOR

  return (
    <svg
      className="weave-svg"
      viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
      role="group"
      aria-label="Every beacon, joined by the threads between them"
    >
      <defs>
        <filter id="weave-halo" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        {threads.map((t, i) => (
          <linearGradient
            key={i}
            id={`weave-thread-${i}`}
            gradientUnits="userSpaceOnUse"
            x1={t.a.x}
            y1={t.a.y}
            x2={t.b.x}
            y2={t.b.y}
          >
            <stop offset="0%" stopColor={colorOf(t.from)} />
            <stop offset="100%" stopColor={colorOf(t.to)} />
          </linearGradient>
        ))}
      </defs>

      {threads.map((t, i) => {
        const d = threadPath(t.a, t.b, t.bow)
        const faint = t.bow > 1
        return (
          <g key={i} stroke={`url(#weave-thread-${i})`} fill="none" strokeLinecap="round">
            <path d={d} strokeWidth={4} opacity={faint ? 0.18 : 0.34} filter="url(#weave-halo)" />
            <path d={d} strokeWidth={1.1} opacity={faint ? 0.16 : 0.34} />
          </g>
        )
      })}

      {[...pts].map(([id, p]) => {
        const node = graph.nodes.get(id)
        if (!node) return null
        const isCurrent = id === currentId
        return (
          <g
            key={id}
            transform={`translate(${p.x} ${p.y})`}
            style={{ '--node-accent': colorOf(id) } as CSSProperties}
          >
            <a
              className={`weave-node${isCurrent ? ' is-current' : ''}`}
              href={hrefFor(id)}
              aria-current={isCurrent ? 'page' : undefined}
              aria-label={isCurrent ? `${node.title}, you are here` : `Travel to ${node.title}`}
              onClick={() => isCurrent && toggleMap()}
            >
              <circle className="halo" r={18} filter="url(#weave-halo)" />
              <circle className="core" r={isCurrent ? 7 : 5} />
              <text className="label" y={36}>
                {node.title}
              </text>
              <circle className="hit" r={22} />
            </a>
          </g>
        )
      })}
    </svg>
  )
}
