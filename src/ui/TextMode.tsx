import { site } from '@/content'
import { graph } from '@/content'
import { useStore } from '@/state/store'

/* STUB */

export default function TextMode({ standalone = false }: { standalone?: boolean }) {
  const toggle = useStore((s) => s.toggleTextMode)
  const ordered = [...graph.nodes.values()].sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id))

  return (
    <main className="text-mode">
      <header>
        <h1>{site.meta.name}</h1>
        <p>{site.meta.role}</p>
        {!standalone && <button onClick={toggle}>Return to the drift</button>}
      </header>

      {ordered.map((n) => (
        <section key={n.id} id={n.id}>
          <h2>{n.title}</h2>
          {n.subtitle && <p>{n.subtitle}</p>}
          {n.body && <p>{n.body}</p>}
          {n.links.length > 0 && (
            <ul>
              {n.links.map((l) => (
                <li key={l.url}>
                  <a href={l.url} rel="noreferrer noopener">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </main>
  )
}
