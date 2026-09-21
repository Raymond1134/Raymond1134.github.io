import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FocusEvent, PointerEvent } from 'react'
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

const closeMap = () => {
  const s = useStore.getState()
  if (s.mapOpen) s.toggleMap()
}

function WeaveOverlay({ closing, onGone }: { closing: boolean; onGone: () => void }) {
  const compact = useStore((s) => s.compact)
  const accent = useStore((s) => s.graph.nodes.get(s.currentId)?.color ?? BEACON_DEFAULT_COLOR)
  const panelRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    const cur = el?.querySelector('.is-current .hit')
    if (!el || !cur) return
    const c = cur.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    const k = r.width / el.offsetWidth || 1
    el.scrollLeft += (c.left + c.width / 2 - (r.left + r.width / 2)) / k
    el.scrollTop += (c.top + c.height / 2 - (r.top + r.height / 2)) / k
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
      style={{ '--weave-accent': accent } as CSSProperties}
      onAnimationEnd={(e) => {
        if (e.animationName === 'weave-out') onGone()
      }}
    >
      <div className="weave-backdrop" onPointerDown={closeMap} />
      <div className="weave-panel" ref={panelRef} tabIndex={-1}>
        <header className="weave-head">
          <h2>The weave</h2>
          <button className="weave-close" onClick={closeMap} aria-label="Close the weave">
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

const STEP_MS = 220
const FAR_HOPS = 6

interface Pt {
  x: number
  y: number
}

interface Thread {
  a: Pt
  b: Pt
  from: string
  to: string
  bow: number
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
  const threads: Thread[] = []
  const adj = new Map<string, Set<string>>()
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set())
    adj.get(a)!.add(b)
  }

  const thread = (from: string, to: string, bow: number) => {
    const key = from < to ? `${from}|${to}` : `${to}|${from}`
    const a = pts.get(from)
    const b = pts.get(to)
    if (!a || !b || drawn.has(key)) return
    drawn.add(key)
    threads.push({ a, b, from, to, bow })
    link(from, to)
    link(to, from)
  }

  for (const id of graph.order) {
    const n = graph.nodes.get(id)
    n?.children.forEach((c) => thread(id, c, 1))
    n?.related.forEach((r) => thread(id, r, 2.2))
  }

  return { pts, threads, adj, paths: threads.map((t) => threadPath(t.a, t.b, t.bow)) }
}

function hopsFrom(adj: Map<string, Set<string>>, start: string) {
  const hops = new Map<string, number>([[start, 0]])
  const queue = [start]
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]
    const h = hops.get(id)! + 1
    adj.get(id)?.forEach((o) => {
      if (hops.has(o)) return
      hops.set(o, h)
      queue.push(o)
    })
  }
  return hops
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
  const { pts, threads, adj, paths } = useMemo(() => layout(graph), [graph])
  const hops = useMemo(() => hopsFrom(adj, currentId), [adj, currentId])
  const [hot, setHot] = useState<string | null>(null)

  const colorOf = (id: string) => graph.nodes.get(id)?.color ?? BEACON_DEFAULT_COLOR
  const hopOf = (id: string) => hops.get(id) ?? FAR_HOPS
  const litNode = (id: string) => !!hot && (id === hot || !!adj.get(hot)?.has(id))
  const litThread = (i: number) => !!hot && (threads[i].from === hot || threads[i].to === hot)

  const warm = (id: string) => (e: PointerEvent) => {
    if (e.pointerType === 'mouse') setHot(id)
  }
  const focus = (id: string) => (e: FocusEvent<Element>) => {
    if (e.currentTarget.matches(':focus-visible')) setHot(id)
  }
  const cool = (id: string) => () => setHot((h) => (h === id ? null : h))

  const reach = (i: number) => {
    const t = threads[i]
    const near = Math.min(hopOf(t.from), hopOf(t.to))
    return {
      '--d': near * STEP_MS,
      '--from': hopOf(t.from) <= hopOf(t.to) ? 1.02 : -1.02,
    } as CSSProperties
  }

  return (
    <div className="weave-stage">
      <svg
        className="weave-svg weave-glow-svg"
        viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
        aria-hidden
        data-hot={hot ?? undefined}
      >
        <defs>
          <filter id="weave-halo" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          {threads.map((t, i) => (
            <linearGradient
              key={i}
              id={`weave-glow-thread-${i}`}
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
        <g filter="url(#weave-halo)" fill="none" strokeLinecap="round">
          {threads.map((t, i) => (
            <path
              key={i}
              className="weave-glow"
              d={paths[i]}
              stroke={`url(#weave-glow-thread-${i})`}
              strokeWidth={4}
              opacity={t.bow > 1 ? 0.18 : 0.34}
              data-lit={litThread(i) || undefined}
              style={reach(i)}
            />
          ))}
        </g>
      </svg>

      <svg
        className="weave-svg weave-main-svg"
        viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
        role="group"
        aria-label="Every beacon, joined by the threads between them"
        data-hot={hot ?? undefined}
      >
        <defs>
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
          {[...pts.keys()].map((id) => (
            <radialGradient key={id} id={`weave-glow-${id}`}>
              <stop offset="0%" stopColor={colorOf(id)} stopOpacity={0.95} />
              <stop offset="34%" stopColor={colorOf(id)} stopOpacity={0.5} />
              <stop offset="100%" stopColor={colorOf(id)} stopOpacity={0} />
            </radialGradient>
          ))}
        </defs>

        {threads.map((t, i) => {
          const faint = t.bow > 1
          const mine = t.from === currentId || t.to === currentId
          return (
            <g
              key={i}
              className="weave-thread"
              stroke={`url(#weave-thread-${i})`}
              fill="none"
              strokeLinecap="round"
              data-lit={litThread(i) || undefined}
              style={reach(i)}
            >
              <path className="weave-line" d={paths[i]} pathLength={1} strokeWidth={1.1} opacity={faint ? 0.16 : 0.34} />
              {mine && (
                <>
                  <path className="weave-flow" d={paths[i]} pathLength={1} data-rev={t.to === currentId || undefined} />
                  <path
                    className="weave-flow weave-flow-b"
                    d={paths[i]}
                    pathLength={1}
                    data-rev={t.to === currentId || undefined}
                  />
                </>
              )}
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
              className="weave-star"
              transform={`translate(${p.x} ${p.y})`}
              data-lit={litNode(id) || undefined}
              style={{ '--node-accent': colorOf(id), '--d': hopOf(id) * STEP_MS } as CSSProperties}
            >
              <a
                className={`weave-node${isCurrent ? ' is-current' : ''}`}
                href={hrefFor(id)}
                aria-current={isCurrent ? 'page' : undefined}
                aria-label={isCurrent ? `${node.title}, you are here` : `Travel to ${node.title}`}
                onClick={() => isCurrent && closeMap()}
                onPointerEnter={warm(id)}
                onPointerLeave={cool(id)}
                onFocus={focus(id)}
                onBlur={cool(id)}
              >
                {isCurrent && <circle className="ripple" r={9} />}
                {isCurrent && <circle className="ripple ripple-b" r={9} />}
                <circle className="halo" r={22} fill={`url(#weave-glow-${id})`} />
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
    </div>
  )
}
