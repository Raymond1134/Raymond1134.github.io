import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const repo = new URL('../', import.meta.url)
const sitePath = fileURLToPath(new URL('src/content/site.json', repo))
const htmlPath = fileURLToPath(new URL('dist/index.html', repo))

const die = (msg) => {
  console.error(`\nprerender: ${msg}\n`)
  process.exit(1)
}

if (!existsSync(htmlPath)) {
  die(`${htmlPath} does not exist. Run \`vite build\` before this script.`)
}
if (!existsSync(sitePath)) die(`${sitePath} does not exist.`)

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const plain = (s) =>
  String(s ?? '')
    .replace(/\[([^\]]+)\]\([^)\s]*\)/g, '$1')
    .replace(/[*`]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim()

const isExternal = (url) => /^https?:\/\//i.test(String(url ?? ''))

let site
try {
  site = JSON.parse(readFileSync(sitePath, 'utf8'))
} catch (err) {
  die(`could not parse site.json — ${err.message}`)
}

const meta = site.meta ?? {}
const beacons = Array.isArray(site.beacons) ? site.beacons : []
const byId = new Map(beacons.map((b) => [b.id, b]))
const rootBeacon = byId.get(site.root)
if (!rootBeacon) die(`site.root "${site.root}" is not a beacon id`)

const kids = new Map()
const seen = new Set([rootBeacon.id])
const claim = (b) => {
  const cs = (b.children ?? []).map((id) => byId.get(id)).filter((c) => c && !seen.has(c.id))
  cs.forEach((c) => seen.add(c.id))
  kids.set(b.id, cs)
  return cs
}
const queue = [rootBeacon]
while (queue.length) queue.push(...claim(queue.shift()))

const strays = beacons.filter((b) => !seen.has(b.id))
if (strays.length) {
  strays.forEach((s) => seen.add(s.id))
  kids.get(rootBeacon.id).push(...strays)
  const q = [...strays]
  while (q.length) q.push(...claim(q.shift()))
}

const ordered = []
const walk = (b, depth) => {
  if (!b.hidden) ordered.push({ b, depth })
  for (const c of kids.get(b.id) ?? []) walk(c, depth + 1)
}
walk(rootBeacon, 0)

const section = (entry, { media: withMedia = false, ids = false } = {}) => {
  const { b, depth } = entry
  const lvl = Math.min(4, Math.max(2, depth + 1))
  const root = b.id === site.root
  const out = [
    ids ? `<section id="${esc(b.id)}">` : '<section>',
    root ? '' : `<h${lvl}>${esc(plain(b.title))}</h${lvl}>`,
  ]

  if (b.subtitle && !root) out.push(`<p>${esc(plain(b.subtitle))}</p>`)

  for (const para of String(b.body ?? '').split('\n\n')) {
    const t = plain(para)
    if (t) out.push(`<p>${esc(t)}</p>`)
  }

  if (withMedia) {
    for (const m of b.media ?? []) {
      if (m.type === 'video') continue
      out.push(
        `<figure><img src="${esc(m.src)}" alt="${esc(plain(m.alt))}" loading="lazy" decoding="async" />` +
          (m.caption ? `<figcaption>${esc(plain(m.caption))}</figcaption>` : '') +
          '</figure>',
      )
    }
  }

  const links = b.links ?? []
  if (links.length) {
    out.push('<ul>')
    for (const l of links) {
      const target = isExternal(l.url) ? ' target="_blank"' : ''
      out.push(
        `<li><a href="${esc(l.url)}"${target} rel="noreferrer noopener">${esc(plain(l.label))}</a></li>`,
      )
    }
    out.push('</ul>')
  }

  const tags = (b.tags ?? []).map(plain).filter(Boolean)
  if (tags.length) out.push(`<p>${esc(tags.join(' · '))}</p>`)

  out.push('</section>')
  return out.join('')
}

const title = plain(meta.role) ? `${plain(meta.name)} — ${plain(meta.role)}` : plain(meta.name)
const description = plain(meta.description)
const url = String(meta.url ?? '')

let ogImage = ''
if (meta.ogImage) {
  try {
    ogImage = new URL(meta.ogImage, url || undefined).href
  } catch {
    die(`meta.ogImage "${meta.ogImage}" is not resolvable against meta.url "${url}"`)
  }
}

const sameAs = [
  ...new Set(
    ordered
      .flatMap(({ b }) => (b.links ?? []).map((l) => String(l.url ?? '')))
      .filter(isExternal),
  ),
]

const ld = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: plain(meta.name),
  jobTitle: plain(meta.role),
  url,
  description,
  ...(sameAs.length ? { sameAs } : {}),
}

const HEAD_OPEN = '<!-- prerender:head -->'
const HEAD_CLOSE = '<!-- /prerender:head -->'
const BODY_OPEN = '<!-- prerender:body -->'
const BODY_CLOSE = '<!-- /prerender:body -->'

const head =
  HEAD_OPEN +
  `<title>${esc(title)}</title>` +
  `<meta name="description" content="${esc(description)}" />` +
  (url ? `<link rel="canonical" href="${esc(url)}" />` : '') +
  `<meta property="og:type" content="website" />` +
  `<meta property="og:site_name" content="${esc(plain(meta.name))}" />` +
  `<meta property="og:title" content="${esc(title)}" />` +
  `<meta property="og:description" content="${esc(description)}" />` +
  (url ? `<meta property="og:url" content="${esc(url)}" />` : '') +
  (ogImage ? `<meta property="og:image" content="${esc(ogImage)}" />` : '') +
  `<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}" />` +
  `<meta name="twitter:title" content="${esc(title)}" />` +
  `<meta name="twitter:description" content="${esc(description)}" />` +
  (ogImage ? `<meta name="twitter:image" content="${esc(ogImage)}" />` : '') +
  `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` +
  HEAD_CLOSE

const header =
  `<h1>${esc(plain(meta.name))}</h1>` +
  (meta.role ? `<p>${esc(plain(meta.role))}</p>` : '') +
  (description ? `<p>${esc(description)}</p>` : '')

const noscriptStyle =
  'html,body{height:auto;overflow:auto;margin:0;background:#06070e}' +
  '#root,#seo-fallback{display:none}' +
  '.ns{max-width:68ch;margin:0 auto;' +
  'padding:48px max(24px,env(safe-area-inset-right,0px)) 72px max(24px,env(safe-area-inset-left,0px));' +
  "font:17px/1.75 'Inter',system-ui,-apple-system,sans-serif;color:#e6dcd2;" +
  'user-select:text;-webkit-user-select:text;-webkit-touch-callout:default}' +
  '.ns h1{font-size:34px;font-weight:600;line-height:1.2;color:#f4efe8;margin:0 0 10px}' +
  '.ns h2,.ns h3,.ns h4{font-weight:600;line-height:1.3;color:#f7ecdd;margin:0 0 6px}' +
  '.ns h2{font-size:25px}.ns h3{font-size:21px}.ns h4{font-size:19px}' +
  '.ns section{margin:0 0 48px}' +
  '.ns p{margin:0 0 1.05em}' +
  '.ns a{color:#ffe3bb}' +
  '.ns ul{list-style:none;margin:18px 0 0;padding:0}' +
  '.ns li{margin:0 0 8px}' +
  '.ns img{display:block;width:100%;height:auto;border-radius:16px;margin:20px 0 8px}' +
  '.ns figure{margin:0}' +
  '.ns figcaption{font-size:14.5px;color:#b3aca4}'

const body =
  BODY_OPEN +
  `<noscript><style>${noscriptStyle}</style>` +
  `<main class="ns">${header}${ordered.map((e) => section(e, { media: true, ids: true })).join('')}</main>` +
  '</noscript>' +
  '<div id="seo-fallback" style="position:absolute;width:1px;height:1px;overflow:hidden;' +
  'clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;margin:-1px;padding:0">' +
  `${header}${ordered.map((e) => section(e)).join('')}` +
  '</div>' +
  BODY_CLOSE

let html = readFileSync(htmlPath, 'utf8')

const cut = (src, open, close) => {
  const a = src.indexOf(open)
  const b = src.indexOf(close)
  if (a === -1 || b === -1 || b < a) return src
  return src.slice(0, a) + src.slice(b + close.length)
}

html = cut(html, HEAD_OPEN, HEAD_CLOSE)
html = cut(html, BODY_OPEN, BODY_CLOSE)
html = html.replace(/<title>[\s\S]*?<\/title>\s*/i, '')

if (!html.includes('</head>')) die('dist/index.html has no </head>')
if (!html.includes('</body>')) die('dist/index.html has no </body>')

html = html.replace('</head>', () => head + '</head>')
html = html.replace('</body>', () => body + '</body>')

writeFileSync(htmlPath, html)

console.log(
  `prerender: ${ordered.length} beacon${ordered.length === 1 ? '' : 's'}` +
    `, ${sameAs.length} sameAs link${sameAs.length === 1 ? '' : 's'} → dist/index.html`,
)
