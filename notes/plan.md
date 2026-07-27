# Aetherweb — Build Plan

A ground-up construction plan for an ethereal, particle-driven 3D personal site, deployed to
`https://Raymond1134.github.io`.

> **How to read this document.** Sections 1–3 are decisions and rationale — read once. Phases 0–12 are
> sequential build steps with copy-pasteable code. Every phase ends with a **Checkpoint** describing
> exactly what you should see on screen before moving on. Don't skip checkpoints; in a shader-heavy
> project, debugging three broken layers at once is how people give up.

---

## Table of contents

- [1. Design decisions (and why)](#1-design-decisions-and-why)
- [2. Architecture at a glance](#2-architecture-at-a-glance)
- [3. Tech stack and exact versions](#3-tech-stack-and-exact-versions)
- [Phase 0 — Scaffolding](#phase-0--scaffolding)
- [Phase 1 — Content schema and the beacon graph](#phase-1--content-schema-and-the-beacon-graph)
- [Phase 2 — Scene shell, store, camera rig](#phase-2--scene-shell-store-camera-rig)
- [Phase 3 — The particle engine (GPGPU)](#phase-3--the-particle-engine-gpgpu)
- [Phase 4 — Beacons](#phase-4--beacons)
- [Phase 5 — The travel sequence](#phase-5--the-travel-sequence)
- [Phase 6 — Holographic UI](#phase-6--holographic-ui)
- [Phase 7 — Star map, routing, deep links](#phase-7--star-map-routing-deep-links)
- [Phase 8 — Post-processing and look dev](#phase-8--post-processing-and-look-dev)
- [Phase 9 — Sound](#phase-9--sound)
- [Phase 10 — Performance tiers and adaptive quality](#phase-10--performance-tiers-and-adaptive-quality)
- [Phase 11 — Accessibility, fallback, SEO](#phase-11--accessibility-fallback-seo)
- [Phase 12 — Deployment](#phase-12--deployment)
- [Milestones](#milestones)
- [Risk register](#risk-register)
- [Appendix A — Full file tree](#appendix-a--full-file-tree)
- [Appendix B — Tuning cheat sheet](#appendix-b--tuning-cheat-sheet)
- [Appendix C — Mobile QA script](#appendix-c--mobile-qa-script)
- [References](#references)

> **Mobile is a first-class target, not a port.** Roughly half your traffic will be someone tapping a
> link from LinkedIn on a phone. Every phase below carries its mobile requirements inline rather than
> deferring them to a "responsive pass" at the end — that pass never happens, and retrofitting touch
> input into a camera rig built around `pointermove` is a rewrite. The decisions are collected in
> [§1.7](#17-input-and-mobile-the-second-first-class-platform); the verification script is
> [Appendix C](#appendix-c--mobile-qa-script).

---

## 1. Design decisions (and why)

You asked me to decide the open questions. Here they are, decided, with reasoning.

### 1.1 Navigation model: **curated tree + free-jump star map**

**Decision.** The beacons form a **directed tree** defined in JSON. From any beacon you may travel to
its **children**, its **parent**, and its **siblings**. Additionally, pressing `M` (or clicking the
constellation glyph) opens a **star map overlay** from which you can jump to *any* beacon in one hop.
Optional `related: []` edges create "wormholes" between distant branches.

```
                          ⟡ nexus  (landing)
              ┌────────────┼────────────┬────────────┐
           ⟡ about      ⟡ work      ⟡ writing    ⟡ contact
                       ┌───┼───┐
                    ⟡ p1  ⟡ p2  ⟡ p3
```

**Why not a flat "everything reachable from everywhere" space?** Past ~8 beacons the sky becomes
undifferentiated noise, there is no reading order, and you lose the single most valuable thing a
portfolio has: a curated narrative. It also makes the "distant beacon you can see and click" idea
useless, because everything is distant.

**Why not a strict linear chain?** A hiring manager has 90 seconds. Forcing five transitions to reach
your GitHub link is how you lose them.

**Why the hybrid wins.** First-time visitors get an authored path (Nexus → pillars → detail). Repeat
visitors and recruiters get `M` and instant travel. Deep links (`#/work/particle-engine`) let you put
a beacon URL directly in a résumé. Content scales: adding a 12th project doesn't crowd the sky,
because it lives one level down.

### 1.2 Spatial layout: **deterministic auto-layout, manual override allowed**

Positions are *computed* from the tree, not hand-authored — that's what makes "add a JSON object,
get a new beacon" actually true. Children are distributed on a spherical cap around their parent,
oriented away from the grandparent (so travel always feels like moving *outward*), placed with the
golden angle and jittered by a hash of the beacon `id` so the arrangement is stable across reloads
but not visibly gridded. Any beacon may set `position: [x,y,z]` to opt out.

### 1.3 Camera model: **anchored look-around, on-rails travel**

You are *at* a beacon, not flying freely. Pointer movement yaws/pitches the camera within limits
with heavy damping; scroll dollies slightly. Travel between beacons is a scripted camera path hidden
behind the particle engulf.

**Why not free-fly (WASD/pointer-lock)?** Three reasons: motion sickness, users getting lost in empty
black space, and mobile — there is no good free-fly on a phone. Anchored look-around preserves the
"you are standing in a place" feeling with none of that. A free-fly toggle can be a stretch goal.

### 1.4 "Boids" — an honest note

True boids (separation/alignment/cohesion) is O(n²) neighbour search. At 1,000,000 particles that's
10¹² pair tests per frame. Not happening in a browser, and spatial hashing on the GPU would eat the
whole frame budget for a visual difference nobody would notice at this density.

**What actually produces the look you described** is a **curl-noise flow field** plus **attractors**:

- Curl noise is divergence-free, so particles never bunch into blobs or thin out into gaps — they
  form the long, coherent, filamentary streams that read as flocking.
- Neighbouring particles sample nearly the same field value, so they *align* automatically. That's
  the "boid" quality, for one texture-free noise evaluation instead of a neighbour search.
- A radial spring toward the beacon plus a tangential term produces the orbiting/spiralling.

So: flow field + attractors, and the result looks *more* like the reference imagery in your head
than real boids would. Section [Phase 3.7](#37-stretch-real-local-cohesion) sketches an optional
coarse-grid cohesion pass if you want genuine emergent clumping later.

### 1.5 Renderer: **WebGL2 now, WebGPU as a later swap**

WebGPU + TSL compute shaders is the "2026" answer and would let you push 4M+ particles. But Firefox
support is still rolling out and R3F's WebGPU path is newer. For a site whose entire job is to load
correctly on a stranger's machine, ship **WebGL2 + `GPUComputationRenderer`** (ping-pong float
render targets) first. It runs everywhere WebGL2 does, which is effectively everywhere.

The plan keeps the simulation behind a `ParticleSystem` boundary so a WebGPU/TSL backend can be
added later without touching beacons, UI, or transitions.

### 1.6 Framework: **React + react-three-fiber + TypeScript**

Your requirement — "editing JSON creates new beacons automatically" — is literally
`beacons.map(b => <Beacon key={b.id} {...b} />)`. That's React's whole thesis. drei also hands you
SDF text, HTML-in-3D, and loaders for free. Vanilla three.js would mean hand-writing a diffing layer
for the content graph.

---

### 1.7 Input and mobile: the second first-class platform

Keyboard shortcuts like `M` for map are a *desktop accelerator layered on top of* a control surface
that works with a thumb. They are never the only way to do anything.

**The rule:** every action has a visible, tappable control at least 44×44 CSS px, inside the thumb
zone, with safe-area padding. Keyboard shortcuts are a shortcut, hover is an enhancement, and neither
is load-bearing.

| Action | Touch | Mouse | Keyboard |
|---|---|---|---|
| Look around | drag anywhere | move pointer (lean) | — |
| Dolly in/out | pinch | scroll wheel | — |
| Travel to beacon | tap the beacon | click | `1`–`9` |
| Open the map | **bottom-bar button** or swipe up from bottom | button or `M` | `M` |
| Go up a level | **bottom-bar Back button** | button or `Esc` | `Esc` |
| Sound / text mode | bottom-bar buttons | header buttons | — |
| Recentre view | double-tap | double-click | `0` |

**Three things change shape on mobile, not just size:**

1. **The star map becomes a list.** A 1000×760 SVG constellation is unreadable and un-tappable on a
   375px screen. On coarse pointers it renders as an indented, tappable tree outline — which is
   *more* usable, more accessible, and less code than trying to pan/zoom a graph with two fingers.
2. **Panel body copy moves to a bottom sheet.** `<Html transform>` in CSS3D is blurry and expensive
   on mobile GPUs, and a 520px-wide DOM panel floating in 3D simply does not fit in portrait. The
   holographic *frame* and title stay in 3D for atmosphere; body, links, and tags render in a
   glass-styled DOM sheet pinned to the bottom of the screen, where thumbs already are.
3. **Camera distance is computed, not constant.** In portrait, a 62° vertical FOV yields about a 31°
   *horizontal* FOV — the panel would be cropped off both edges. Phase 2.5 derives the anchor
   distance from the panel width and the actual horizontal frustum, so the framing is correct at any
   aspect ratio without magic numbers.

**Why drag-to-look and not gyroscope-by-default?** Gyro is a lovely touch but it requires an explicit
permission prompt on iOS 13+, it fights you when you're lying down or on a train, and it can't be
the primary input. It's an opt-in toggle in Phase 2.5, off by default.

**Why not just lock the camera on mobile?** Because "millions of particles dancing around *you*" is
the entire premise, and you can't feel surrounded by something you can't look at.

---

## 2. Architecture at a glance

```
┌─────────────────────────────────────────────────────────────────┐
│  content/site.json        ← the only file you edit to add pages │
└──────────────┬──────────────────────────────────────────────────┘
               │ parse + validate (zod) + auto-layout
               ▼
┌─────────────────────────────────────────────────────────────────┐
│  useSiteStore (zustand)                                          │
│  graph · currentId · phase · quality · audio · mapOpen           │
└───┬──────────────┬───────────────┬──────────────┬───────────────┘
    │              │               │              │
    ▼              ▼               ▼              ▼
┌────────┐   ┌───────────┐   ┌──────────┐   ┌──────────┐
│Particle│   │ Beacons   │   │ Holo UI  │   │ DOM HUD  │
│ Engine │   │ (glints,  │   │ (Text +  │   │ (starmap │
│ GPGPU  │   │  hit      │   │  panels  │   │  audio   │
│ 2 FBOs │   │  proxies) │   │  + Html) │   │  a11y)   │
└────────┘   └───────────┘   └──────────┘   └──────────┘
    │              │               │
    └──────────────┴───────────────┘
                   ▼
         EffectComposer: Bloom → CA → Vignette → Noise → ToneMapping
```

**Data flow for a travel event:**

```
click beacon  →  store.travelTo(id)
                    ↓ phase='gather'   (0.00–0.90s) uImplode 0→1, target = camera
                    ↓ phase='veil'     (0.90–1.40s) white-out; camera bezier to new anchor;
                    ↓                               currentId swaps; UI unmounts/mounts
                    ↓ phase='disperse' (1.40–2.60s) uImplode 1→0, uHome lerps to new beacon
                    ↓ phase='idle'                  hash updated to #/new-id
```

---

## 3. Tech stack and exact versions

Verified against npm on 2026-07-26. Pin these; the R3F/React/three triangle is version-sensitive.

| Package | Version | Notes |
|---|---|---|
| `react`, `react-dom` | `19.2.x` | R3F v9 peer range is `>=19 <19.3` |
| `three` | `0.185.1` | ships its own TS types, incl. `three/addons/*` |
| `@react-three/fiber` | `9.6.1` | React 19 required |
| `@react-three/drei` | `10.7.7` | `Text`, `Html`, `useTexture`, `AdaptiveDpr`, `Preload` |
| `@react-three/postprocessing` | `3.0.4` | wraps `postprocessing` |
| `postprocessing` | `6.39.3` | peer `three >=0.168 <0.186` — **this is why three is pinned at 0.185** |
| `zustand` | `5.0.14` | store |
| `zod` | `^4` | validate `site.json` at build + dev |
| `howler` | `2.2.4` | audio |
| `vite` | `8.1.5` | build |
| `@vitejs/plugin-react` | `6.0.4` | peer `vite ^8` |
| `vite-plugin-glsl` | `1.6.1` | `#include` support in `.glsl` |
| `typescript` | `^5.7` | |
| `leva` | `0.10.1` | dev-only tuning panel (tree-shaken out of prod) |
| `r3f-perf` | `7.2.3` | dev-only perf HUD |

> ⚠️ **The one real version trap.** `postprocessing@6.39.3` declares `three >=0.168.0 <0.186.0`. If you
> bump `three` to 0.186+, npm will error or you'll get a silently broken composer. Bump `postprocessing`
> first, then `three`. Check with `npm ls three` after any upgrade.

> ⚠️ **Licensing trap.** [lygia](https://lygia.xyz) is the popular GLSL shader library and it is
> **not** MIT — it's the Prosperity License (non-commercial). A job-seeking portfolio is a legal grey
> area. Use [`webgl-noise`](https://github.com/stegu/webgl-noise) instead: genuinely MIT, and it's the
> code every "1M particles" demo is using anyway.

---

## Phase 0 — Scaffolding

### 0.1 Create the project

The repo already exists at `D:\Projects\Raymond1134.github.io` with a placeholder `index.html`.
Scaffold in place:

```bash
npm create vite@latest . -- --template react-ts
```

When it warns the directory isn't empty, choose **"Ignore files and continue"**. It will overwrite
`index.html` — that's fine, that's the placeholder.

### 0.2 Install dependencies

```bash
npm i three@0.185.1 @react-three/fiber@9.6.1 @react-three/drei@10.7.7 @react-three/postprocessing@3.0.4 postprocessing@6.39.3 zustand@5.0.14 zod howler
```

```bash
npm i -D vite-plugin-glsl@1.6.1 leva@0.10.1 r3f-perf@7.2.3 @types/howler
```

Sanity check that only one copy of three resolved:

```bash
npm ls three
```



------------------------------------------------------------------


### 0.3 `vite.config.ts`

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import glsl from 'vite-plugin-glsl'
import { resolve } from 'node:path'

export default defineConfig({
  // Raymond1134.github.io is a *user* site, served from the domain root.
  // If this were a project repo you'd need base: '/repo-name/'.
  base: '/',
  plugins: [
    react(),
    glsl({ include: ['**/*.glsl', '**/*.vert', '**/*.frag'], watch: true }),
  ],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
})
```

### 0.4 `tsconfig.app.json` additions

```jsonc
{
  "compilerOptions": {
    // ...keep what Vite generated...
    "types": ["vite/client", "vite-plugin-glsl/ext"],
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  }
}
```

### 0.5 Vendor the noise shader

```bash
mkdir -p src/shaders/lib
curl -o src/shaders/lib/noise3D.glsl https://raw.githubusercontent.com/stegu/webgl-noise/master/src/noise3D.glsl
```

This gives you `float snoise(vec3 v)`. It ships with its MIT header comment intact — **leave that
header in the file**; that's the attribution requirement satisfied. Add a line to your README noting
the dependency.

### 0.6 `index.html` — the mobile-critical bits

Vite's template ships a viewport tag that is *not* sufficient for a full-screen WebGL site. Replace
the `<head>` contents with:

```html
<meta charset="UTF-8" />
<meta
  name="viewport"
  content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
/>
<meta name="theme-color" content="#03040a" />
<meta name="color-scheme" content="dark" />
<!-- iOS: full-bleed when saved to home screen, and a dark status bar -->
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<title>Raymond Zheng — Software Engineer</title>
```

Three things are doing real work here:

- **`viewport-fit=cover`** lets the canvas fill the notch/Dynamic Island area. Without it you get
  black letterbox bars on every modern iPhone. It's also what activates the `env(safe-area-inset-*)`
  variables used below — without this attribute they all resolve to `0px`.
- **`maximum-scale=1`** blocks the double-tap-to-zoom gesture. On a canvas app, pinch-zooming the
  *page* instead of the *scene* is always a bug. (Note: this does suppress a browser zoom
  affordance. It's the right call here because the text-mode fallback in Phase 11 is a normal,
  fully-zoomable page — that's where a low-vision user should land, and the bottom-bar `≡ TEXT`
  button is how they get there.)
- **`theme-color`** paints the Android Chrome browser chrome to match the void, so the site doesn't
  sit inside a white frame.

### 0.7 Global CSS reset

`src/styles/global.css`:

```css
:root {
  --void: #03040a;
  --aether: #7bdcff;
  --aether-warm: #c9a4ff;
  --ink: #dfe9ff;

  /* Safe-area insets, defaulted so desktop and non-notched devices work too. */
  --sat: env(safe-area-inset-top, 0px);
  --sar: env(safe-area-inset-right, 0px);
  --sab: env(safe-area-inset-bottom, 0px);
  --sal: env(safe-area-inset-left, 0px);

  /* Minimum comfortable touch target. Never go below this. */
  --tap: 44px;

  color-scheme: dark;
}

* { box-sizing: border-box; }

html, body, #root {
  margin: 0;
  padding: 0;
  background: var(--void);
  color: var(--ink);
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
  -webkit-text-size-adjust: 100%;   /* iOS Safari inflates text in landscape without this */
}

html, body, #root {
  /* `dvh` tracks the *dynamic* viewport, so the layout doesn't jump when the
     iOS address bar collapses on scroll. The 100% is the fallback for old UAs. */
  height: 100%;
  height: 100dvh;
  overflow: hidden;
  overscroll-behavior: none;        /* kills pull-to-refresh and rubber-banding */
}

body {
  /* Suppress the iOS long-press callout and the tap highlight flash. */
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

canvas {
  display: block;
  /* Critical: hands ALL touch gestures to us instead of the browser's scroll/zoom.
     Without this, a drag scrolls the page and pinch zooms the document. */
  touch-action: none;
}

/* Body copy must still be selectable — undo the blanket user-select above. */
.selectable, .holo-copy, .text-mode { user-select: text; -webkit-user-select: text; }

/* Every interactive control obeys the minimum target size. */
button, [role='button'], .tappable {
  min-width: var(--tap);
  min-height: var(--tap);
  touch-action: manipulation;       /* removes the legacy 300ms click delay */
}

/* Visible focus for keyboard users; suppressed for pointer users. */
:focus-visible { outline: 2px solid var(--aether); outline-offset: 2px; }
:focus:not(:focus-visible) { outline: none; }

/* Screen-reader-only content — used heavily in Phase 11 */
.sr-only {
  position: absolute; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

/* Hover styles must be gated — on touch, :hover sticks after a tap until you
   tap elsewhere, leaving buttons stuck in their hover state. */
@media (hover: hover) and (pointer: fine) {
  .holo-links a:hover { /* desktop-only hover treatment */ }
}
```

> **`touch-action: none` is the single most important line in this file.** Forget it and the site is
> unusable on a phone: every attempt to look around scrolls the page instead. It has to be on the
> canvas specifically, not on `body`, or you'll also break scrolling inside the text-mode fallback
> and the mobile bottom sheet.

### 0.8 Device detection — `src/device.ts`

Feature detection, not user-agent sniffing. Written once, used everywhere.

```ts
export const isCoarsePointer = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

export const canHover = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(hover: hover)').matches

/** iOS needs several specific workarounds (audio unlock, gyro permission, 100vh). */
export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) // iPadOS lies about platform
```

> Detect **capability**, not device. `(pointer: coarse)` correctly catches a Surface in tablet mode
> and correctly excludes a touchscreen laptop being used with a trackpad. A `/Android|iPhone/` regex
> gets both wrong.

**Checkpoint 0.** `npm run dev` serves a black page with no scrollbars and no console errors. Open it
on your phone (`npm run dev -- --host`, then hit your machine's LAN IP): the page must fill the
screen edge to edge, must not scroll or bounce when you drag, and must not zoom when you double-tap.

---

## Phase 1 — Content schema and the beacon graph

This is the phase that makes the "just edit JSON" promise real. Do it before any 3D work, so
everything downstream reads from the graph rather than from hard-coded values.

### 1.1 The schema — `src/content/schema.ts`

```ts
import { z } from 'zod'

export const LinkSchema = z.object({
  label: z.string(),
  url: z.string(),
  /** Optional glyph key rendered next to the label. */
  icon: z.enum(['github', 'linkedin', 'mail', 'external', 'doc', 'play']).optional(),
})

export const MediaSchema = z.object({
  type: z.enum(['image', 'video']),
  /** Path under /public, e.g. "/media/aurora.webp" */
  src: z.string(),
  poster: z.string().optional(),
  /** Required — this is what a screen reader and the text fallback read. */
  alt: z.string(),
  caption: z.string().optional(),
})

export const BeaconSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ids must be kebab-case: they become URLs'),
  title: z.string(),
  subtitle: z.string().optional(),
  /** Body copy. Supports **bold**, *italic*, `code`, and blank-line paragraphs. */
  body: z.string().optional(),
  links: z.array(LinkSchema).default([]),
  media: z.array(MediaSchema).default([]),
  tags: z.array(z.string()).default([]),

  /** --- graph --- */
  children: z.array(z.string()).default([]),
  /** Cross-branch "wormhole" edges. Rendered dimmer on the star map. */
  related: z.array(z.string()).default([]),

  /** --- look --- */
  /** Tints the local particle field and the beacon core. Hex. */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  /** Manual position override; omit to use auto-layout. */
  position: z.tuple([z.number(), z.number(), z.number()]).optional(),
  /** Multiplies the auto-layout distance from parent. */
  spread: z.number().default(1),
  /** Excluded from the star map and sibling rings, but still deep-linkable. */
  hidden: z.boolean().default(false),
})

export const SiteSchema = z.object({
  meta: z.object({
    name: z.string(),
    role: z.string(),
    description: z.string(),
    url: z.string(),
    ogImage: z.string().optional(),
    themeColorCold: z.string().default('#3a7bd5'),
    themeColorHot: z.string().default('#d6b8ff'),
  }),
  audio: z.object({
    ambient: z.string().optional(),
    travel: z.string().optional(),
    hover: z.string().optional(),
    enabledByDefault: z.boolean().default(false),
  }).default({ enabledByDefault: false }),
  root: z.string(),
  beacons: z.array(BeaconSchema),
})

export type Link = z.infer<typeof LinkSchema>
export type Media = z.infer<typeof MediaSchema>
export type Beacon = z.infer<typeof BeaconSchema>
export type Site = z.infer<typeof SiteSchema>
```

### 1.2 The content file — `src/content/site.json`

This is the file you edit forever after. Starter:

```json
{
  "meta": {
    "name": "Raymond Zheng",
    "role": "Software Engineer",
    "description": "Systems, graphics, and the occasional impossible deadline.",
    "url": "https://raymond1134.github.io",
    "themeColorCold": "#2f6fd0",
    "themeColorHot": "#cfb0ff"
  },
  "audio": {
    "ambient": "/audio/ambient.webm",
    "travel": "/audio/travel.webm",
    "hover": "/audio/hover.webm",
    "enabledByDefault": false
  },
  "root": "nexus",
  "beacons": [
    {
      "id": "nexus",
      "title": "Raymond Zheng",
      "subtitle": "Software Engineer",
      "body": "Welcome to the drift.\n\nPick a light.",
      "children": ["about", "work", "writing", "contact"],
      "color": "#8fd8ff"
    },
    {
      "id": "about",
      "title": "About",
      "subtitle": "Who's behind the lights",
      "body": "I build things that are **fast** and things that are *strange*, and occasionally both at once.",
      "links": [{ "label": "Résumé", "url": "/docs/resume.pdf", "icon": "doc" }],
      "media": [{ "type": "image", "src": "/media/portrait.webp", "alt": "Portrait of Raymond Zheng" }],
      "color": "#a5c8ff"
    },
    {
      "id": "work",
      "title": "Work",
      "subtitle": "Selected projects",
      "children": ["aetherweb", "project-two"],
      "color": "#c0a8ff"
    },
    {
      "id": "aetherweb",
      "title": "Aetherweb",
      "subtitle": "A million-particle portfolio",
      "body": "GPGPU flow-field simulation running a JSON-driven 3D site. You are standing in it.",
      "links": [{ "label": "Source", "url": "https://github.com/Raymond1134/Raymond1134.github.io", "icon": "github" }],
      "tags": ["three.js", "WebGL", "GLSL", "React"],
      "color": "#7bdcff"
    },
    {
      "id": "project-two",
      "title": "Project Two",
      "subtitle": "Replace me",
      "body": "Copy this object to add a project. That's the whole workflow.",
      "color": "#9fe8d0"
    },
    {
      "id": "writing",
      "title": "Writing",
      "subtitle": "Notes and post-mortems",
      "color": "#ffd6a5"
    },
    {
      "id": "contact",
      "title": "Contact",
      "links": [
        { "label": "GitHub", "url": "https://github.com/Raymond1134", "icon": "github" },
        { "label": "Email", "url": "mailto:raymondzheng2000@gmail.com", "icon": "mail" }
      ],
      "color": "#ffb3d1"
    }
  ]
}
```

### 1.3 Auto-layout — `src/content/layout.ts`

```ts
import * as THREE from 'three'
import type { Beacon, Site } from './schema'

export interface GraphNode extends Beacon {
  depth: number
  parentId: string | null
  worldPosition: THREE.Vector3
  /** Unit vector pointing away from the parent — children fan out along this. */
  outward: THREE.Vector3
}

export interface Graph {
  nodes: Map<string, GraphNode>
  order: string[]
  rootId: string
}

/** Deterministic 0..1 hash so layouts are stable across reloads and machines. */
function hash01(str: string, salt = 0): number {
  let h = 2166136261 ^ salt
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  }
  return ((h >>> 0) % 1_000_003) / 1_000_003
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

/** Distance from a beacon to its children. Shrinks with depth so the tree doesn't sprawl. */
function ringRadius(depth: number): number {
  return 150 * Math.pow(0.78, depth)
}

/** Half-angle of the cone that children are scattered into, in radians. */
function coneSpread(depth: number, childCount: number): number {
  if (depth === 0) return Math.PI          // root: full sphere
  return Math.min(Math.PI * 0.42, 0.5 + childCount * 0.16)
}

export function buildGraph(site: Site): Graph {
  const byId = new Map(site.beacons.map((b) => [b.id, b]))
  const nodes = new Map<string, GraphNode>()
  const order: string[] = []

  const root = byId.get(site.root)
  if (!root) throw new Error(`site.root "${site.root}" is not a beacon id`)

  const walk = (
    beacon: Beacon,
    parentId: string | null,
    depth: number,
    origin: THREE.Vector3,
    inheritedOutward: THREE.Vector3,
    indexInSiblings: number,
    siblingCount: number,
  ) => {
    if (nodes.has(beacon.id)) return // cycle guard

    let pos: THREE.Vector3
    let outward: THREE.Vector3

    if (beacon.position) {
      pos = new THREE.Vector3(...beacon.position)
      outward = pos.clone().sub(origin).normalize()
      if (outward.lengthSq() < 1e-6) outward = new THREE.Vector3(0, 0, -1)
    } else if (parentId === null) {
      pos = new THREE.Vector3(0, 0, 0)
      outward = new THREE.Vector3(0, 0, -1)
    } else {
      // Fibonacci-ish distribution inside a cone around `inheritedOutward`.
      const spread = coneSpread(depth - 1, siblingCount)
      const t = siblingCount === 1 ? 0 : indexInSiblings / (siblingCount - 1)
      const polar = spread * (0.35 + 0.65 * t) * (0.7 + 0.6 * hash01(beacon.id, 1))
      const azimuth = indexInSiblings * GOLDEN_ANGLE + hash01(beacon.id, 2) * Math.PI * 2

      // Build an orthonormal basis around the inherited outward axis.
      const axis = inheritedOutward.clone().normalize()
      const helper =
        Math.abs(axis.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
      const right = new THREE.Vector3().crossVectors(axis, helper).normalize()
      const up = new THREE.Vector3().crossVectors(right, axis).normalize()

      const dir = axis
        .clone()
        .multiplyScalar(Math.cos(polar))
        .addScaledVector(right, Math.sin(polar) * Math.cos(azimuth))
        .addScaledVector(up, Math.sin(polar) * Math.sin(azimuth))
        .normalize()

      const r = ringRadius(depth - 1) * beacon.spread * (0.85 + 0.3 * hash01(beacon.id, 3))
      pos = origin.clone().addScaledVector(dir, r)
      outward = dir
    }

    nodes.set(beacon.id, {
      ...beacon,
      depth,
      parentId,
      worldPosition: pos,
      outward,
    })
    order.push(beacon.id)

    const kids = beacon.children.map((id) => byId.get(id)).filter(Boolean) as Beacon[]
    kids.forEach((kid, i) => walk(kid, beacon.id, depth + 1, pos, outward, i, kids.length))
  }

  walk(root, null, 0, new THREE.Vector3(), new THREE.Vector3(0, 0, -1), 0, 1)

  // Orphans (declared but never referenced as a child) get parked in a far shell.
  site.beacons.forEach((b, i) => {
    if (nodes.has(b.id)) return
    const a = i * GOLDEN_ANGLE
    const y = 1 - (i / Math.max(1, site.beacons.length)) * 2
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    nodes.set(b.id, {
      ...b,
      depth: 1,
      parentId: site.root,
      worldPosition: new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r).multiplyScalar(200),
      outward: new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r).normalize(),
    })
    order.push(b.id)
  })

  return { nodes, order, rootId: site.root }
}

/** Beacons reachable in one hop: children + parent + siblings. */
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
```

### 1.4 Loader with validation — `src/content/index.ts`

```ts
import { z } from 'zod'
import raw from './site.json'
import { SiteSchema } from './schema'
import { buildGraph } from './layout'

const parsed = SiteSchema.safeParse(raw)

if (!parsed.success) {
  // Fail loudly in dev; a malformed site.json should never reach production silently.
  console.error('site.json failed validation:\n', z.prettifyError(parsed.error))
  throw new Error('Invalid site.json — see console for details')
}

export const site = parsed.data
export const graph = buildGraph(site)

// Referential integrity: catch typos in children/related arrays at startup.
for (const node of graph.nodes.values()) {
  for (const ref of [...node.children, ...node.related]) {
    if (!graph.nodes.has(ref)) {
      console.warn(`Beacon "${node.id}" references unknown beacon "${ref}"`)
    }
  }
}
```

> Add `"resolveJsonModule": true` to `tsconfig.app.json` if Vite's template didn't already.

**Checkpoint 1.** Add `console.table([...graph.nodes.values()].map(n => ({ id: n.id, depth: n.depth, pos: n.worldPosition.toArray().map(v => v.toFixed(0)).join(',') })))` to `main.tsx`. You should see every beacon with a sensible position, root at `0,0,0`, and no warnings. Delete the log after.

---

## Phase 2 — Scene shell, store, camera rig

### 2.1 Store — `src/state/store.ts`

```ts
import { create } from 'zustand'
import * as THREE from 'three'
import { graph, site } from '@/content'
import type { Graph } from '@/content/layout'
import { isCoarsePointer, canHover } from '@/device'

export type Phase = 'idle' | 'gather' | 'veil' | 'disperse'
export type Quality = 'low' | 'medium' | 'high' | 'ultra'

export const PARTICLE_TEX = { low: 256, medium: 512, high: 1024, ultra: 2048 } as const

/** Timeline, in seconds, of the travel sequence. */
export const TRAVEL = { gather: 0.9, veil: 0.5, disperse: 1.2 } as const
export const TRAVEL_TOTAL = TRAVEL.gather + TRAVEL.veil + TRAVEL.disperse

interface State {
  graph: Graph
  currentId: string
  previousId: string | null
  pendingId: string | null

  phase: Phase
  /** Seconds elapsed inside the current travel sequence. */
  travelClock: number

  quality: Quality
  reducedMotion: boolean
  audioEnabled: boolean
  mapOpen: boolean
  textMode: boolean
  hoveredId: string | null

  /** --- device / viewport --- */
  coarse: boolean          // touch-primary input
  hover: boolean           // hover is meaningful
  portrait: boolean
  /** Shorthand for "lay this out for a phone". Portrait AND coarse AND narrow. */
  compact: boolean
  gyroEnabled: boolean

  travelTo: (id: string, opts?: { instant?: boolean }) => void
  tickTravel: (dt: number) => void
  setHovered: (id: string | null) => void
  setQuality: (q: Quality) => void
  toggleMap: () => void
  toggleAudio: () => void
  toggleTextMode: () => void
  setViewport: (v: { portrait: boolean; compact: boolean }) => void
  setGyro: (on: boolean) => void
}

export const useStore = create<State>((set, get) => ({
  graph,
  currentId: site.root,
  previousId: null,
  pendingId: null,

  phase: 'idle',
  travelClock: 0,

  quality: 'medium',
  reducedMotion:
    typeof matchMedia !== 'undefined' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches,
  audioEnabled: false,
  mapOpen: false,
  textMode: false,
  hoveredId: null,

  coarse: isCoarsePointer(),
  hover: canHover(),
  portrait: typeof innerWidth !== 'undefined' && innerHeight > innerWidth,
  compact:
    typeof innerWidth !== 'undefined' && isCoarsePointer() && Math.min(innerWidth, innerHeight) < 600,
  gyroEnabled: false,

  travelTo: (id, opts) => {
    const s = get()
    if (!s.graph.nodes.has(id)) return
    if (id === s.currentId) return
    if (s.phase !== 'idle') return // ignore clicks mid-flight

    if (opts?.instant || s.reducedMotion) {
      set({ previousId: s.currentId, currentId: id, pendingId: null, phase: 'idle', travelClock: 0, mapOpen: false })
      return
    }
    set({ pendingId: id, phase: 'gather', travelClock: 0, mapOpen: false, hoveredId: null })
  },

  tickTravel: (dt) => {
    const s = get()
    if (s.phase === 'idle') return
    const t = s.travelClock + dt

    if (s.phase === 'gather' && t >= TRAVEL.gather) {
      // Swap identity behind the white-out.
      set({
        phase: 'veil',
        travelClock: t,
        previousId: s.currentId,
        currentId: s.pendingId ?? s.currentId,
      })
      return
    }
    if (s.phase === 'veil' && t >= TRAVEL.gather + TRAVEL.veil) {
      set({ phase: 'disperse', travelClock: t })
      return
    }
    if (s.phase === 'disperse' && t >= TRAVEL_TOTAL) {
      set({ phase: 'idle', travelClock: 0, pendingId: null })
      return
    }
    set({ travelClock: t })
  },

  setHovered: (id) => set({ hoveredId: id }),
  setQuality: (q) => set({ quality: q }),
  toggleMap: () => set((s) => ({ mapOpen: !s.mapOpen })),
  toggleAudio: () => set((s) => ({ audioEnabled: !s.audioEnabled })),
  toggleTextMode: () => set((s) => ({ textMode: !s.textMode })),
  setViewport: (v) => set(v),
  setGyro: (on) => set({ gyroEnabled: on }),
}))

/** Non-reactive helpers for use inside useFrame (avoid re-renders at 60fps). */
export const getCurrentNode = () => {
  const s = useStore.getState()
  return s.graph.nodes.get(s.currentId)!
}
export const getPreviousNode = () => {
  const s = useStore.getState()
  return s.previousId ? s.graph.nodes.get(s.previousId) ?? null : null
}

/** 0→1 across the whole travel sequence; 0 when idle. */
export const travelProgress = (s: { phase: Phase; travelClock: number }) =>
  s.phase === 'idle' ? 0 : Math.min(1, s.travelClock / TRAVEL_TOTAL)

/** The implosion amount: 0 idle → 1 fully engulfed → 0 dispersed. */
export function implodeAmount(phase: Phase, clock: number): number {
  if (phase === 'idle') return 0
  if (phase === 'gather') {
    const t = clock / TRAVEL.gather
    return t * t * t                    // ease-in cubic: slow build, violent snap
  }
  if (phase === 'veil') return 1
  const t = (clock - TRAVEL.gather - TRAVEL.veil) / TRAVEL.disperse
  return Math.pow(1 - t, 3)             // ease-out cubic back to zero
}
```

> **One store caveat.** `travelClock` lives in the store and updates every frame during a transition.
> That's fine *as long as every component uses a narrow selector* — zustand only re-renders when the
> selected slice changes, so a component selecting `phase` re-renders 3 times per travel, not 160.
> Never call `useStore()` with no selector in a rendered component. Inside `useFrame`, always read via
> `useStore.getState()` so you don't subscribe at all.

### 2.2 App shell — `src/App.tsx`

```tsx
import { Canvas } from '@react-three/fiber'
import { AdaptiveDpr, Preload } from '@react-three/drei'
import * as THREE from 'three'
import { Suspense } from 'react'
import Scene from '@/scene/Scene'
import Hud from '@/ui/Hud'
import TextMode from '@/ui/TextMode'
import { useStore } from '@/state/store'
import { useViewport } from '@/ui/useViewport'
import { isCoarsePointer } from '@/device'

const coarse = isCoarsePointer()

export default function App() {
  useViewport()
  const textMode = useStore((s) => s.textMode)

  return (
    <>
      <Canvas
        // Phones ship DPR 3–4. Rendering a million additive sprites at 3× is
        // ~9× the fill rate of 1× for a difference nobody can see at arm's length.
        // This is the single biggest mobile performance win available.
        dpr={coarse ? [1, 1.5] : [1, 2]}
        gl={{
          antialias: false,          // FXAA/SMAA via composer is cheaper; also we're additive
          alpha: false,
          // 'high-performance' asks for the discrete GPU on laptops. On phones
          // there's only one GPU, and the hint just costs battery and heat.
          powerPreference: coarse ? 'default' : 'high-performance',
          stencil: false,
          depth: true,
          failIfMajorPerformanceCaveat: false, // let software rendering try before we bail
        }}
        camera={{ fov: 62, near: 0.1, far: 4000, position: [0, 0, 26] }}
        onCreated={({ gl, scene }) => {
          gl.setClearColor(new THREE.Color('#03040a'), 1)
          gl.toneMapping = THREE.NoToneMapping // the composer does tone mapping
          scene.fog = new THREE.FogExp2('#03040a', 0.0016)
        }}
      >
        <Suspense fallback={null}>
          <Scene />
          <Preload all />
        </Suspense>
        <AdaptiveDpr pixelated />
      </Canvas>

      <Hud />
      {textMode && <TextMode />}
    </>
  )
}
```

> **A note on FOV.** It stays at 62° in both orientations. The instinct is to widen it for portrait,
> but past ~75° perspective distortion makes the particle field look like a fisheye lens. Phase 2.5
> solves portrait framing by moving the camera instead, which preserves the look.

### 2.3 Unified input — `src/input/input.ts`

One module handles mouse, touch, and pinch, and exposes a single normalised result. Nothing
downstream needs to know which device it's on.

This is deliberately **not** React state: it updates on every pointer event and would thrash the
render tree. It's a plain mutable singleton read from inside `useFrame`.

```ts
import { isCoarsePointer } from '@/device'

/** Movement (px) beyond which a pointer sequence is a drag, not a tap. */
export const TAP_SLOP = 12
/** Duration (ms) beyond which a stationary press is a long-press, not a tap. */
export const TAP_TIME = 600

export const input = {
  /** Look offset, both axes normalised to roughly [-1, 1]. */
  lean: { x: 0, y: 0 },
  /** Dolly offset in world units; negative = closer. */
  dolly: 0,
  /** Pixels travelled in the current pointer sequence. Beacons check this to reject drags. */
  dragDistance: 0,
  /** True while at least one pointer is down. */
  dragging: false,
  /** Set by the gyro handler when enabled; overrides `lean` when non-null. */
  gyro: null as { x: number; y: number } | null,
}

interface Tracked { id: number; x: number; y: number }
const active = new Map<number, Tracked>()
let startX = 0
let startY = 0
let startTime = 0
let pinchStart = 0
let dollyStart = 0
let lastInteraction = performance.now()

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const dist = (a: Tracked, b: Tracked) => Math.hypot(a.x - b.x, a.y - b.y)

export function attachInput(el: HTMLElement): () => void {
  const coarse = isCoarsePointer()

  const onDown = (e: PointerEvent) => {
    active.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY })
    // Capture so we keep getting moves even if the finger slides off the canvas.
    el.setPointerCapture?.(e.pointerId)

    if (active.size === 1) {
      startX = e.clientX
      startY = e.clientY
      startTime = performance.now()
      input.dragDistance = 0
      input.dragging = true
    } else if (active.size === 2) {
      const [a, b] = [...active.values()]
      pinchStart = dist(a, b)
      dollyStart = input.dolly
    }
    lastInteraction = performance.now()
  }

  const onMove = (e: PointerEvent) => {
    const prev = active.get(e.pointerId)

    // Mouse with no button held: direct positional lean, no drag required.
    if (!coarse && active.size === 0) {
      const r = el.getBoundingClientRect()
      input.lean.x = ((e.clientX - r.left) / r.width) * 2 - 1
      input.lean.y = -(((e.clientY - r.top) / r.height) * 2 - 1)
      return
    }
    if (!prev) return

    const dx = e.clientX - prev.x
    const dy = e.clientY - prev.y
    active.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY })
    input.dragDistance = Math.hypot(e.clientX - startX, e.clientY - startY)
    lastInteraction = performance.now()

    if (active.size === 2) {
      // Pinch → dolly. Positive spread pulls you in.
      const [a, b] = [...active.values()]
      const d = dist(a, b)
      if (pinchStart > 0) {
        input.dolly = clamp(dollyStart + (d - pinchStart) * 0.06, -14, 16)
      }
      return
    }

    // Single-finger drag → accumulate lean. Scale by viewport so the same physical
    // swipe produces the same rotation on a phone and a tablet.
    const r = el.getBoundingClientRect()
    input.lean.x = clamp(input.lean.x + (dx / r.width) * 2.6, -1, 1)
    input.lean.y = clamp(input.lean.y - (dy / r.height) * 2.6, -1, 1)
  }

  const onUp = (e: PointerEvent) => {
    active.delete(e.pointerId)
    el.releasePointerCapture?.(e.pointerId)
    if (active.size === 0) {
      input.dragging = false
      pinchStart = 0
    }
  }

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    input.dolly = clamp(input.dolly - e.deltaY * 0.012, -14, 16)
    lastInteraction = performance.now()
  }

  // Double-tap / double-click recentres.
  const onDouble = () => recentre()

  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onUp)
  el.addEventListener('wheel', onWheel, { passive: false })
  el.addEventListener('dblclick', onDouble)

  // iOS Safari still fires these legacy gesture events and will zoom the page
  // during a two-finger pinch unless they're explicitly cancelled.
  const stop = (e: Event) => e.preventDefault()
  el.addEventListener('gesturestart', stop as EventListener)
  el.addEventListener('gesturechange', stop as EventListener)

  return () => {
    el.removeEventListener('pointerdown', onDown)
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerup', onUp)
    el.removeEventListener('pointercancel', onUp)
    el.removeEventListener('wheel', onWheel)
    el.removeEventListener('dblclick', onDouble)
    el.removeEventListener('gesturestart', stop as EventListener)
    el.removeEventListener('gesturechange', stop as EventListener)
  }
}

export function recentre() {
  input.lean.x = 0
  input.lean.y = 0
  input.dolly = 0
}

/** Called each frame: drifts the view back toward centre after a period of stillness. */
export function settleInput(dt: number) {
  if (input.dragging) return
  const idle = (performance.now() - lastInteraction) / 1000
  if (idle < 2.5) return
  // Very slow — a ~6s time constant. Enough to stop the view getting stuck at a
  // weird angle, slow enough that it never feels like it's fighting you.
  const k = 1 - Math.pow(0.85, dt)
  input.lean.x += (0 - input.lean.x) * k
  input.lean.y += (0 - input.lean.y) * k
  input.dolly += (0 - input.dolly) * k
}
```

> **Why accumulate on touch but read absolute position on mouse?** They're different affordances. A
> mouse has a persistent cursor whose position *is* meaningful, so absolute mapping feels immediate
> and requires no clicking. A finger has no position when it isn't touching, so touch has to be
> relative. Trying to use one model for both gives you either a mouse that needs dragging or a touch
> view that snaps to wherever you happened to tap.

### 2.4 Optional gyroscope — `src/input/gyro.ts`

```ts
import { input } from './input'
import { isIOS } from '@/device'

let attached = false

/** MUST be called from inside a user-gesture handler — iOS rejects it otherwise. */
export async function enableGyro(): Promise<boolean> {
  const DOE = (window as any).DeviceOrientationEvent
  if (!DOE) return false

  if (typeof DOE.requestPermission === 'function') {
    try {
      const res = await DOE.requestPermission()
      if (res !== 'granted') return false
    } catch {
      return false   // throws if not called from a gesture
    }
  }

  if (!attached) {
    let base: { beta: number; gamma: number } | null = null
    addEventListener('deviceorientation', (e) => {
      if (e.beta == null || e.gamma == null) return
      // Calibrate against however the phone is being held at enable time,
      // rather than assuming it's flat on a table.
      if (!base) base = { beta: e.beta, gamma: e.gamma }
      const dB = (e.beta - base.beta) / 35
      const dG = (e.gamma - base.gamma) / 35
      input.gyro = {
        x: Math.max(-1, Math.min(1, dG)),
        y: Math.max(-1, Math.min(1, -dB)),
      }
    })
    attached = true
  }
  return true
}

export function disableGyro() { input.gyro = null }
```

Surface this as a small toggle in the mobile bottom bar, visible only when
`coarse && 'DeviceOrientationEvent' in window`. Off by default, and it must never be the only way to
look around — `input.gyro` is read *in addition to* `input.lean`, not instead of it.

### 2.5 Camera rig — `src/scene/CameraRig.tsx`

The rig owns camera position absolutely; nothing else touches it. Anchor distance is **derived** from
the panel width and the real horizontal frustum, so portrait framing is correct with no magic numbers.

```tsx
import { useFrame, useThree } from '@react-three/fiber'
import { useRef, useEffect } from 'react'
import * as THREE from 'three'
import { useStore, getCurrentNode, getPreviousNode, TRAVEL } from '@/state/store'
import { input, attachInput, settleInput } from '@/input/input'
import { panelSizeFor } from '@/scene/ui3d/panelLayout'

const tmpA = new THREE.Vector3()
const tmpB = new THREE.Vector3()
const tmpC = new THREE.Vector3()

/**
 * How far back the camera sits. Solved from the frustum rather than hard-coded,
 * so a 20-unit-wide panel in portrait and a 30-unit-wide panel in landscape are
 * both framed with the same margin.
 */
export function anchorDistance(camera: THREE.PerspectiveCamera, panelWidth: number, panelHeight: number) {
  const vFov = THREE.MathUtils.degToRad(camera.fov)
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect)

  const distForWidth = panelWidth / 2 / Math.tan(hFov / 2)
  const distForHeight = panelHeight / 2 / Math.tan(vFov / 2)

  // Fit whichever axis is tighter, then add breathing room.
  return Math.max(distForWidth, distForHeight) * 1.35
}

export function anchorFor(
  node: { worldPosition: THREE.Vector3; outward: THREE.Vector3 },
  distance: number,
) {
  return node.worldPosition
    .clone()
    .addScaledVector(node.outward, -distance)
    .add(new THREE.Vector3(0, distance * 0.09, 0))
}

export default function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const domElement = useThree((s) => s.gl.domElement)
  const lookTarget = useRef(new THREE.Vector3())

  useEffect(() => attachInput(domElement), [domElement])

  useFrame((_, dt) => {
    const s = useStore.getState()
    s.tickTravel(Math.min(dt, 1 / 20)) // clamp so a tab-switch doesn't skip the transition
    settleInput(dt)

    const current = getCurrentNode()
    const prev = getPreviousNode()

    const panel = panelSizeFor(s.compact, s.portrait)
    const dist = anchorDistance(camera, panel.w, panel.h) + input.dolly

    let camPos: THREE.Vector3
    let look: THREE.Vector3

    if (s.phase === 'veil' && prev) {
      const t = (s.travelClock - TRAVEL.gather) / TRAVEL.veil
      const e = t * t * (3 - 2 * t) // smoothstep
      const from = anchorFor(prev, dist)
      const to = anchorFor(current, dist)
      const mid = tmpA.copy(from).lerp(to, 0.5).addScaledVector(current.outward, dist * 1.2)
      camPos = cubicBezier(from, tmpB.copy(from).lerp(mid, 0.7), tmpC.copy(to).lerp(mid, 0.7), to, e)
      look = current.worldPosition
    } else {
      camPos = anchorFor(current, dist)
      look = current.worldPosition
    }

    // Look-around. Gyro (if enabled) adds to drag/pointer lean rather than replacing it.
    const leanX = (input.lean.x + (input.gyro?.x ?? 0)) * dist * 0.2
    const leanY = (input.lean.y + (input.gyro?.y ?? 0)) * dist * 0.13

    const right = tmpA.set(1, 0, 0).applyQuaternion(camera.quaternion)
    const up = tmpB.set(0, 1, 0).applyQuaternion(camera.quaternion)
    const desired = camPos.clone().addScaledVector(right, leanX).addScaledVector(up, leanY)

    // Frame-rate independent damping. Snappier while dragging so touch feels direct.
    const base = s.phase === 'veil' ? 0 : input.dragging ? 0.00002 : 0.0015
    camera.position.lerp(desired, s.phase === 'veil' ? 1 : 1 - Math.pow(base, dt))

    lookTarget.current.lerp(look, 1 - Math.pow(0.002, dt))
    camera.lookAt(lookTarget.current)
  })

  return null
}

function cubicBezier(
  p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, t: number,
): THREE.Vector3 {
  const u = 1 - t
  return new THREE.Vector3()
    .addScaledVector(p0, u * u * u)
    .addScaledVector(p1, 3 * u * u * t)
    .addScaledVector(p2, 3 * u * t * t)
    .addScaledVector(p3, t * t * t)
}
```

> **Why `1 - Math.pow(k, dt)` instead of a fixed lerp factor?** A constant `0.1` lerp moves the camera
> twice as fast at 120fps as at 60fps — and phones run at 60, 90, and 120Hz depending on the model and
> the current thermal state, so this is *more* important on mobile than desktop. The exponential form
> is frame-rate independent. Use it everywhere you damp anything.

### 2.6 Viewport tracking — `src/ui/useViewport.ts`

```ts
import { useEffect } from 'react'
import { useStore } from '@/state/store'
import { isCoarsePointer } from '@/device'

export function useViewport() {
  useEffect(() => {
    const update = () => {
      const w = innerWidth
      const h = innerHeight
      useStore.getState().setViewport({
        portrait: h > w,
        compact: isCoarsePointer() && Math.min(w, h) < 600,
      })
      // Publish the real viewport height as a CSS var — belt and braces alongside
      // `dvh`, since older iOS Safari reports 100vh as the *expanded* height.
      document.documentElement.style.setProperty('--vh', `${h * 0.01}px`)
    }
    update()
    addEventListener('resize', update)
    // `orientationchange` fires *before* the new dimensions are readable on iOS,
    // so re-read on the next frame as well.
    addEventListener('orientationchange', () => requestAnimationFrame(update))
    return () => removeEventListener('resize', update)
  }, [])
}
```

### 2.7 Scene skeleton — `src/scene/Scene.tsx`

```tsx
import CameraRig from './CameraRig'
import ParticleField from './particles/ParticleField'
import Beacons from './beacons/Beacons'
import HoloPanel from './ui3d/HoloPanel'
import Post from './Post'
import Veil from './Veil'

export default function Scene() {
  return (
    <>
      <CameraRig />
      <ParticleField />
      <Beacons />
      <HoloPanel />
      <Veil />
      <Post />
    </>
  )
}
```

Stub out `ParticleField`, `Beacons`, `HoloPanel`, `Veil`, `Post` as `() => null` so the app runs.

**Checkpoint 2.** Black screen, no errors, and adding a temporary `<mesh><boxGeometry/><meshBasicMaterial color="hotpink"/></mesh>` at a beacon's `worldPosition` shows the box, which drifts slightly as you move the mouse. Remove the box.

---

## Phase 3 — The particle engine (GPGPU)

The core. Two float textures ping-pong every frame: one holds positions (`xyz` + life in `w`), one
holds velocities. A `THREE.Points` cloud reads them in its vertex shader.

### 3.1 How it works, in one paragraph

Each particle is one texel. A 1024×1024 texture is 1,048,576 particles. Each frame we render two
full-screen quads into off-screen float render targets — one runs the velocity shader (forces →
new velocity), one runs the position shader (integrate → new position). `GPUComputationRenderer`
manages the double-buffering. Then the visible `Points` mesh, whose geometry is just a dummy list of
UV coordinates, does `texture2D(uPositions, aRef)` in the vertex shader to find out where each vertex
belongs. No data ever crosses the CPU/GPU boundary after init. That's why a million particles is
cheap and why the same trick with CPU-side attribute updates would be hopeless.

### 3.2 The curl-noise helper — `src/shaders/lib/curl.glsl`

```glsl
// Requires snoise(vec3) — include noise3D.glsl before this file.

/**
 * A 3-component vector potential built from three decorrelated noise samples.
 * The large offsets keep the three channels from correlating.
 */
vec3 aetherPotential(vec3 p) {
  return vec3(
    snoise(p),
    snoise(p + vec3(123.4, 56.7, 89.1)),
    snoise(p + vec3(-45.6, 78.9, -12.3))
  );
}

/**
 * curl(F) = ( dFz/dy - dFy/dz,  dFx/dz - dFz/dx,  dFy/dx - dFx/dy )
 * Central differences. The result is divergence-free, which is exactly why
 * particles form long coherent filaments instead of clumping and gapping.
 */
vec3 curlNoise(vec3 p, float eps) {
  vec3 dx = vec3(eps, 0.0, 0.0);
  vec3 dy = vec3(0.0, eps, 0.0);
  vec3 dz = vec3(0.0, 0.0, eps);

  vec3 px1 = aetherPotential(p + dx), px0 = aetherPotential(p - dx);
  vec3 py1 = aetherPotential(p + dy), py0 = aetherPotential(p - dy);
  vec3 pz1 = aetherPotential(p + dz), pz0 = aetherPotential(p - dz);

  float x = (py1.z - py0.z) - (pz1.y - pz0.y);
  float y = (pz1.x - pz0.x) - (px1.z - px0.z);
  float z = (px1.y - px0.y) - (py1.x - py0.x);

  return vec3(x, y, z) / (2.0 * eps);
}

/** Cheap hash for per-particle randomness, keyed off the particle's texel UV. */
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
```

> **Cost note.** Central-difference curl is 6 potential evaluations = **18 `snoise` calls per particle
> per frame**. That is the single most expensive thing in this project. Phase 10 has three levers to
> cut it. Don't optimise yet — measure first.

### 3.3 Velocity simulation — `src/shaders/sim/velocity.frag`

```glsl
#include ../lib/noise3D;
#include ../lib/curl;

uniform float uTime;
uniform float uDt;

uniform vec3  uHome;       // beacon we are orbiting (world space)
uniform vec3  uFocus;      // implosion target — the camera
uniform float uImplode;    // 0 idle .. 1 fully engulfed

uniform float uShellRadius;   // preferred distance from uHome
uniform float uShellSoftness;
uniform float uCurlFreq;
uniform float uCurlAmp;
uniform float uSwirl;
uniform float uDamping;
uniform float uMaxSpeed;

// `resolution` is #defined by GPUComputationRenderer.
// `texturePosition` and `textureVelocity` samplers are injected automatically.

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;

  vec4 posData = texture2D(texturePosition, uv);
  vec4 velData = texture2D(textureVelocity, uv);
  vec3 pos = posData.xyz;
  vec3 vel = velData.xyz;

  float seed = velData.w;                 // per-particle constant 0..1
  float scaleJitter = 0.6 + 1.1 * seed;   // some particles ride bigger eddies

  vec3 force = vec3(0.0);

  // --- 1. Ambient flow field: the "dance" ---------------------------------
  vec3 samplePoint = pos * (uCurlFreq * scaleJitter) + vec3(0.0, uTime * 0.05, uTime * 0.03);
  force += curlNoise(samplePoint, 0.35) * uCurlAmp;

  // --- 2. Shell spring: keeps the swarm around the beacon ------------------
  vec3 toHome = uHome - pos;
  float dist = length(toHome) + 1e-4;
  vec3 radial = toHome / dist;
  // Signed distance from the preferred shell. Positive = too far out.
  float shellError = dist - uShellRadius;
  force += radial * shellError * uShellSoftness;

  // --- 3. Tangential swirl: the spiral ------------------------------------
  // Cross the radial direction with a slowly precessing axis so the vortex
  // never settles into a flat, obviously-procedural disc.
  vec3 axis = normalize(vec3(sin(uTime * 0.07), 1.0, cos(uTime * 0.05)));
  vec3 tangent = normalize(cross(radial, axis) + 1e-5);
  force += tangent * uSwirl * (0.5 + 0.9 * seed);

  // --- 4. Implosion: everything collapses onto the camera ------------------
  if (uImplode > 0.001) {
    vec3 toFocus = uFocus - pos;
    float fd = length(toFocus) + 1e-4;
    vec3 fdir = toFocus / fd;

    // Spiral inward rather than falling straight in — much more magical.
    vec3 spiral = normalize(cross(fdir, vec3(0.0, 1.0, 0.0)) + 1e-5);
    float pull = uImplode * uImplode * 240.0;

    force += fdir * pull;
    force += spiral * uImplode * 70.0 * (0.4 + seed);
    // Suppress ambient forces so the collapse reads as deliberate.
    force *= mix(1.0, 1.9, uImplode);
  }

  vel += force * uDt;

  // Damping (frame-rate independent) + speed clamp.
  vel *= pow(uDamping, uDt * 60.0);
  float sp = length(vel);
  if (sp > uMaxSpeed) vel *= uMaxSpeed / sp;

  gl_FragColor = vec4(vel, seed);
}
```

### 3.4 Position integration — `src/shaders/sim/position.frag`

```glsl
#include ../lib/curl;

uniform float uTime;
uniform float uDt;
uniform vec3  uHome;
uniform float uShellRadius;
uniform float uLifeScale;
uniform float uRespawn;   // 1.0 = allow respawns, 0.0 = freeze (used during veil)

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;

  vec4 posData = texture2D(texturePosition, uv);
  vec4 velData = texture2D(textureVelocity, uv);

  vec3 pos  = posData.xyz;
  float life = posData.w;

  pos += velData.xyz * uDt;

  // Lifetime gives us continuous turnover, which hides the seams when the
  // swarm relocates to a new beacon.
  float rate = (0.045 + 0.06 * hash12(uv)) * uLifeScale;
  life -= uDt * rate;

  if (life <= 0.0 && uRespawn > 0.5) {
    // Respawn on a jittered shell around the new home.
    float a = hash12(uv + uTime * 0.137) * 6.2831853;
    float z = hash12(uv.yx + uTime * 0.271) * 2.0 - 1.0;
    float r = sqrt(max(0.0, 1.0 - z * z));
    vec3 dir = vec3(cos(a) * r, z, sin(a) * r);

    float radius = uShellRadius * (0.55 + 0.85 * hash12(uv * 3.7 + uTime * 0.05));
    pos  = uHome + dir * radius;
    life = 1.0;
  }

  gl_FragColor = vec4(pos, life);
}
```

### 3.5 Render shaders — `src/shaders/render/particle.vert` / `.frag`

```glsl
// particle.vert
uniform sampler2D uPositions;
uniform sampler2D uVelocities;
uniform float uSize;
uniform float uPixelRatio;
uniform float uImplode;

attribute vec2 aRef;   // which texel this vertex reads

varying float vSpeed;
varying float vLife;
varying float vDepth;

void main() {
  vec4 p = texture2D(uPositions, aRef);
  vec3 v = texture2D(uVelocities, aRef).xyz;

  vec4 mv = modelViewMatrix * vec4(p.xyz, 1.0);
  gl_Position = projectionMatrix * mv;

  float dist = max(-mv.z, 0.001);
  // Perspective size attenuation. The 900.0 is a taste constant; tune in Leva.
  gl_PointSize = uSize * uPixelRatio * (900.0 / dist);
  // During the engulf, particles are right on the lens — cap the size or a
  // handful of sprites will cover the whole screen and look like a bug.
  gl_PointSize = min(gl_PointSize, 64.0 * uPixelRatio * (1.0 + uImplode * 1.5));

  vSpeed = length(v);
  vLife  = p.w;
  vDepth = dist;
}
```

```glsl
// particle.frag
precision highp float;

uniform vec3  uColorCold;
uniform vec3  uColorHot;
uniform vec3  uColorAccent;
uniform float uOpacity;
uniform float uSpeedScale;
uniform float uFogDensity;

varying float vSpeed;
varying float vLife;
varying float vDepth;

void main() {
  // Soft round sprite, no texture needed.
  vec2 c = gl_PointCoord - 0.5;
  float d2 = dot(c, c);
  if (d2 > 0.25) discard;

  float core = exp(-d2 * 14.0);        // tight bright centre
  float halo = exp(-d2 * 4.0) * 0.35;  // soft surrounding glow
  float alpha = core + halo;

  // Fast particles run hot. This is what sells "energy".
  float heat = smoothstep(0.0, uSpeedScale, vSpeed);
  vec3 col = mix(uColorCold, uColorHot, heat);
  col = mix(col, uColorAccent, smoothstep(0.75, 1.0, heat) * 0.6);

  // Fade in on spawn (life near 1), fade out on death (life near 0).
  float birth = smoothstep(1.0, 0.88, vLife);
  float death = smoothstep(0.0, 0.14, vLife);

  // Exponential distance fade so the far field dissolves into the void.
  float fog = exp(-vDepth * uFogDensity);

  gl_FragColor = vec4(col * (0.6 + heat * 1.4), alpha * uOpacity * birth * death * fog);
}
```

> `col * (0.6 + heat * 1.4)` deliberately pushes bright particles above 1.0. Those over-bright values
> are what the bloom pass in Phase 8 latches onto. Without HDR headroom, bloom looks like a blur.

### 3.6 The React component — `src/scene/particles/ParticleField.tsx`

```tsx
import { useMemo, useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GPUComputationRenderer, type Variable } from 'three/addons/misc/GPUComputationRenderer.js'

import velocityShader from '@/shaders/sim/velocity.frag'
import positionShader from '@/shaders/sim/position.frag'
import particleVert from '@/shaders/render/particle.vert'
import particleFrag from '@/shaders/render/particle.frag'

import { site } from '@/content'
import { isCoarsePointer } from '@/device'
import {
  useStore, PARTICLE_TEX, implodeAmount, getCurrentNode, getPreviousNode, TRAVEL,
} from '@/state/store'

const SHELL_RADIUS = 46
const tmpColor = new THREE.Color()
const tmpVec = new THREE.Vector3()
const homeVec = new THREE.Vector3()

export default function ParticleField() {
  const gl = useThree((s) => s.gl)
  const quality = useStore((s) => s.quality)
  const size = PARTICLE_TEX[quality]

  const points = useRef<THREE.Points>(null!)

  /* ---------- simulation setup (re-created when quality changes) ---------- */
  const sim = useMemo(() => {
    const gpu = new GPUComputationRenderer(size, size, gl)

    // GPUComputationRenderer defaults to FloatType, which needs EXT_color_buffer_float
    // to be *renderable*. Plenty of mobile GPUs expose WebGL2 without it — you get a
    // silently incomplete framebuffer and a black screen, not an error. Check the
    // extension, not the WebGL version.
    //
    // Half-float also halves memory bandwidth, which is the actual bottleneck on
    // mobile. It costs precision, which is why the world is kept small: `ringRadius`
    // shrinking with depth keeps |pos| under ~400, well inside half-float's ~2048
    // integer-exact range.
    const canRenderFloat = gl.getContext().getExtension('EXT_color_buffer_float') !== null
    if (!canRenderFloat || isCoarsePointer()) gpu.setDataType(THREE.HalfFloatType)

    const pos0 = gpu.createTexture()
    const vel0 = gpu.createTexture()
    seedTextures(pos0, vel0, size)

    const velVar = gpu.addVariable('textureVelocity', velocityShader, vel0)
    const posVar = gpu.addVariable('texturePosition', positionShader, pos0)

    gpu.setVariableDependencies(velVar, [velVar, posVar])
    gpu.setVariableDependencies(posVar, [velVar, posVar])

    Object.assign(velVar.material.uniforms, {
      uTime: { value: 0 },
      uDt: { value: 0 },
      uHome: { value: new THREE.Vector3() },
      uFocus: { value: new THREE.Vector3() },
      uImplode: { value: 0 },
      uShellRadius: { value: SHELL_RADIUS },
      uShellSoftness: { value: 0.55 },
      uCurlFreq: { value: 0.011 },
      uCurlAmp: { value: 14.0 },
      uSwirl: { value: 5.5 },
      uDamping: { value: 0.965 },
      uMaxSpeed: { value: 42.0 },
    })

    Object.assign(posVar.material.uniforms, {
      uTime: { value: 0 },
      uDt: { value: 0 },
      uHome: { value: new THREE.Vector3() },
      uShellRadius: { value: SHELL_RADIUS },
      uLifeScale: { value: 1 },
      uRespawn: { value: 1 },
    })

    const err = gpu.init()
    if (err) console.error('GPUComputationRenderer:', err)

    return { gpu, velVar, posVar }
  }, [gl, size])

  useEffect(() => () => sim.gpu.dispose(), [sim])

  /* ---------- render geometry: one vertex per texel ---------- */
  const geometry = useMemo(() => {
    const count = size * size
    const refs = new Float32Array(count * 2)
    for (let i = 0; i < count; i++) {
      refs[i * 2 + 0] = (i % size) / size + 0.5 / size
      refs[i * 2 + 1] = Math.floor(i / size) / size + 0.5 / size
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('aRef', new THREE.BufferAttribute(refs, 2))
    // Dummy position attribute so three doesn't try to compute a bounding sphere from nothing.
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4)
    return g
  }, [size])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: particleVert,
        fragmentShader: particleFrag,
        uniforms: {
          uPositions: { value: null },
          uVelocities: { value: null },
          uSize: { value: 0.55 },
          uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
          uImplode: { value: 0 },
          uOpacity: { value: 0.85 },
          uSpeedScale: { value: 18.0 },
          uFogDensity: { value: 0.0022 },
          uColorCold: { value: new THREE.Color(site.meta.themeColorCold) },
          uColorHot: { value: new THREE.Color(site.meta.themeColorHot) },
          uColorAccent: { value: new THREE.Color('#ffffff') },
        },
        transparent: true,
        depthWrite: false,          // additive sprites must not write depth
        depthTest: true,
        blending: THREE.AdditiveBlending,
        toneMapped: false,          // composer handles tone mapping
      }),
    [],
  )

  /* ---------- per-frame ---------- */
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const s = useStore.getState()
    const node = getCurrentNode()
    const prev = getPreviousNode()

    const implode = implodeAmount(s.phase, s.travelClock)

    // Home lerps from the old beacon to the new one during dispersal, so the
    // swarm "arrives" rather than snapping.
    if (s.phase === 'disperse' && prev) {
      const t = (s.travelClock - TRAVEL.gather - TRAVEL.veil) / TRAVEL.disperse
      homeVec.copy(prev.worldPosition).lerp(node.worldPosition, t * t * (3 - 2 * t))
    } else {
      homeVec.copy(node.worldPosition)
    }

    const vu = sim.velVar.material.uniforms
    const pu = sim.posVar.material.uniforms

    vu.uTime.value = state.clock.elapsedTime
    vu.uDt.value = dt
    vu.uImplode.value = implode
    vu.uHome.value.copy(homeVec)
    vu.uFocus.value.copy(state.camera.position)
    // The shell tightens as we gather, giving the swarm a "held breath" beat.
    vu.uShellRadius.value = SHELL_RADIUS * (1 - implode * 0.55)

    pu.uTime.value = state.clock.elapsedTime
    pu.uDt.value = dt
    pu.uHome.value.copy(homeVec)
    pu.uShellRadius.value = vu.uShellRadius.value
    // Freeze respawns during gather/veil — a particle popping into existence
    // mid-implosion breaks the illusion badly.
    pu.uRespawn.value = s.phase === 'gather' || s.phase === 'veil' ? 0 : 1
    pu.uLifeScale.value = s.phase === 'disperse' ? 2.2 : 1.0

    // Tint the swarm toward the current beacon's colour.
    if (node.color) {
      tmpColor.set(node.color)
      ;(material.uniforms.uColorHot.value as THREE.Color).lerp(tmpColor, 1 - Math.pow(0.06, dt))
    }
    material.uniforms.uImplode.value = implode
    material.uniforms.uOpacity.value = 0.85 + implode * 0.5

    sim.gpu.compute()
    material.uniforms.uPositions.value = sim.gpu.getCurrentRenderTarget(sim.posVar).texture
    material.uniforms.uVelocities.value = sim.gpu.getCurrentRenderTarget(sim.velVar).texture
  })

  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} />
}

/** Fill the initial position/velocity textures. Runs once, on the CPU. */
function seedTextures(pos: THREE.DataTexture, vel: THREE.DataTexture, size: number) {
  const p = pos.image.data as Float32Array
  const v = vel.image.data as Float32Array
  const count = size * size

  for (let i = 0; i < count; i++) {
    const i4 = i * 4

    // Uniform point on a sphere (correct method — naive angle sampling clusters at the poles).
    const u = Math.random() * 2 - 1
    const theta = Math.random() * Math.PI * 2
    const r = Math.sqrt(1 - u * u)
    const radius = SHELL_RADIUS * (0.4 + Math.random() * 1.0)

    p[i4 + 0] = Math.cos(theta) * r * radius
    p[i4 + 1] = u * radius
    p[i4 + 2] = Math.sin(theta) * r * radius
    p[i4 + 3] = Math.random()          // life — staggered so turnover is continuous

    v[i4 + 0] = (Math.random() - 0.5) * 2
    v[i4 + 1] = (Math.random() - 0.5) * 2
    v[i4 + 2] = (Math.random() - 0.5) * 2
    v[i4 + 3] = Math.random()          // per-particle seed, never written again
  }
}
```

### 3.7 Stretch: real local cohesion

If you later want genuine emergent flocking on top of the flow field, the tractable approach is a
**coarse velocity grid**, not neighbour search:

1. Additively render all particles as points into a 64×64×64 volume flattened into a 512×512 2D
   texture (8×8 tiles of 64×64 slices), accumulating `vec4(velocity, 1.0)`.
2. In the velocity shader, sample that grid at the particle's cell, divide by `.w` to get the mean
   local velocity, and steer toward it (alignment) and toward the cell centre of mass (cohesion).
3. Separation falls out of the divergence-free curl field for free.

Cost: one extra additive draw of N points plus one texture fetch. It's maybe 15% overhead for real
flocking. Ship without it; add it when the rest is done.

**Checkpoint 3.** A slowly churning sphere of glowing points around the origin. Filaments should
form and dissolve. If you see a static ball, `uCurlAmp` is too low or `snoise` failed to include —
check the Network tab for the compiled shader and look for `#include` left in the source. If
everything is white, `uMaxSpeed`/`uSize` are too high. If nothing renders, log
`gpu.init()`'s return value.

---

## Phase 4 — Beacons

### 4.1 Beacon visual — `src/scene/beacons/Beacon.tsx`

```tsx
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { GraphNode } from '@/content/layout'
import { useStore } from '@/state/store'
import { input, TAP_SLOP } from '@/input/input'

/**
 * Hit-sphere radius as a fraction of camera distance. 0.11 subtends roughly
 * 6.3°, which lands near 60px on a phone in portrait — comfortably above the
 * 44px minimum, with room for an imprecise thumb.
 */
const TAP_TARGET_FACTOR = 0.11

interface Props {
  node: GraphNode
  /** 'current' | 'reachable' | 'distant' */
  role: 'current' | 'reachable' | 'distant'
}

export default function Beacon({ node, role }: Props) {
  const group = useRef<THREE.Group>(null!)
  const core = useRef<THREE.Mesh>(null!)
  const halo = useRef<THREE.Sprite>(null!)
  const hit = useRef<THREE.Mesh>(null!)

  const hovered = useStore((s) => s.hoveredId === node.id)
  const setHovered = useStore((s) => s.setHovered)
  const travelTo = useStore((s) => s.travelTo)
  const phase = useStore((s) => s.phase)
  const coarse = useStore((s) => s.coarse)
  const canHoverPointer = useStore((s) => s.hover)

  const color = useMemo(() => new THREE.Color(node.color ?? '#8fd8ff'), [node.color])
  const haloTexture = useMemo(() => makeGlowTexture(), [])

  const interactive = role !== 'current' && phase === 'idle'

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const pulse = 1 + Math.sin(t * 1.6 + node.worldPosition.x) * 0.09
    const boost = hovered ? 1.45 : 1

    core.current.scale.setScalar(pulse * boost)
    group.current.rotation.y = t * 0.16

    const d = state.camera.position.distanceTo(node.worldPosition)

    // Distant beacons must stay visible as glints: scale the halo with distance
    // so it holds roughly constant screen size instead of vanishing.
    const haloScale = THREE.MathUtils.clamp(d * 0.06, 2.5, 26) * boost
    halo.current.scale.setScalar(haloScale)
    ;(halo.current.material as THREE.SpriteMaterial).opacity =
      (role === 'current' ? 0.55 : role === 'reachable' ? 0.9 : 0.4) * (hovered ? 1.4 : 1)

    // Screen-space-constant hit proxy. A fixed 7-unit sphere is a comfortable
    // click at 30 units away and an impossible tap at 150. Scaling by distance
    // keeps the target at a roughly constant ~fingertip size on screen.
    hit.current.scale.setScalar(THREE.MathUtils.clamp(d * TAP_TARGET_FACTOR, 6, 46))
  })

  return (
    <group ref={group} position={node.worldPosition}>
      {/* Invisible generous hit proxy — the visible core is far too small to hit reliably,
          and on touch the target has to survive a fingertip's ~9mm contact patch. */}
      <mesh
        ref={hit}
        visible={false}
        onPointerOver={(e) => {
          // Hover is a pointer-device enhancement. On touch, pointerover fires on
          // tap and then STICKS — the beacon would stay swollen until you tap
          // something else. Gate it on real hover capability.
          if (!canHoverPointer || !interactive) return
          e.stopPropagation()
          setHovered(node.id)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          if (!canHoverPointer) return
          setHovered(null)
          document.body.style.cursor = ''
        }}
        onPointerUp={(e) => {
          if (!interactive) return
          // Reject the drag-that-happened-to-end-on-a-beacon. Without this,
          // every swipe to look around fires a travel the moment you lift off
          // over a beacon — by far the most common touch bug in 3D sites.
          if (input.dragDistance > TAP_SLOP) return
          e.stopPropagation()
          setHovered(null)
          travelTo(node.id)
        }}
      >
        <sphereGeometry args={[1, 12, 12]} />
      </mesh>

      <mesh ref={core}>
        <icosahedronGeometry args={[1.5, 2]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>

      {/* Two counter-rotating rings read as "constructed", not "natural". */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[3.4, 0.045, 8, 96]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} toneMapped={false} />
      </mesh>
      <mesh rotation={[Math.PI / 2.6, 0.4, 0]}>
        <torusGeometry args={[4.6, 0.03, 8, 96]} />
        <meshBasicMaterial color={color} transparent opacity={0.28} toneMapped={false} />
      </mesh>

      <sprite ref={halo}>
        <spriteMaterial
          map={haloTexture}
          color={color}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
    </group>
  )
}

/** Radial-gradient glow sprite, generated once on a canvas. No asset needed. */
function makeGlowTexture(): THREE.Texture {
  const s = 128
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0.0, 'rgba(255,255,255,1)')
  g.addColorStop(0.15, 'rgba(255,255,255,0.65)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.15)')
  g.addColorStop(1.0, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
```

### 4.2 Beacon set — `src/scene/beacons/Beacons.tsx`

```tsx
import { useMemo } from 'react'
import Beacon from './Beacon'
import { neighborsOf } from '@/content/layout'
import { useStore } from '@/state/store'

export default function Beacons() {
  const graph = useStore((s) => s.graph)
  const currentId = useStore((s) => s.currentId)

  const roles = useMemo(() => {
    const reachable = new Set(neighborsOf(graph, currentId))
    return [...graph.nodes.values()].map((node) => ({
      node,
      role: node.id === currentId
        ? ('current' as const)
        : reachable.has(node.id)
        ? ('reachable' as const)
        : ('distant' as const),
    }))
  }, [graph, currentId])

  return (
    <>
      {roles.map(({ node, role }) => (
        <Beacon key={node.id} node={node} role={role} />
      ))}
    </>
  )
}
```

> **Design note.** Distant (non-reachable) beacons are still *rendered* — they're what makes the space
> feel inhabited and give you the "in the distance you see a beacon" moment — but they aren't
> clickable. Clicking one from across the graph would break the spatial logic; that's what the star
> map is for.

> **Why the early `return` in `onPointerUp` doesn't call `stopPropagation`.** Distance-scaled hit
> spheres get large for far-away beacons, so a distant beacon's proxy can sit in front of a nearby
> one. R3F walks intersections nearest-first; because non-interactive beacons bail *without*
> stopping propagation, the event continues to the beacon behind. Stop propagation only when you
> actually consume the tap.

### 4.3 Touch affordance: there is no hover on a phone

On desktop, hover tells you a beacon is clickable. On touch, nothing does — and an unlabelled glowing
dot is not self-evidently a button. Two cheap fixes, both worth doing:

1. **Label reachable beacons.** Render the title under every reachable beacon with drei `<Text>`,
   scaled to hold constant screen size. On desktop, show it on hover; on touch, show it always.

```tsx
{/* `labelSize` is a useRef updated in the same useFrame that sets the halo scale:
    labelSize.current = Math.max(1.1, d * 0.028). Reading camera distance during
    render instead would tear — it changes every frame. */}
{role === 'reachable' && (coarse || hovered) && (
  <Billboard>
    <Text
      position={[0, -6, 0]}
      fontSize={labelSize.current}   // constant screen size regardless of distance
      color={color}
      anchorX="center"
      material-toneMapped={false}
      outlineWidth={0.06}
      outlineColor="#03040a"        /* keeps it legible against a bright particle stream */
    >
      {node.title}
    </Text>
  </Billboard>
)}
```

2. **A first-visit hint.** Show a dismissible line — *"Drag to look · Tap a light to travel"* — over
   the canvas on the first load only (`localStorage` flag). Fades after 6 seconds or on first
   interaction. Desktop gets *"Move to look · Click a light to travel"*.

**Checkpoint 4.** Desktop: four glowing beacons, hover swells them and shows a pointer cursor.
**Phone:** the beacons are labelled, a swipe rotates the view without triggering travel, and a tap on
a beacon registers on the first try. Test the drag-ending-on-a-beacon case explicitly — swipe across
the screen and release with your finger over a beacon. Nothing should happen.

---

## Phase 5 — The travel sequence

The state machine already exists in the store; `CameraRig` already reads it; `ParticleField` already
reads it. All that's missing is the white-out.

### 5.1 The veil — `src/scene/Veil.tsx`

A fullscreen quad attached to the camera. It's what hides the camera jump.

```tsx
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore, TRAVEL, TRAVEL_TOTAL } from '@/state/store'

export default function Veil() {
  const mesh = useRef<THREE.Mesh>(null!)
  const mat = useRef<THREE.MeshBasicMaterial>(null!)

  useFrame((state) => {
    const s = useStore.getState()
    const cam = state.camera

    // Pin the quad just in front of the near plane.
    mesh.current.position.copy(cam.position)
    mesh.current.quaternion.copy(cam.quaternion)
    mesh.current.translateZ(-0.4)

    let a = 0
    if (s.phase === 'gather') {
      const t = s.travelClock / TRAVEL.gather
      a = Math.pow(t, 5) * 0.9              // stays near zero, then slams
    } else if (s.phase === 'veil') {
      a = 1
    } else if (s.phase === 'disperse') {
      const t = (s.travelClock - TRAVEL.gather - TRAVEL.veil) / TRAVEL.disperse
      a = Math.pow(1 - t, 2.2)
    }

    mat.current.opacity = a
    mesh.current.visible = a > 0.002
  })

  return (
    <mesh ref={mesh} renderOrder={999} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <meshBasicMaterial
        ref={mat}
        color="#cfe8ff"
        transparent
        opacity={0}
        depthTest={false}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  )
}
```

> The plane is 2×2 units at 0.4 units from the camera with a 62° FOV — comfortably larger than the
> frustum at that distance. If you widen the FOV past ~90°, bump the plane size.

### 5.2 Choreography reference

| Time | Phase | Particles | Camera | Veil | UI |
|---|---|---|---|---|---|
| 0.00–0.90s | `gather` | shell tightens, spiral collapse toward camera, respawns off | held, damped | 0 → 0.9 (quintic) | fades out |
| 0.90–1.40s | `veil` | frozen at max implosion | bezier arc to new anchor | 1.0 | swapped |
| 1.40–2.60s | `disperse` | explode outward, `uHome` lerps to new beacon, fast turnover | settles at new anchor | 0.9 → 0 | fades in |

### 5.3 Interrupt handling

`travelTo` refuses new requests unless `phase === 'idle'`. That's deliberate: a queued or interrupted
transition mid-implosion looks broken. If you want responsiveness, allow *re-targeting* during
`gather` only (change `pendingId` without resetting the clock) — one-line change, add it after the
sequence feels right.

**Checkpoint 5.** Click a beacon: the swarm accelerates in, whites out, and you're at the new beacon
as particles blow back out. The whole thing should take ~2.6 seconds and never show the camera
jumping. If you glimpse the jump, raise `TRAVEL.veil` or the veil's peak alpha.

---

## Phase 6 — Holographic UI

### 6.1 The strategy: 3D text for glow, DOM for interaction

- **`<Text>` (drei/troika)** renders SDF text as real geometry. It gets bloom, sits *in* the fog, and
  occludes correctly. Use for titles, subtitles, tags, labels.
- **`<Html transform>`** renders real DOM in a CSS3D layer. It is selectable, accessible, indexable,
  and its `<a>` tags are real links. Use for body copy, link lists, and images.

> ⚠️ **The gotcha nobody mentions:** `<Html>` content lives *outside* the WebGL canvas, so it gets
> **zero post-processing** — no bloom, no chromatic aberration, no grain. If you put a heading in
> `<Html>` next to a `<Text>` heading, they will look like they're from different websites. Fix it by
> approximating the glow in CSS (`text-shadow`, `filter: drop-shadow`) and never mixing the two for
> the same *kind* of element.

### 6.2 Two layouts, one content model

The panel does not merely shrink on a phone. It **re-forms**:

| | Desktop / landscape tablet | Phone (`compact`) |
|---|---|---|
| Frame + title + subtitle | 3D, billboarded at the beacon | 3D, billboarded at the beacon |
| Body copy | `<Html transform>` inside the frame | **bottom sheet** (fixed DOM) |
| Links | `<Html transform>` inside the frame | bottom sheet, full-width tappable rows |
| Media | 3D textured planes beside the panel | 3D plane above the sheet, or inline in the sheet |
| Panel size | 30 × 17 world units | 20 × 13 world units |

Three reasons the body copy leaves 3D on a phone:

1. **`<Html transform>` is CSS3D**, and a rotated, scaled DOM subtree is genuinely expensive on mobile
   GPUs — it forces a separate compositing layer that redraws whenever the camera moves, which is
   every frame. It also renders text blurry at non-integer scales on many Android browsers.
2. **A 520px-wide DOM panel does not fit** in a 375px portrait viewport, and scaling it down to fit
   puts body copy at an effective 9px.
3. **Thumbs are at the bottom.** Links floating at eye level in 3D require reaching; a bottom sheet
   puts them exactly where a hand already is.

The holographic frame, title, and particle field all stay — the *atmosphere* is unchanged. Only the
part that needs to be read and tapped moves to where reading and tapping work.

### 6.3 Panel dimensions — `src/scene/ui3d/panelLayout.ts`

Shared by the camera rig (to solve anchor distance) and the panel itself, so they can never disagree.

```ts
export interface PanelSize { w: number; h: number }

export function panelSizeFor(compact: boolean, portrait: boolean): PanelSize {
  if (compact) return { w: 20, h: 13 }        // title + subtitle only; body is in the sheet
  if (portrait) return { w: 22, h: 24 }       // tablet held upright
  return { w: 30, h: 17 }
}
```

### 6.4 Panel shader — `src/shaders/holo/panel.frag`

```glsl
precision highp float;

uniform vec3  uColor;
uniform float uTime;
uniform float uOpacity;
uniform vec2  uSize;

varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

void main() {
  vec2 uv = vUv;

  // --- edge fresnel: bright frame, transparent middle ---
  vec2 e = min(uv, 1.0 - uv);
  float edge = 1.0 - smoothstep(0.0, 0.02, min(e.x, e.y));

  // --- corner brackets, the classic HUD tell ---
  float bx = step(uv.x, 0.06) + step(0.94, uv.x);
  float by = step(uv.y, 0.05) + step(0.95, uv.y);
  float bracket = clamp(bx * step(uv.y, 0.22) + bx * step(0.78, uv.y)
                      + by * step(uv.x, 0.14) + by * step(0.86, uv.x), 0.0, 1.0);

  // --- scanlines, scrolling slowly ---
  float scan = 0.5 + 0.5 * sin((uv.y * uSize.y * 3.0) - uTime * 2.2);
  scan = pow(scan, 3.0) * 0.18;

  // --- a sweep that crosses every few seconds ---
  float sweepPos = fract(uTime * 0.14);
  float sweep = exp(-pow((uv.y - sweepPos) * 22.0, 2.0)) * 0.5;

  // --- interference flicker ---
  float flicker = 0.94 + 0.06 * hash(vec2(floor(uTime * 18.0), floor(uv.y * 40.0)));

  float body = 0.045 + scan + sweep;
  float alpha = clamp(body + edge * 0.9 + bracket * 0.85, 0.0, 1.0) * uOpacity * flicker;

  vec3 col = uColor * (0.7 + edge * 1.8 + bracket * 2.2 + sweep * 1.5);

  gl_FragColor = vec4(col, alpha);
}
```

Matching vertex shader (`panel.vert`) is trivial:

```glsl
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

### 6.5 The panel component — `src/scene/ui3d/HoloPanel.tsx`

```tsx
import { useRef, useMemo, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text, Html, Billboard } from '@react-three/drei'
import * as THREE from 'three'
import panelVert from '@/shaders/holo/panel.vert'
import panelFrag from '@/shaders/holo/panel.frag'
import { useStore, getCurrentNode } from '@/state/store'
import MediaTile from './MediaTile'
import { renderInline } from '@/ui/markdown'
import { panelSizeFor } from './panelLayout'

export default function HoloPanel() {
  const phase = useStore((s) => s.phase)
  const node = useStore((s) => s.graph.nodes.get(s.currentId)!)
  const compact = useStore((s) => s.compact)
  const portrait = useStore((s) => s.portrait)

  const { w: PANEL_W, h: PANEL_H } = panelSizeFor(compact, portrait)
  // Scale type with the panel so a 20-unit panel isn't wearing 30-unit headings.
  const scale = PANEL_W / 30

  const group = useRef<THREE.Group>(null!)
  // Panel opacity is React state because it drives <Text fillOpacity> and CSS.
  // The `> 0.001` guard below is what keeps this from setting state every frame
  // once the fade has settled.
  const [opacity, setOpacity] = useState(0)

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: panelVert,
        fragmentShader: panelFrag,
        uniforms: {
          uColor: { value: new THREE.Color(node.color ?? '#8fd8ff') },
          uTime: { value: 0 },
          uOpacity: { value: 0 },
          uSize: { value: new THREE.Vector2(PANEL_W, PANEL_H) },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [],
  )

  useEffect(() => {
    ;(material.uniforms.uColor.value as THREE.Color).set(node.color ?? '#8fd8ff')
  }, [node.color, material])

  useFrame((state, dt) => {
    material.uniforms.uTime.value = state.clock.elapsedTime
    // Only visible while idle; fades with the transition.
    const target = phase === 'idle' ? 1 : 0
    const next = THREE.MathUtils.damp(opacity, target, 6, dt)
    if (Math.abs(next - opacity) > 0.001) setOpacity(next)
    material.uniforms.uOpacity.value = next
  })

  if (opacity < 0.01 && phase !== 'idle') return null

  return (
    <Billboard ref={group} position={node.worldPosition} follow>
      <group position={[0, PANEL_H * 0.42, 6]}>
        {/* backing plate */}
        <mesh material={material}>
          <planeGeometry args={[PANEL_W, PANEL_H]} />
        </mesh>

        <Text
          position={[-PANEL_W / 2 + 1.4 * scale, PANEL_H / 2 - 2.2 * scale, 0.05]}
          anchorX="left"
          anchorY="middle"
          fontSize={2.1 * scale}
          maxWidth={PANEL_W - 2.8 * scale}   {/* wrap long titles instead of overflowing */}
          letterSpacing={0.02}
          color={node.color ?? '#dfe9ff'}
          material-toneMapped={false}
          fillOpacity={opacity}
          font="/fonts/Inter-SemiBold.woff"
        >
          {node.title}
        </Text>

        {node.subtitle && (
          <Text
            position={[-PANEL_W / 2 + 1.4 * scale, PANEL_H / 2 - 4.5 * scale, 0.05]}
            anchorX="left"
            anchorY="middle"
            fontSize={0.95 * scale}
            maxWidth={PANEL_W - 2.8 * scale}
            color="#9fb6d8"
            material-toneMapped={false}
            fillOpacity={opacity * 0.85}
            font="/fonts/Inter-Regular.woff"
          >
            {node.subtitle}
          </Text>
        )}

        {/* On a phone the body and links live in the bottom sheet (§6.6) instead —
            CSS3D is expensive and blurry on mobile, and 520px doesn't fit in 375. */}
        {!compact && (
          <Html
            transform
            occlude={false}
            distanceFactor={12}
            position={[-PANEL_W / 2 + 1.4, -1.2, 0.05]}
            style={{ opacity, pointerEvents: opacity > 0.9 ? 'auto' : 'none', width: '520px' }}
            wrapperClass="holo-html"
          >
            <div className="holo-body">
              {node.body && (
                <div className="holo-copy">
                  {node.body.split('\n\n').map((p, i) => (
                    <p key={i} dangerouslySetInnerHTML={{ __html: renderInline(p) }} />
                  ))}
                </div>
              )}

              {node.links.length > 0 && (
                <ul className="holo-links">
                  {node.links.map((l) => (
                    <li key={l.url}>
                      <a
                        href={l.url}
                        target={l.url.startsWith('http') ? '_blank' : undefined}
                        rel="noreferrer noopener"
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <span className="glyph" aria-hidden>{glyph(l.icon)}</span>
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              )}

              {node.tags.length > 0 && (
                <ul className="holo-tags">
                  {node.tags.map((t) => <li key={t}>{t}</li>)}
                </ul>
              )}
            </div>
          </Html>
        )}

        {/* Media floats as textured planes in 3D — these DO get bloom.
            Landscape: stacked to the right. Compact: centred below the title. */}
        {node.media.map((m, i) =>
          compact ? (
            <MediaTile
              key={m.src}
              media={m}
              position={[0, -2 - i * 7, 0.3]}
              width={PANEL_W * 0.72}
              opacity={opacity}
            />
          ) : (
            <MediaTile
              key={m.src}
              media={m}
              position={[PANEL_W / 2 - 6.5, PANEL_H / 2 - 6 - i * 8, 0.3]}
              width={10}
              opacity={opacity}
            />
          ),
        )}
      </group>
    </Billboard>
  )
}

function glyph(icon?: string) {
  return { github: '◆', linkedin: '▣', mail: '✉', external: '↗', doc: '▤', play: '▶' }[icon ?? 'external'] ?? '↗'
}
```

### 6.6 Mobile bottom sheet — `src/ui/BeaconSheet.tsx`

Rendered outside `<Canvas>`, only when `compact`. This is where body copy, links, and tags go on a
phone.

```tsx
import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/state/store'
import { renderInline } from './markdown'
import '@/styles/sheet.css'

export default function BeaconSheet() {
  const compact = useStore((s) => s.compact)
  const phase = useStore((s) => s.phase)
  const node = useStore((s) => s.graph.nodes.get(s.currentId)!)
  const [expanded, setExpanded] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Collapse and scroll back to top whenever we arrive somewhere new.
  useEffect(() => {
    setExpanded(false)
    bodyRef.current?.scrollTo({ top: 0 })
  }, [node.id])

  if (!compact) return null

  const hasContent = !!node.body || node.links.length > 0 || node.tags.length > 0
  if (!hasContent) return null

  return (
    <section
      className={`sheet${expanded ? ' is-expanded' : ''}${phase === 'idle' ? '' : ' is-hidden'}`}
      aria-label={`${node.title} details`}
      style={{ ['--sheet-accent' as any]: node.color ?? '#7bdcff' }}
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

function glyph(icon?: string) {
  return { github: '◆', linkedin: '▣', mail: '✉', external: '↗', doc: '▤', play: '▶' }[icon ?? 'external'] ?? '↗'
}
```

`src/styles/sheet.css`:

```css
.sheet {
  position: fixed;
  left: 0; right: 0;
  /* Sit above the bottom nav bar, which is itself above the safe area. */
  bottom: calc(var(--sab) + 60px);
  max-height: 34dvh;
  padding: 0 max(16px, var(--sal)) 12px max(16px, var(--sar));

  background: linear-gradient(to top, rgba(3, 6, 16, 0.94), rgba(3, 6, 16, 0.72));
  backdrop-filter: blur(14px) saturate(1.3);
  -webkit-backdrop-filter: blur(14px) saturate(1.3);
  border-top: 1px solid color-mix(in srgb, var(--sheet-accent) 45%, transparent);
  box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.6),
              0 -1px 0 color-mix(in srgb, var(--sheet-accent) 30%, transparent);

  display: flex;
  flex-direction: column;
  transition: max-height 320ms cubic-bezier(0.22, 1, 0.36, 1),
              transform 320ms cubic-bezier(0.22, 1, 0.36, 1),
              opacity 220ms ease;
}

.sheet.is-expanded { max-height: 70dvh; }

/* Slide away during a travel transition. */
.sheet.is-hidden { transform: translateY(115%); opacity: 0; pointer-events: none; }

.sheet-grabber {
  background: none; border: 0; padding: 10px 0 8px;
  width: 100%; display: grid; place-items: center; cursor: pointer;
}
.sheet-bar {
  display: block; width: 40px; height: 4px; border-radius: 2px;
  background: color-mix(in srgb, var(--sheet-accent) 70%, transparent);
}

.sheet-body {
  overflow-y: auto;
  /* Let the sheet scroll internally without the page rubber-banding behind it. */
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  font-size: 15px;              /* never below 16px for inputs; 15px is fine for copy */
  line-height: 1.6;
  color: #cfe0f7;
  padding-bottom: 8px;
}

/* Full-width tap rows — much easier than inline chips on a phone. */
.sheet-links { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 8px; }
.sheet-links a {
  display: flex; align-items: center; gap: 12px;
  min-height: var(--tap);
  padding: 0 14px;
  border: 1px solid color-mix(in srgb, var(--sheet-accent) 40%, transparent);
  border-radius: 3px;
  background: color-mix(in srgb, var(--sheet-accent) 8%, transparent);
  color: #dff2ff; text-decoration: none;
  font-size: 14px; letter-spacing: 0.05em; text-transform: uppercase;
}
.sheet-links .label { flex: 1; }
.sheet-links .chev { opacity: 0.5; font-size: 20px; }
.sheet-links a:active { background: color-mix(in srgb, var(--sheet-accent) 20%, transparent); }

/* Landscape phones are only ~380px tall — the sheet would eat the whole screen. */
@media (orientation: landscape) and (max-height: 480px) {
  .sheet { max-height: 46dvh; bottom: calc(var(--sab) + 8px); left: auto; right: 0; width: 46vw; }
  .sheet.is-expanded { max-height: 78dvh; }
}
```

> **`overscroll-behavior: contain` on `.sheet-body` is load-bearing.** Without it, scrolling to the
> bottom of the sheet hands the scroll to the page, which triggers iOS rubber-banding and drags the
> whole layout. With `touch-action: none` on the canvas and `contain` here, each surface owns its own
> gestures cleanly.

### 6.7 Media tile — `src/scene/ui3d/MediaTile.tsx`

```tsx
import { useMemo, useEffect } from 'react'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import type { Media } from '@/content/schema'

interface TileProps {
  media: Media
  position: [number, number, number]
  /** World-space width. Set by the panel so tiles fit whichever layout is active. */
  width: number
  opacity: number
}

export default function MediaTile(props: TileProps) {
  if (props.media.type === 'video') return <VideoTile {...props} />
  return <ImageTile {...props} />
}

function ImageTile({ media, position, width: w, opacity }: TileProps) {
  const tex = useTexture(media.src)
  const aspect = tex.image ? tex.image.width / tex.image.height : 1.6
  return (
    <group position={position}>
      <mesh>
        <planeGeometry args={[w, w / aspect]} />
        <meshBasicMaterial map={tex} transparent opacity={opacity * 0.92} toneMapped={false} />
      </mesh>
      {/* Glowing frame so images read as holograms, not stickers. */}
      <lineSegments>
        <edgesGeometry args={[new THREE.PlaneGeometry(w + 0.3, w / aspect + 0.3)]} />
        <lineBasicMaterial color="#7bdcff" transparent opacity={opacity * 0.6} toneMapped={false} />
      </lineSegments>
    </group>
  )
}

function VideoTile({ media, position, width: w, opacity }: TileProps) {
  const coarse = useStore((s) => s.coarse)
  const [playing, setPlaying] = useState(false)
  const poster = useTexture(media.poster ?? media.src)

  const video = useMemo(() => {
    const v = document.createElement('video')
    v.src = media.src
    v.crossOrigin = 'anonymous'
    v.loop = true
    v.muted = true            // required for autoplay everywhere
    v.playsInline = true      // iOS: without this the video hijacks the screen fullscreen
    v.setAttribute('playsinline', '')      // Safari still wants the attribute, not just the prop
    v.setAttribute('webkit-playsinline', '')
    // On mobile, don't fetch video bytes until asked. A 4MB autoplay on cellular
    // is both rude and slow, and iOS Low Power Mode blocks it anyway.
    v.preload = coarse ? 'none' : 'auto'
    return v
  }, [media.src, coarse])

  const tex = useMemo(() => {
    const t = new THREE.VideoTexture(video)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [video])

  useEffect(() => {
    if (!coarse) {
      video.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    }
    return () => { video.pause(); video.removeAttribute('src'); video.load(); tex.dispose() }
  }, [video, tex, coarse])

  // Pause offscreen/backgrounded video — decoding while hidden drains battery fast.
  useEffect(() => {
    const onVis = () => { if (document.hidden) video.pause(); else if (playing) video.play().catch(() => {}) }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [video, playing])

  const h = w / 1.777
  return (
    <group position={position}>
      <mesh
        onPointerUp={(e) => {
          if (input.dragDistance > TAP_SLOP) return
          e.stopPropagation()
          if (playing) { video.pause(); setPlaying(false) }
          else video.play().then(() => setPlaying(true)).catch(() => {})
        }}
      >
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial
          map={playing ? tex : poster}
          transparent
          opacity={opacity * 0.95}
          toneMapped={false}
        />
      </mesh>

      {/* Tap-to-play affordance — on mobile the video starts paused on a poster. */}
      {!playing && (
        <mesh position={[0, 0, 0.05]}>
          <circleGeometry args={[Math.min(w, h) * 0.13, 32]} />
          <meshBasicMaterial color="#dff2ff" transparent opacity={opacity * 0.8} toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}
```

Add the imports this now needs:

```ts
import { useState } from 'react'
import { useStore } from '@/state/store'
import { input, TAP_SLOP } from '@/input/input'
```

> **Always ship a `poster`** for every video in `site.json`. On mobile the poster *is* what people
> see until they tap, and `useTexture` will otherwise try to decode the video file as an image and
> throw.

### 6.8 Fonts

Troika needs a `.woff` (not `.woff2`) or `.ttf`. Put `Inter-SemiBold.woff` and `Inter-Regular.woff`
in `public/fonts/`. Preload them so the first frame isn't unstyled:

```tsx
// in main.tsx
import { preloadFont } from 'troika-three-text'
preloadFont({ font: '/fonts/Inter-SemiBold.woff', characters: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,—·:/()' }, () => {})
```

### 6.9 Tiny inline markdown — `src/ui/markdown.ts`

Full markdown is overkill and a dependency you don't need. This handles bold, italic, code, links:

```ts
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function renderInline(src: string): string {
  return escapeHtml(src)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}
```

> Note the escape happens *before* the replacements — that ordering is the whole safety story for the
> `dangerouslySetInnerHTML` in the panel. Since `site.json` is your own content it's low risk either
> way, but get it right by default.

### 6.10 Holographic CSS — `src/styles/holo.css`

```css
.holo-html { pointer-events: none; }

.holo-body {
  font-family: 'Inter', system-ui, sans-serif;
  color: #cfe0f7;
  text-shadow: 0 0 8px rgba(123, 220, 255, 0.55), 0 0 22px rgba(123, 220, 255, 0.25);
  line-height: 1.6;
  font-size: 15px;
}

.holo-copy p { margin: 0 0 0.85em; }
.holo-copy code {
  font-family: ui-monospace, 'JetBrains Mono', monospace;
  background: rgba(123, 220, 255, 0.1);
  padding: 0.1em 0.35em;
  border-radius: 3px;
}

.holo-links { list-style: none; margin: 1.2em 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 10px; }
.holo-links a {
  pointer-events: auto;
  display: inline-flex; align-items: center; gap: 8px;
  min-height: var(--tap);        /* applies on touch-capable laptops/tablets too */
  padding: 7px 14px;
  border: 1px solid rgba(123, 220, 255, 0.45);
  border-radius: 2px;
  color: #dff2ff; text-decoration: none; font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase;
  background: rgba(123, 220, 255, 0.05);
  transition: background 180ms ease, box-shadow 180ms ease, transform 180ms ease;
}
/* Gate hover so it doesn't stick after a tap on touch devices. */
@media (hover: hover) {
  .holo-links a:hover {
    background: rgba(123, 220, 255, 0.18);
    box-shadow: 0 0 18px rgba(123, 220, 255, 0.5), inset 0 0 12px rgba(123, 220, 255, 0.2);
    transform: translateY(-1px);
  }
}
.holo-links a:focus-visible {
  background: rgba(123, 220, 255, 0.18);
  box-shadow: 0 0 18px rgba(123, 220, 255, 0.5);
}
.holo-links a:active { background: rgba(123, 220, 255, 0.26); }
.holo-links .glyph { opacity: 0.8; }

.holo-tags { list-style: none; display: flex; flex-wrap: wrap; gap: 6px; margin: 1.1em 0 0; padding: 0; }
.holo-tags li {
  font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase;
  color: #8fb4d8; border-bottom: 1px solid rgba(143, 180, 216, 0.3); padding-bottom: 2px;
}
```

**Checkpoint 6.** Desktop: a bracketed, scanlined panel with a glowing title, readable body text, and
clickable links; it fades out during travel and back in on arrival; text is selectable.

**Phone:** the 3D frame holds the title and subtitle, fully within frame in portrait with nothing
cropped at the edges. Body copy and links are in a bottom sheet you can drag open. Scrolling to the
bottom of the sheet does **not** move the page behind it. Rotate to landscape — the sheet re-flows to
the side and the panel re-frames without a reload. Set your phone to its largest text size and check
nothing overlaps.

---

## Phase 7 — Star map, routing, deep links

### 7.1 Hash routing — `src/state/routing.ts`

```ts
import { useEffect } from 'react'
import { useStore } from './store'
import { site } from '@/content'

const idFromHash = () => decodeURIComponent(location.hash.replace(/^#\/?/, '')).trim()

export function useHashRouting() {
  useEffect(() => {
    // 1. Initial load: honour a deep link, instantly (no transition on arrival).
    const initial = idFromHash()
    if (initial && initial !== site.root && useStore.getState().graph.nodes.has(initial)) {
      useStore.setState({ currentId: initial })
    }

    // 2. Back/forward buttons.
    const onHash = () => {
      const id = idFromHash() || site.root
      const s = useStore.getState()
      if (id !== s.currentId && s.graph.nodes.has(id)) s.travelTo(id)
    }
    addEventListener('hashchange', onHash)

    // 3. Push a history entry whenever we land somewhere new.
    const unsub = useStore.subscribe((s, prev) => {
      if (s.currentId !== prev.currentId) {
        const next = s.currentId === site.root ? '#/' : `#/${s.currentId}`
        if (location.hash !== next) history.pushState(null, '', next)
        document.title =
          s.currentId === site.root
            ? `${site.meta.name} — ${site.meta.role}`
            : `${s.graph.nodes.get(s.currentId)?.title} · ${site.meta.name}`
      }
    })

    return () => { removeEventListener('hashchange', onHash); unsub() }
  }, [])
}
```

Call `useHashRouting()` once in `App`.

### 7.2 Star map overlay — `src/ui/StarMap.tsx`

A 2D SVG projection of the graph — simpler, more legible, and more accessible than a second 3D scene.

**On `compact` devices it renders as a tappable tree list instead.** A 1000×760 constellation on a
375px screen means 6px nodes and 8px labels, which is neither readable nor tappable, and pan/zoom
gestures inside an overlay that sits on top of a canvas with `touch-action: none` is a fight you
don't need to have. The list carries exactly the same information — hierarchy, current position,
every destination one tap away — and it's better for screen readers on both platforms.

```tsx
import { useMemo } from 'react'
import { useStore } from '@/state/store'
import '@/styles/starmap.css'

export default function StarMap() {
  const compact = useStore((s) => s.compact)
  const open = useStore((s) => s.mapOpen)
  if (!open) return null
  return compact ? <MapList /> : <MapGraph />
}

/* ---------------- mobile: indented tree list ---------------- */

function MapList() {
  const graph = useStore((s) => s.graph)
  const currentId = useStore((s) => s.currentId)
  const toggleMap = useStore((s) => s.toggleMap)
  const travelTo = useStore((s) => s.travelTo)

  // Depth-first walk preserves the authored reading order.
  const rows = useMemo(() => {
    const out: { id: string; depth: number }[] = []
    const seen = new Set<string>()
    const walk = (id: string, depth: number) => {
      const n = graph.nodes.get(id)
      if (!n || seen.has(id) || n.hidden) return
      seen.add(id)
      out.push({ id, depth })
      n.children.forEach((c) => walk(c, depth + 1))
    }
    walk(graph.rootId, 0)
    graph.nodes.forEach((n) => { if (!seen.has(n.id) && !n.hidden) out.push({ id: n.id, depth: 1 }) })
    return out
  }, [graph])

  return (
    <div className="map-sheet" role="dialog" aria-modal="true" aria-label="Beacon map">
      <header>
        <h2>Destinations</h2>
        <button className="map-close" onClick={toggleMap} aria-label="Close map">✕</button>
      </header>

      <ul className="map-list">
        {rows.map(({ id, depth }) => {
          const n = graph.nodes.get(id)!
          const isCurrent = id === currentId
          return (
            <li key={id} style={{ paddingLeft: `${depth * 18}px` }}>
              <button
                className={`map-row${isCurrent ? ' is-current' : ''}`}
                onClick={() => travelTo(id)}
                disabled={isCurrent}
                aria-current={isCurrent ? 'page' : undefined}
              >
                <span className="dot" style={{ background: n.color ?? '#8fd8ff' }} aria-hidden />
                <span className="titles">
                  <span className="t">{n.title}</span>
                  {n.subtitle && <span className="s">{n.subtitle}</span>}
                </span>
                {isCurrent ? <span className="here">HERE</span> : <span className="chev" aria-hidden>›</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* ---------------- desktop: SVG constellation ---------------- */

function MapGraph() {
  const graph = useStore((s) => s.graph)
  const currentId = useStore((s) => s.currentId)
  const toggleMap = useStore((s) => s.toggleMap)
  const travelTo = useStore((s) => s.travelTo)

  // Radial tree layout: angle from index-in-depth-band, radius from depth.
  const layout = useMemo(() => {
    const byDepth = new Map<number, string[]>()
    for (const n of graph.nodes.values()) {
      if (n.hidden) continue
      if (!byDepth.has(n.depth)) byDepth.set(n.depth, [])
      byDepth.get(n.depth)!.push(n.id)
    }
    const pts = new Map<string, { x: number; y: number }>()
    for (const [depth, ids] of byDepth) {
      ids.forEach((id, i) => {
        const a = (i / ids.length) * Math.PI * 2 - Math.PI / 2
        const r = depth * 130
        pts.set(id, { x: 500 + Math.cos(a) * r, y: 380 + Math.sin(a) * r })
      })
    }
    return pts
  }, [graph])

  const edges = [...graph.nodes.values()].flatMap((n) =>
    n.children
      .filter((c) => layout.has(c) && layout.has(n.id))
      .map((c) => ({ from: layout.get(n.id)!, to: layout.get(c)!, key: `${n.id}->${c}` })),
  )

  return (
    <div className="starmap" role="dialog" aria-modal="true" aria-label="Beacon map" onClick={toggleMap}>
      <svg viewBox="0 0 1000 760" className="starmap-svg" onClick={(e) => e.stopPropagation()}>
        {edges.map((e) => (
          <line key={e.key} x1={e.from.x} y1={e.from.y} x2={e.to.x} y2={e.to.y}
                stroke="rgba(123,220,255,0.22)" strokeWidth={1} />
        ))}
        {[...layout.entries()].map(([id, p]) => {
          const node = graph.nodes.get(id)!
          const isCurrent = id === currentId
          return (
            <g key={id} className={`starmap-node${isCurrent ? ' is-current' : ''}`}
               transform={`translate(${p.x} ${p.y})`}
               onClick={() => { travelTo(id); }}
               tabIndex={0}
               role="link"
               aria-current={isCurrent ? 'page' : undefined}
               onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); travelTo(id) } }}>
              <circle r={isCurrent ? 9 : 6} fill={node.color ?? '#8fd8ff'} />
              <circle r={18} fill="transparent" />
              <text y={-16} textAnchor="middle">{node.title}</text>
            </g>
          )
        })}
      </svg>
      <p className="starmap-hint">Click a beacon to travel · Esc to close</p>
    </div>
  )
}
```

`src/styles/starmap.css` — the mobile half:

```css
.map-sheet {
  position: fixed; inset: 0;
  z-index: 40;
  display: flex; flex-direction: column;
  background: rgba(3, 5, 14, 0.96);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  padding: calc(var(--sat) + 8px) max(12px, var(--sar)) calc(var(--sab) + 12px) max(12px, var(--sal));
}

.map-sheet header { display: flex; align-items: center; justify-content: space-between; padding: 6px 4px 14px; }
.map-sheet h2 { margin: 0; font-size: 13px; letter-spacing: 0.22em; text-transform: uppercase; color: #7f9bc0; font-weight: 500; }
.map-close { background: none; border: 1px solid rgba(123,220,255,0.3); border-radius: 3px; color: var(--ink); font-size: 18px; }

.map-list { list-style: none; margin: 0; padding: 0; overflow-y: auto; overscroll-behavior: contain; flex: 1; }

.map-row {
  display: flex; align-items: center; gap: 12px;
  width: 100%; min-height: 56px;      /* generous — this is the primary mobile nav */
  padding: 8px 12px; margin-bottom: 6px;
  background: rgba(123, 220, 255, 0.04);
  border: 1px solid rgba(123, 220, 255, 0.16);
  border-radius: 3px;
  color: var(--ink); text-align: left; font: inherit;
}
.map-row:active { background: rgba(123, 220, 255, 0.16); }
.map-row.is-current { border-color: rgba(123, 220, 255, 0.55); background: rgba(123, 220, 255, 0.12); opacity: 1; }
.map-row[disabled] { cursor: default; }

.map-row .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; box-shadow: 0 0 12px currentColor; }
.map-row .titles { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.map-row .t { font-size: 16px; }
.map-row .s { font-size: 12px; color: #7f9bc0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.map-row .here { font-size: 10px; letter-spacing: 0.18em; color: var(--aether); }
.map-row .chev { font-size: 22px; opacity: 0.45; }
```

### 7.3 HUD, bottom bar, and keyboard — `src/ui/Hud.tsx`

The HUD is the **only** universally available control surface — keyboard shortcuts are an
accelerator layered on top of it, never a replacement. On compact devices it becomes a fixed bottom
bar in the thumb zone; on desktop it sits top-right out of the way.

```tsx
import { useEffect } from 'react'
import { useStore } from '@/state/store'
import { neighborsOf } from '@/content/layout'
import { enableGyro, disableGyro } from '@/input/gyro'
import { recentre } from '@/input/input'
import StarMap from './StarMap'
import BeaconSheet from './BeaconSheet'
import '@/styles/hud.css'

export default function Hud() {
  // One selector per slice — never `useStore()` with no selector. `travelClock`
  // updates ~60×/sec during a transition, and an unselected subscription would
  // re-render this whole subtree every one of those frames.
  const mapOpen = useStore((s) => s.mapOpen)
  const audioEnabled = useStore((s) => s.audioEnabled)
  const currentId = useStore((s) => s.currentId)
  const graph = useStore((s) => s.graph)
  const toggleMap = useStore((s) => s.toggleMap)
  const toggleAudio = useStore((s) => s.toggleAudio)
  const toggleTextMode = useStore((s) => s.toggleTextMode)
  const travelTo = useStore((s) => s.travelTo)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState()
      if (e.key === 'm' || e.key === 'M') toggleMap()
      if (e.key === 'Escape') {
        if (s.mapOpen) toggleMap()
        else {
          const parent = s.graph.nodes.get(s.currentId)?.parentId
          if (parent) travelTo(parent)
        }
      }
      if (e.key === '0') recentre()
      // Number keys jump to the Nth reachable beacon.
      const n = parseInt(e.key, 10)
      if (n >= 1 && n <= 9) {
        const targets = neighborsOf(s.graph, s.currentId)
        if (targets[n - 1]) travelTo(targets[n - 1])
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [toggleMap, travelTo])

  const parentId = graph.nodes.get(currentId)?.parentId
  const gyroAvailable = coarse && typeof DeviceOrientationEvent !== 'undefined'

  return (
    <>
      <nav className={`hud${compact ? ' hud--bar' : ''}`} aria-label="Site controls">
        <button
          className="hud-btn"
          onClick={toggleMap}
          aria-expanded={mapOpen}
          aria-label="Open beacon map"
        >
          <span className="ico" aria-hidden>⁙</span>
          <span className="lbl">Map</span>
        </button>

        <button
          className="hud-btn"
          onClick={() => parentId && travelTo(parentId)}
          disabled={!parentId}
          aria-label="Go up one level"
        >
          <span className="ico" aria-hidden>↩</span>
          <span className="lbl">Back</span>
        </button>

        <button
          className="hud-btn"
          onClick={toggleAudio}
          aria-pressed={audioEnabled}
          aria-label={audioEnabled ? 'Mute sound' : 'Enable sound'}
        >
          <span className="ico" aria-hidden>{audioEnabled ? '♪' : '♪̸'}</span>
          <span className="lbl">{audioEnabled ? 'Sound' : 'Muted'}</span>
        </button>

        {gyroAvailable && (
          <button
            className="hud-btn"
            onClick={async () => {
              // MUST run inside this click handler — iOS rejects the permission
              // request if it isn't synchronously inside a user gesture.
              if (gyroEnabled) { disableGyro(); setGyro(false) }
              else setGyro(await enableGyro())
            }}
            aria-pressed={gyroEnabled}
            aria-label="Toggle motion-controlled camera"
          >
            <span className="ico" aria-hidden>◎</span>
            <span className="lbl">Tilt</span>
          </button>
        )}

        <button className="hud-btn" onClick={toggleTextMode} aria-label="Switch to plain text version">
          <span className="ico" aria-hidden>≡</span>
          <span className="lbl">Text</span>
        </button>
      </nav>

      <StarMap />
      <BeaconSheet />

      {/* Announce arrivals for screen readers — the visual transition means nothing to them. */}
      <div className="sr-only" role="status" aria-live="polite">
        {phase === 'idle' ? `Arrived at ${graph.nodes.get(currentId)?.title}` : ''}
      </div>
    </>
  )
}
```

Add the extra selectors this needs:

```ts
const compact = useStore((s) => s.compact)
const coarse = useStore((s) => s.coarse)
const gyroEnabled = useStore((s) => s.gyroEnabled)
const setGyro = useStore((s) => s.setGyro)
const phase = useStore((s) => s.phase)
```

`src/styles/hud.css`:

```css
.hud {
  position: fixed;
  z-index: 30;
  display: flex;
  gap: 8px;
  /* Desktop: top-right, out of the way of the panel. */
  top: calc(var(--sat) + 16px);
  right: calc(var(--sar) + 16px);
}

.hud-btn {
  display: flex; align-items: center; gap: 7px;
  padding: 0 14px;
  min-height: var(--tap);
  background: rgba(3, 6, 16, 0.55);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(123, 220, 255, 0.28);
  border-radius: 3px;
  color: var(--ink);
  font: inherit; font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase;
  cursor: pointer;
}
.hud-btn[disabled] { opacity: 0.35; cursor: default; }
.hud-btn[aria-pressed='true'] { border-color: var(--aether); color: var(--aether); }
.hud-btn:active { background: rgba(123, 220, 255, 0.18); }

@media (hover: hover) {
  .hud-btn:hover:not([disabled]) { background: rgba(123, 220, 255, 0.14); }
}

/* ---- Compact: fixed bottom bar in the thumb zone ---- */
.hud--bar {
  top: auto;
  right: 0; left: 0;
  bottom: 0;
  gap: 0;
  /* The inset padding is what keeps the bar clear of the iPhone home indicator. */
  padding: 6px max(4px, var(--sal)) calc(var(--sab) + 6px) max(4px, var(--sar));
  background: linear-gradient(to top, rgba(3, 5, 14, 0.95), rgba(3, 5, 14, 0.7));
  border-top: 1px solid rgba(123, 220, 255, 0.18);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.hud--bar .hud-btn {
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-height: 52px;
  padding: 6px 2px;
  background: none;
  border: none;
  backdrop-filter: none;
  font-size: 10px;
  letter-spacing: 0.1em;
}
.hud--bar .ico { font-size: 19px; line-height: 1; }
.hud--bar .hud-btn[aria-pressed='true'] { color: var(--aether); }

/* Landscape phone: the bar would eat a third of a 380px-tall screen. Go vertical. */
@media (orientation: landscape) and (max-height: 480px) and (pointer: coarse) {
  .hud--bar {
    left: 0; right: auto; top: 0; bottom: 0;
    flex-direction: column; justify-content: center;
    width: 62px;
    padding: 8px 4px 8px calc(var(--sal) + 4px);
    border-top: none; border-right: 1px solid rgba(123, 220, 255, 0.18);
    background: linear-gradient(to right, rgba(3, 5, 14, 0.95), rgba(3, 5, 14, 0.6));
  }
  .hud--bar .hud-btn { flex: none; }
}
```

> **Why labels under the icons and not icons alone?** `⁙` means nothing to anyone. Icon-only bottom
> bars test badly with everyone except the person who designed them, and on a portfolio you have
> exactly one chance. The labels cost 10px of height.

### 7.4 Swipe gestures — optional, additive only

If you want swipes, add them as a *third* path to actions that already have buttons. Never make a
gesture the only way to do something — it's undiscoverable and it will collide with the look-around
drag.

```ts
// Only trigger on a fast, mostly-vertical flick starting near the screen edge,
// so it can't be confused with a look-around drag.
const SWIPE_MIN_VELOCITY = 0.6   // px/ms
const SWIPE_EDGE = 60            // px from the bottom edge
```

Recommended set: swipe up from the bottom edge → open map; swipe down on the sheet → collapse it.
That's it. Resist adding swipe-to-navigate-between-beacons; it conflicts with looking around, and
horizontal swipes are the browser's back gesture on iOS.

**Checkpoint 7.** Desktop: `M` opens the constellation, clicking a node travels, back/forward works,
`#/aetherweb` in a fresh tab lands correctly, `Esc` goes up.

**Phone:** every one of those actions is reachable from the bottom bar without a keyboard. The map is
a scrollable list with 56px rows. The bar clears the home indicator on an iPhone (check in landscape
too — that's where safe-area bugs actually show up). Nothing in the bar is under your thumb's resting
position when you're also trying to drag the scene.

---

## Phase 8 — Post-processing and look dev

### 8.1 The stack — `src/scene/Post.tsx`

```tsx
import {
  EffectComposer, Bloom, ChromaticAberration, Vignette, Noise, ToneMapping,
} from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { useStore } from '@/state/store'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector2 } from 'three'

export default function Post() {
  const quality = useStore((s) => s.quality)
  const ca = useRef<any>(null)

  useFrame(() => {
    // Chromatic aberration spikes during the implosion — cheap, very effective.
    const s = useStore.getState()
    if (!ca.current) return
    const boost = s.phase === 'gather' ? Math.pow(s.travelClock / 0.9, 3) : 0
    ca.current.offset.set(0.0006 + boost * 0.006, 0.0006 + boost * 0.006)
  })

  if (quality === 'low') {
    // Bloom only. Everything else is a nice-to-have that costs a full-screen pass.
    return (
      <EffectComposer frameBufferType={THREE.HalfFloatType} multisampling={0}>
        <Bloom intensity={1.1} luminanceThreshold={0.22} luminanceSmoothing={0.5} mipmapBlur radius={0.7} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    )
  }

  return (
    <EffectComposer frameBufferType={THREE.HalfFloatType} multisampling={0}>
      <Bloom
        intensity={1.35}
        luminanceThreshold={0.18}   // low: we want the particle haze to bloom, not just the cores
        luminanceSmoothing={0.55}
        mipmapBlur                  // essential — the classic kernel looks like a cheap blur
        radius={0.82}
      />
      <ChromaticAberration ref={ca} offset={new Vector2(0.0006, 0.0006)} radialModulation modulationOffset={0.15} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.16} />
      <Vignette eskil={false} offset={0.22} darkness={0.85} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}
```

### 8.2 Look-dev rules of thumb

| Symptom | Fix |
|---|---|
| Everything is a milky blur | `luminanceThreshold` too low, or particle colours never exceed 1.0 |
| Bloom looks like a Gaussian blur, not glow | you forgot `mipmapBlur` |
| Banding in the dark gradients | `frameBufferType={THREE.HalfFloatType}` missing; also the `Noise` pass hides it |
| Particles look like flat dots | raise the `halo` term in `particle.frag`, lower `uSize` |
| Space feels empty | more particles won't help — lower `uCurlFreq` for longer filaments |
| It looks "digital", not "magical" | desaturate `uColorCold`, push `uColorHot` toward violet, raise `Vignette.darkness` |

### 8.3 Dev tuning panel

Wrap every magic number in Leva during development so you can dial the look live:

```tsx
// src/dev/Tuning.tsx  — import only when import.meta.env.DEV
import { useControls } from 'leva'

export function useParticleControls() {
  return useControls('particles', {
    curlFreq: { value: 0.011, min: 0.001, max: 0.06, step: 0.001 },
    curlAmp: { value: 14, min: 0, max: 60 },
    swirl: { value: 5.5, min: 0, max: 30 },
    damping: { value: 0.965, min: 0.85, max: 0.999, step: 0.001 },
    shellRadius: { value: 46, min: 10, max: 160 },
    size: { value: 0.55, min: 0.05, max: 3 },
    opacity: { value: 0.85, min: 0, max: 2 },
  })
}
```

```tsx
// gate it so it never ships
{import.meta.env.DEV && <Perf position="top-left" />}
```

Once the numbers feel right, **copy them back into the defaults and delete the Leva bindings from the
hot path** — `useControls` re-renders the component on every change and its subscription is not free.

**Checkpoint 8.** The scene now has real depth: bright cores blooming, a soft violet haze, grain in
the shadows, and a colour fringe that snaps hard the instant you click a beacon.

---

## Phase 9 — Sound

### 9.1 Rules

1. **Never autoplay.** Browsers block it and users hate it. Default off, with a visible toggle.
2. **Persist the choice** in `localStorage` so a returning visitor isn't re-muted or re-blasted.
3. **Two formats** — `.webm` (Opus) and `.m4a` (AAC) — for Safari.
4. **Duck the ambient bed** during the travel whoosh so the transition punches.
5. **Sound stays off by default on mobile, always.** Someone opening your portfolio on a train wants
   silence. The bottom-bar toggle is the invitation.

**iOS specifics, all of which will bite you:**

- The `AudioContext` starts `suspended` and only `resume()`s inside a user gesture. Howler attempts
  this automatically, but call `Howler.ctx?.resume()` explicitly in the unlock handler — Howler's
  auto-unlock has historically missed some iOS versions.
- **The hardware silent switch mutes HTML5 audio but not Web Audio.** So `html5: false` (the default,
  and what §9.2 uses) means your ambient pad plays even with the phone on silent. That is not what a
  user expects. Either accept it, or set `html5: true` on the ambient track to respect the switch —
  at the cost of losing Web Audio effects on it, which you aren't using anyway. **Take the
  `html5: true` option for ambient**; keep Web Audio for the short SFX where latency matters.
- Don't preload audio on `coarse` devices. A 1.5MB pad downloaded on cellular for a visitor who never
  unmutes is pure waste. Lazy-load inside `initAudio()`, which only runs after a gesture — the code
  in §9.2 already has this shape, just make sure no `<audio preload>` tags sneak in.

### 9.2 `src/audio/audio.ts`

```ts
import { Howl, Howler } from 'howler'
import { site } from '@/content'
import { useStore } from '@/state/store'

let ambient: Howl | null = null
let travel: Howl | null = null
let hover: Howl | null = null
let started = false

const KEY = 'aetherweb.audio'

export function restoreAudioPreference() {
  const saved = localStorage.getItem(KEY)
  const on = saved === null ? site.audio.enabledByDefault : saved === '1'
  useStore.setState({ audioEnabled: on })
}

/** Must be called from a real user gesture (click/keydown) — that's the browser rule. */
export function initAudio() {
  if (started) return
  started = true

  const src = (p?: string) => (p ? [p, p.replace(/\.webm$/, '.m4a')] : [])

  // iOS: nudge the context awake. Safe no-op elsewhere.
  Howler.ctx?.resume?.()

  if (site.audio.ambient) {
    // html5: true routes through an <audio> element, which respects the iOS
    // hardware silent switch. Worth it for a looping background bed.
    ambient = new Howl({ src: src(site.audio.ambient), loop: true, volume: 0, html5: true })
    ambient.play()
    ambient.fade(0, 0.35, 3000)
  }
  if (site.audio.travel) travel = new Howl({ src: src(site.audio.travel), volume: 0.55 })
  if (site.audio.hover) hover = new Howl({ src: src(site.audio.hover), volume: 0.18 })

  Howler.volume(useStore.getState().audioEnabled ? 1 : 0)
}

export function setAudioEnabled(on: boolean) {
  localStorage.setItem(KEY, on ? '1' : '0')
  Howler.volume(on ? 1 : 0)
}

export function playTravel() {
  travel?.play()
  // Duck the bed for the length of the transition, then bring it back.
  if (ambient) {
    ambient.fade(ambient.volume(), 0.1, 400)
    setTimeout(() => ambient?.fade(0.1, 0.35, 1400), 1400)
  }
}

export function playHover() { hover?.play() }
```

### 9.3 Wiring

```tsx
// src/audio/AudioBridge.tsx — mount once inside <App>, outside <Canvas>
import { useEffect } from 'react'
import { useStore } from '@/state/store'
import { initAudio, setAudioEnabled, playTravel, restoreAudioPreference } from './audio'

export default function AudioBridge() {
  useEffect(() => {
    restoreAudioPreference()
    const unlock = () => { initAudio(); removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock) }
    addEventListener('pointerdown', unlock)
    addEventListener('keydown', unlock)
    return () => { removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock) }
  }, [])

  useEffect(() =>
    useStore.subscribe((s, prev) => {
      if (s.audioEnabled !== prev.audioEnabled) setAudioEnabled(s.audioEnabled)
      if (s.phase === 'gather' && prev.phase === 'idle') playTravel()
    }), [])

  return null
}
```

### 9.4 Asset sourcing

You need three files in `public/audio/`:

| File | Character | Length |
|---|---|---|
| `ambient.webm` | slow evolving pad, sub-bass drone, no melody, seamless loop | 60–120s |
| `travel.webm` | reverse-swell → impact → long reverb tail | ~2.6s (match `TRAVEL_TOTAL`) |
| `hover.webm` | soft glassy ping | ~0.4s |

Sources: [Freesound](https://freesound.org) (check CC licences per-file), [Pixabay Audio](https://pixabay.com/sound-effects/)
(no attribution needed), or generate a pad yourself in any DAW with a reverb-drenched sine stack.
Encode with `ffmpeg -i in.wav -c:a libopus -b:a 96k out.webm` and `-c:a aac -b:a 128k out.m4a`.

Keep ambient under ~1.5 MB and lazy-load it — it should never block first paint.

**Checkpoint 9.** Sound stays silent until you click the toggle. Travel triggers a whoosh that ducks
the pad. Reloading preserves your choice.

---

## Phase 10 — Performance tiers and adaptive quality

### 10.1 Initial tier guess — `src/perf/tier.ts`

```ts
import type { Quality } from '@/state/store'

export function guessTier(gl: WebGLRenderingContext | WebGL2RenderingContext): Quality {
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  const cores = navigator.hardwareConcurrency ?? 4
  const mem = (navigator as any).deviceMemory ?? 4

  const dbg = gl.getExtension('WEBGL_debug_renderer_info')
  const renderer: string = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : ''
  const weak = /(Mali-[GT]?[0-5]|Adreno \(TM\) [1-5][0-9]{2}|PowerVR|Intel.*(HD|UHD) Graphics [0-6]?[0-9]{2})/i.test(renderer)
  const strong = /(RTX|RX [67]\d{3}|Apple M[1-9]|Radeon Pro)/i.test(renderer)

  if (isMobile || weak || cores <= 4 || mem <= 2) return 'low'
  if (strong && cores >= 12) return 'high'
  return 'medium'
}
```

> `WEBGL_debug_renderer_info` is increasingly restricted for fingerprinting reasons — treat it as a
> hint, never a requirement. The runtime governor below is what actually protects the experience.

### 10.2 Runtime governor — `src/perf/QualityGovernor.tsx`

```tsx
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useStore, type Quality } from '@/state/store'

const LADDER: Quality[] = ['low', 'medium', 'high', 'ultra']

export default function QualityGovernor() {
  const samples = useRef<number[]>([])
  const cooldown = useRef(3)

  useFrame((_, dt) => {
    cooldown.current -= dt
    // Ignore the frame right after a transition — it's always a spike.
    if (useStore.getState().phase !== 'idle') { samples.current.length = 0; return }

    samples.current.push(dt)
    if (samples.current.length < 90 || cooldown.current > 0) return

    const sorted = [...samples.current].sort((a, b) => a - b)
    const p90 = sorted[Math.floor(sorted.length * 0.9)]
    samples.current.length = 0

    const s = useStore.getState()
    const i = LADDER.indexOf(s.quality)

    if (p90 > 1 / 45 && i > 0) {
      s.setQuality(LADDER[i - 1])
      cooldown.current = 6
    } else if (p90 < 1 / 110 && i < LADDER.length - 1) {
      s.setQuality(LADDER[i + 1])
      cooldown.current = 12   // long cooldown up: avoid oscillation
    } else {
      cooldown.current = 3
    }
  })

  return null
}
```

> **Why p90 and not the mean?** A mean hides stutter. p90 catches "mostly 60fps but hitches every
> half second", which is what users actually feel. The asymmetric cooldown (6s down, 12s up) stops
> the governor from flip-flopping at a boundary.

### 10.3 The optimisation levers, in order of value

1. **Cut curl cost from 18 `snoise` calls to 12** — use forward differences instead of central:
   `potential(p)` once plus `potential(p+dx/dy/dz)`. ~33% off the most expensive shader. Slight
   quality loss, essentially invisible.
2. **Bake the flow field into a 3D texture.** Precompute curl noise into a 64³ `RGBA8` 3D texture at
   load; the velocity shader becomes one `texture()` fetch. 10–20× faster. Cost: the field no longer
   evolves over time — recover motion by advecting the sample point (`p + uTime * drift`) and slowly
   rotating the lookup. This is how you get 4M particles on a laptop.
3. **Half-resolution simulation.** Run the sim at 512² while rendering 1024² vertices, sampling the
   sim texture with `LinearFilter`. Halves sim cost, quarters the memory bandwidth.
4. **Clamp DPR to 1.5** on the particle pass. Fill rate is the bottleneck for additive sprites and
   nobody can tell.
5. **Shrink `gl_PointSize`.** Additive blending means overdraw. Halving average point size can
   roughly halve fragment cost.

Apply in order, measure after each, stop when it's fast enough.

### 10.4 Budget targets

| Tier | Particles | Target | Device |
|---|---|---|---|
| low | 65,536 (256²) | 60fps @ DPR 1 | phones, integrated graphics |
| medium | 262,144 (512²) | 60fps @ DPR 1.5 | typical laptop |
| high | 1,048,576 (1024²) | 60fps @ DPR 2 | discrete GPU |
| ultra | 4,194,304 (2048²) | 60fps @ DPR 2 | opt-in only, behind a toggle |

### 10.5 Mobile-specific performance work

Phones are not slow desktops — they fail differently, and three of these have no desktop analogue.

**Thermal throttling is the real enemy.** A phone will happily hit 60fps for ninety seconds and then
drop to 30 and stay there as the SoC heats up. The governor in §10.2 handles this correctly *because
it samples continuously* rather than benchmarking once at startup — but give it a lower ceiling on
mobile so it never climbs into a tier that will cook the device:

```ts
// In QualityGovernor: cap the ladder on coarse-pointer devices.
const MAX_TIER: Record<'coarse' | 'fine', Quality> = { coarse: 'medium', fine: 'ultra' }
```

**Stop rendering when you can't be seen.** A backgrounded tab still burns battery on many Android
browsers. This is a handful of lines and it's the difference between "cool site" and "that site
that killed my battery":

```tsx
// src/perf/VisibilityPause.tsx — inside <Canvas>
import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'

export default function VisibilityPause() {
  const setFrameloop = useThree((s) => s.setFrameloop)
  useEffect(() => {
    const onVis = () => setFrameloop(document.hidden ? 'never' : 'always')
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [setFrameloop])
  return null
}
```

**Respect Low Power Mode.** There's no direct API, but the Battery Status API is a good proxy on
Android, and Low Power Mode on iOS caps the display at 30Hz — which the governor will see as a
sustained 33ms frame time and correctly step down for. Optionally start conservative:

```ts
const battery = await (navigator as any).getBattery?.()
if (battery && battery.level < 0.2 && !battery.charging) initialTier = 'low'
```

**Post-processing is disproportionately expensive on mobile.** Every full-screen pass is another
read+write of the entire framebuffer, and mobile memory bandwidth is a fraction of desktop. On
`compact`, run bloom alone — drop chromatic aberration, noise, and vignette. Update `Post.tsx`:

```tsx
const compact = useStore((s) => s.compact)
if (quality === 'low' || compact) {
  return (
    <EffectComposer frameBufferType={THREE.HalfFloatType} multisampling={0}>
      <Bloom intensity={1.15} luminanceThreshold={0.22} luminanceSmoothing={0.5} mipmapBlur radius={0.7} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}
```

Bloom stays because it *is* the aesthetic; the other three are seasoning. Recover some of the lost
grain by adding a cheap CSS noise overlay on top of the canvas instead — a tiled 64×64 base64 PNG at
6% opacity costs nothing and reads almost identically.

**Overdraw is the dominant cost, and it's worse on mobile.** Additive sprites disable depth-write, so
every particle's fragments are shaded. Phones use tile-based deferred renderers that handle opaque
geometry beautifully and transparent overdraw badly. Combined with the DPR clamp in §2.2, halving
`uSize` on `compact` is the highest-leverage single change available:

```ts
material.uniforms.uSize.value = compact ? 0.34 : 0.55
```

**Checkpoint 10.** Throttle the CPU 6× in DevTools; the governor drops a tier within a few seconds
and the site stays usable. `r3f-perf` shows draw calls in the low single digits.

**Phone:** load on a real mid-range Android (not just an iPhone — iPhones flatter you). Watch the
first 3 minutes: the frame rate should settle at a stable tier rather than degrading continuously.
Background the tab and confirm CPU drops to ~0. Check the device isn't uncomfortably warm after
5 minutes; if it is, cap `MAX_TIER.coarse` at `'low'`.

---

## Phase 11 — Accessibility, fallback, SEO

This section is what separates a portfolio that gets you hired from a tech demo. A recruiter on a
locked-down corporate laptop with a blocked GPU must still be able to read your work.

### 11.1 WebGL detection and hard fallback — `src/main.tsx`

```tsx
import { createRoot } from 'react-dom/client'
import App from './App'
import TextMode from './ui/TextMode'
import './styles/global.css'
import './styles/holo.css'

function hasWebGL2(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('experimental-webgl'))
  } catch { return false }
}

const root = createRoot(document.getElementById('root')!)
root.render(hasWebGL2() ? <App /> : <TextMode standalone />)
```

### 11.2 Text mode — `src/ui/TextMode.tsx`

The same JSON, rendered as an ordinary, excellent, accessible web page. Build it properly; it's also
your printable résumé page and your SEO surface.

```tsx
import { site } from '@/content'
import { graph } from '@/content'
import { renderInline } from './markdown'
import { useStore } from '@/state/store'
import '@/styles/text-mode.css'

export default function TextMode({ standalone = false }: { standalone?: boolean }) {
  const toggle = useStore((s) => s.toggleTextMode)

  // Depth-first order == the authored narrative order.
  const ordered = [...graph.nodes.values()].sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id))

  return (
    <main className="text-mode">
      <header>
        <h1>{site.meta.name}</h1>
        <p className="role">{site.meta.role}</p>
        <p className="tagline">{site.meta.description}</p>
        {!standalone && <button onClick={toggle}>← Return to the drift</button>}
        {standalone && <p className="notice">Your browser doesn't support WebGL2, so here's the plain version — same content, fewer particles.</p>}
      </header>

      {ordered.map((n) => (
        <section key={n.id} id={n.id} aria-labelledby={`${n.id}-h`}>
          <h2 id={`${n.id}-h`}>{n.title}</h2>
          {n.subtitle && <p className="subtitle">{n.subtitle}</p>}
          {n.body?.split('\n\n').map((p, i) => (
            <p key={i} dangerouslySetInnerHTML={{ __html: renderInline(p) }} />
          ))}
          {n.media.map((m) =>
            m.type === 'image'
              ? <img key={m.src} src={m.src} alt={m.alt} loading="lazy" />
              : <video key={m.src} src={m.src} poster={m.poster} controls preload="none" aria-label={m.alt} />,
          )}
          {n.links.length > 0 && (
            <ul className="links">
              {n.links.map((l) => (
                <li key={l.url}><a href={l.url} rel="noreferrer noopener">{l.label}</a></li>
              ))}
            </ul>
          )}
          {n.tags.length > 0 && <p className="tags">{n.tags.join(' · ')}</p>}
        </section>
      ))}
    </main>
  )
}
```

### 11.3 Always-present SEO layer

Even in 3D mode, ship the content in the DOM. Add to `App`, permanently:

```tsx
<div className="sr-only" aria-hidden="false" id="seo-content">
  {/* Same markup as TextMode, visually hidden but present for crawlers and screen readers */}
</div>
```

> **Don't** use `display: none` — crawlers discount it and screen readers skip it. The `.sr-only`
> clip technique from Phase 0.6 keeps it in the accessibility tree.

### 11.4 Build-time prerender

GitHub Pages serves static files, so inject the content at build time rather than relying on
client-side rendering. `scripts/prerender.mjs`:

```js
import { readFileSync, writeFileSync } from 'node:fs'

const site = JSON.parse(readFileSync('src/content/site.json', 'utf8'))
const html = readFileSync('dist/index.html', 'utf8')

const esc = (s = '') => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

const sections = site.beacons.map((b) => `
  <section id="${esc(b.id)}">
    <h2>${esc(b.title)}</h2>
    ${b.subtitle ? `<p>${esc(b.subtitle)}</p>` : ''}
    ${b.body ? `<p>${esc(b.body)}</p>` : ''}
    ${(b.links ?? []).map((l) => `<a href="${esc(l.url)}">${esc(l.label)}</a>`).join(' ')}
    ${(b.tags ?? []).length ? `<p>${b.tags.map(esc).join(', ')}</p>` : ''}
  </section>`).join('\n')

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: site.meta.name,
  jobTitle: site.meta.role,
  description: site.meta.description,
  url: site.meta.url,
  sameAs: site.beacons.flatMap((b) => (b.links ?? []))
    .map((l) => l.url).filter((u) => /^https?:/.test(u) && !u.includes(site.meta.url)),
}

const injected = html
  .replace('</head>', `
    <meta name="description" content="${esc(site.meta.description)}">
    <meta property="og:title" content="${esc(site.meta.name)} — ${esc(site.meta.role)}">
    <meta property="og:description" content="${esc(site.meta.description)}">
    <meta property="og:type" content="profile">
    <meta property="og:url" content="${esc(site.meta.url)}">
    ${site.meta.ogImage ? `<meta property="og:image" content="${esc(site.meta.url + site.meta.ogImage)}">` : ''}
    <meta name="twitter:card" content="summary_large_image">
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
    </head>`)
  .replace('<div id="root"></div>', `<div id="root"></div>
    <noscript><main>${sections}</main></noscript>
    <div id="seo-fallback" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">
      <h1>${esc(site.meta.name)}</h1>${sections}
    </div>`)

writeFileSync('dist/index.html', injected)
console.log(`prerendered ${site.beacons.length} beacons into dist/index.html`)
```

```jsonc
// package.json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build && node scripts/prerender.mjs",
  "preview": "vite preview"
}
```

### 11.5 Reduced motion

Already wired: `store.reducedMotion` makes `travelTo` instant. Also do:

```ts
// In ParticleField's useFrame, when reducedMotion:
vu.uCurlAmp.value = 4       // gentle drift instead of a storm
vu.uSwirl.value = 1.2
vu.uMaxSpeed.value = 8
```

And in `Post.tsx`, skip `ChromaticAberration` and `Noise` entirely.

### 11.6 Keyboard and screen-reader checklist

- [ ] Every beacon reachable by `Tab` (add a hidden `<button>` per reachable beacon that calls `travelTo`)
- [ ] Visible `:focus-visible` ring on all HUD controls and holo links
- [ ] `Esc` = up a level, `M` = map, `1–9` = jump to Nth neighbour, documented in a `?` overlay
- [ ] `aria-live="polite"` region announcing "Arrived at Work" after each transition
- [ ] Contrast ≥ 4.5:1 for body copy — the glow makes this easy to fail; check with DevTools
- [ ] Test with VoiceOver/NVDA at least once

**Checkpoint 11.** Disable WebGL in `about:config` / DevTools → the site renders as a clean text page.
`curl https://localhost:4173 | grep -c "<section"` after `npm run build && npm run preview` returns
your beacon count. Lighthouse SEO and Accessibility both ≥ 95.

---

## Phase 12 — Deployment

### 12.1 GitHub Actions workflow

`.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/configure-pages@v6
      - uses: actions/upload-pages-artifact@v5
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

Then in the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

### 12.2 Details specific to a user site

- `Raymond1134.github.io` is a **user site**, so it serves from the domain root → `base: '/'` in
  `vite.config.ts`. (A project repo would need `base: '/repo-name/'` and every asset path adjusted.)
- Add `public/.nojekyll` (empty file). Jekyll isn't run by the Actions deploy path, but it costs
  nothing and prevents a whole class of future confusion if you ever switch to branch deploys.
- Hash routing (`#/work`) means **no 404 fallback file is needed**. This is a real advantage of the
  hash approach on Pages — path-based routing would require the `404.html` copy hack.
- Custom domain later: add `public/CNAME` containing the bare domain, set the DNS `ALIAS`/`A` records
  per GitHub's docs, and update `site.meta.url`.

### 12.3 Asset pipeline

Before shipping, run every image through:

```bash
# WebP at quality 82 is the sweet spot for photos on a dark background
npx @squoosh/cli --webp '{"quality":82}' -d public/media public/media-src/*.png
```

Rules:
- Images: `.webp`, max 1600px on the long edge, under 250 KB each.
- Video: `.mp4` (H.264) **and** `.webm` (VP9), max 1280×720, under 4 MB, always with a `poster`.
- Everything in `public/media/`, referenced from `site.json` with a leading `/`.

### 12.4 Pre-launch checklist

- [ ] `npm run build` clean, no TS errors
- [ ] Bundle under ~1.2 MB gzipped (`npx vite-bundle-visualizer` to check; three is ~600 KB of it)
- [ ] Tested in Chrome, Firefox, Safari, and on real devices per [Appendix C](#appendix-c--mobile-qa-script)
- [ ] **Full mobile QA script passed** — this is the checklist that actually gates the deploy
- [ ] Lighthouse **mobile** preset: Performance ≥ 55, A11y ≥ 95, SEO ≥ 95 (run mobile, not desktop —
      the desktop preset will happily give you a 90 on a site that's unusable on a phone)
- [ ] Every external link opens correctly and has `rel="noreferrer noopener"`
- [ ] Deep link to each beacon works in a cold tab
- [ ] Audio defaults to off
- [ ] `robots.txt` and `sitemap.xml` in `public/` (hash URLs aren't separately indexable, so the
      sitemap has one entry — that's expected and correct)
- [ ] Open Graph preview checked at [opengraph.xyz](https://www.opengraph.xyz/)

---

### 12.5 Final wiring

`App.tsx` grew across phases; here's what it should contain by the end, so nothing gets orphaned:

```tsx
export default function App() {
  useViewport()                                     // Phase 2.6 — must run before first paint
  useHashRouting()                                  // Phase 7.1
  const textMode = useStore((s) => s.textMode)

  return (
    <>
      <Canvas /* ...as in Phase 2.2 ... */>
        <Suspense fallback={null}>
          <Scene />
          <Preload all />
        </Suspense>
        <AdaptiveDpr pixelated />
        <QualityGovernor />                         {/* Phase 10.2  — inside Canvas */}
        <VisibilityPause />                         {/* Phase 10.5  — inside Canvas */}
        {import.meta.env.DEV && <Perf position="top-left" />}
      </Canvas>

      <Hud />                                       {/* Phase 7.3 — renders StarMap + BeaconSheet */}
      <FirstVisitHint />                            {/* Phase 4.3 */}
      <AudioBridge />                               {/* Phase 9.3 — outside Canvas */}
      <div className="sr-only" id="seo-content">…</div>  {/* Phase 11.3 */}
      {textMode && <TextMode />}
    </>
  )
}
```

Two placement rules, both of which produce confusing failures if you get them wrong:

- **Inside `<Canvas>`:** anything calling `useFrame` or `useThree` — `QualityGovernor`,
  `VisibilityPause`, everything under `<Scene>`. Outside the R3F context these throw.
- **Outside `<Canvas>`:** anything rendering DOM — `Hud`, `StarMap`, `BeaconSheet`, `AudioBridge`.
  Put DOM inside `<Canvas>` and R3F tries to reconcile it as a three.js object.

`useViewport()` must be at the top of `App` rather than inside a child, because `compact` and
`portrait` are read during the first render of both `HoloPanel` and `CameraRig` — if they land a
frame late you get a visible layout pop on load.

---

## Milestones

Assuming evenings-and-weekends pace. Each milestone is independently demo-able.

| # | Milestone | Phases | Est. | You can show... |
|---|---|---|---|---|
| M1 | **It's alive** | 0–3 | 2–3 days | a churning galaxy of a million particles |
| M2 | **It's a place** | 4–5 | 2 days | clicking a beacon and being swallowed to another |
| M3 | **It says something** | 6 | 2 days | holographic panels with your real content |
| M4 | **It's navigable** | 7 | 1 day | star map, deep links, back button |
| M5 | **It's beautiful** | 8–9 | 2 days | bloom, grain, sound — the actual vibe |
| M6 | **It's professional** | 10–12 | 2 days | fast on a phone, readable without WebGL, live on the internet |

> **Strong advice: don't reorder to put content last.** Get one real project into `site.json` at M3.
> A gorgeous engine full of "Lorem ipsum" is a project you'll abandon; a rough engine showing your
> actual work is a project you'll finish.

> **Equally strong advice: open it on your phone at the end of every milestone**, not at M6. Each
> milestone above has a phone-specific checkpoint for exactly this reason. Touch input is designed in
> at M1 (§2.3) rather than retrofitted, because retrofitting it means rewriting the camera rig, the
> beacon hit-testing, and the panel layout simultaneously — which is how "I'll make it responsive
> later" turns into "I stopped working on it".

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Curl noise too slow at 1M particles | High | High | Phase 10.3 levers, esp. baking to a 3D texture. Ship at 512² if needed — it still looks incredible |
| `postprocessing` / `three` peer conflict on upgrade | High | Medium | Pin both, upgrade `postprocessing` first, `npm ls three` after |
| Half-float precision artifacts on mobile | Medium | Medium | Keep world coordinates under ~400 units; that's why `ringRadius` shrinks with depth |
| `<Html>` elements not receiving bloom looks inconsistent | Medium | Medium | CSS `text-shadow` to fake it; never mix Text and Html for the same element type |
| Transition feels sluggish on repeat visits | Medium | High | 2.6s is the ceiling. If it drags, cut `disperse` to 0.9s. Add "skip transition" after the 3rd travel |
| Motion sickness complaints | Medium | High | Anchored camera already mitigates; `prefers-reduced-motion` respected; text mode always available |
| Recruiter's laptop can't run it | Low | Critical | Text mode + prerendered SEO content (Phase 11) — this is why that phase isn't optional |
| **Look-around drag fires unwanted travels** | **High** | **High** | `TAP_SLOP` check in every 3D pointer handler (§4.1). Test the swipe-ending-on-a-beacon case explicitly |
| **Thermal throttle degrades a phone mid-visit** | **High** | Medium | Continuous-sampling governor + `MAX_TIER.coarse = 'medium'` (§10.5). Never benchmark once at startup |
| **Portrait crops the holo panel** | High | High | Anchor distance solved from the frustum, not hard-coded (§2.5). Check on a 375px viewport, not just a resized desktop window |
| **`EXT_color_buffer_float` missing on an Android GPU → black screen** | Medium | Critical | Check the extension, not `isWebGL2` (§3.6). Fails silently otherwise — no error, just nothing |
| iOS safe-area / home indicator overlaps the bottom bar | Medium | Medium | `viewport-fit=cover` + `env(safe-area-inset-*)` (§0.6, §0.7). Verify in landscape, where it's worst |
| Mobile data cost from eager media/audio | Medium | Medium | `preload: 'none'` on coarse pointers, poster images, lazy audio (§6.7, §9.1) |
| Scope creep into a game engine | **Very high** | High | The milestone table. Ship M6 before building the cohesion grid, free-fly camera, or anything else |

---

## Appendix A — Full file tree

```
Raymond1134.github.io/
├── .github/workflows/deploy.yml
├── public/
│   ├── .nojekyll
│   ├── robots.txt
│   ├── sitemap.xml
│   ├── fonts/           Inter-Regular.woff, Inter-SemiBold.woff
│   ├── media/           *.webp, *.mp4, *.webm
│   ├── audio/           ambient.{webm,m4a}, travel.{webm,m4a}, hover.{webm,m4a}
│   └── docs/            resume.pdf
├── scripts/
│   └── prerender.mjs
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── device.ts               capability detection (coarse pointer, hover, iOS)
│   ├── content/
│   │   ├── site.json          ← the only file you edit to add content
│   │   ├── schema.ts
│   │   ├── layout.ts
│   │   └── index.ts
│   ├── state/
│   │   ├── store.ts
│   │   └── routing.ts
│   ├── input/
│   │   ├── input.ts            mouse + touch + pinch, one normalised result
│   │   └── gyro.ts             opt-in device orientation
│   ├── scene/
│   │   ├── Scene.tsx
│   │   ├── CameraRig.tsx
│   │   ├── Veil.tsx
│   │   ├── Post.tsx
│   │   ├── particles/ParticleField.tsx
│   │   ├── beacons/{Beacon,Beacons}.tsx
│   │   └── ui3d/{HoloPanel,MediaTile,panelLayout}.ts(x)
│   ├── shaders/
│   │   ├── lib/{noise3D,curl}.glsl
│   │   ├── sim/{velocity,position}.frag
│   │   ├── render/{particle.vert,particle.frag}
│   │   └── holo/{panel.vert,panel.frag}
│   ├── ui/
│   │   ├── Hud.tsx             desktop cluster / mobile bottom bar
│   │   ├── StarMap.tsx         SVG constellation + mobile tree list
│   │   ├── BeaconSheet.tsx     mobile bottom sheet for body + links
│   │   ├── FirstVisitHint.tsx
│   │   ├── TextMode.tsx
│   │   ├── useViewport.ts
│   │   └── markdown.ts
│   ├── audio/{audio.ts,AudioBridge.tsx}
│   ├── perf/{tier.ts,QualityGovernor.tsx,VisibilityPause.tsx}
│   ├── dev/Tuning.tsx          (DEV only)
│   └── styles/{global,holo,hud,starmap,sheet,text-mode}.css
├── plan.md
├── vite.config.ts
├── tsconfig.json / tsconfig.app.json
└── package.json
```

---

## Appendix B — Tuning cheat sheet

The dials that matter, and what they do to the feel.

| Uniform | Default | Lower → | Higher → |
|---|---|---|---|
| `uCurlFreq` | 0.011 | long lazy filaments, epic scale | tight turbulent froth, "smaller" world |
| `uCurlAmp` | 14 | calm, glacial | chaotic storm |
| `uSwirl` | 5.5 | drifting cloud | tight vortex, clear rotation axis |
| `uShellSoftness` | 0.55 | diffuse haze that drifts away | hard sphere, obviously artificial |
| `uDamping` | 0.965 | syrupy, heavy | frictionless, particles fly off |
| `uMaxSpeed` | 42 | everything slow and dreamy | streaks, hard to read |
| `uSize` | 0.55 | fine dust, needs more particles | soft blobs, cheap-looking |
| `uSpeedScale` | 18 | everything reads "hot" | only the fastest particles glow |
| `uFogDensity` | 0.0022 | infinite space, no depth cue | claustrophobic, particles vanish nearby |
| `Bloom.luminanceThreshold` | 0.18 | milky, whole screen glows | only cores glow, scene goes dark |
| `SHELL_RADIUS` | 46 | intimate, particles in your face | distant, you feel small |

**Mobile overrides.** These aren't a separate look — they're the same look tuned for a screen held
30cm from your face at a third of the pixel budget:

| Setting | Desktop | `compact` | Why |
|---|---|---|---|
| DPR cap | 2.0 | 1.5 | Fill rate is the bottleneck; phones ship DPR 3–4 |
| `uSize` | 0.55 | 0.34 | Halves additive overdraw, which TBDR mobile GPUs handle worst |
| Particle tier ceiling | `ultra` | `medium` | Thermal headroom, not peak capability |
| Post-processing | 5 passes | bloom only | Each pass is a full framebuffer read+write |
| Panel size | 30 × 17 | 20 × 13 | Title/subtitle only; body moves to the sheet |
| `SHELL_RADIUS` | 46 | 40 | Slightly tighter reads better in a narrow frustum |

**The single best look-dev tip:** get it working, then spend one evening with Leva open and *nothing
else to do*. The difference between "cool tech demo" and "genuinely magical" is entirely in these
numbers, and no amount of planning substitutes for sitting there moving sliders. Do one pass on
desktop and a second, shorter one with the phone in your hand — the particle size and bloom
threshold in particular want different values at arm's length.

---

## Appendix C — Mobile QA script

Run this end to end before every deploy. It takes about ten minutes and catches essentially
everything that separates "works on my desktop" from "works".

### Setup: test on a real device, not the simulator

```bash
npm run dev -- --host
```

Then open `http://<your-LAN-IP>:5173` on your phone. DevTools device emulation gets viewport size
right and gets *everything else* wrong — it uses your desktop GPU, has no thermal behaviour, fires
mouse events with a `pointer: fine` media query in some configurations, and cannot reproduce iOS
Safari's viewport or audio quirks at all. It's useful for layout, useless for verification.

For iOS Safari debugging: Settings → Safari → Advanced → Web Inspector, then attach from Safari on a
Mac (Develop menu). For Android Chrome: `chrome://inspect` on the desktop.

### The script

**Layout and chrome**
- [ ] Portrait: nothing cropped horizontally; the holo panel title fits fully in frame
- [ ] Landscape: bottom bar becomes the left rail; sheet moves to the side
- [ ] Rotate mid-session — layout re-flows with no reload and no stuck state
- [ ] iPhone with a notch: no black bars top or bottom; content clears the Dynamic Island
- [ ] iPhone: bottom bar sits above the home indicator, portrait **and** landscape
- [ ] Scroll the sheet to its end — the page behind does not rubber-band
- [ ] Double-tap anywhere — the page does not zoom
- [ ] Phone set to largest system text size — nothing overlaps or clips

**Input**
- [ ] Drag anywhere rotates the view; nothing scrolls
- [ ] Pinch dollies the scene; the *page* never zooms
- [ ] Tap a beacon → travels, first try
- [ ] **Swipe across the screen and release with your finger over a beacon → nothing happens**
- [ ] Double-tap recentres the view
- [ ] After ~10s of no touch, the view drifts gently back to centre — it never snaps
- [ ] Every bottom-bar button is reachable one-handed and hits on the first tap
- [ ] Tap a beacon, then tap elsewhere — no beacon is left stuck in its hover state

**Content and navigation**
- [ ] Map opens from the bar (not just `M`) and shows a scrollable list, 56px rows
- [ ] Every beacon reachable from the map in one tap
- [ ] Back button in the bar works at every depth and is disabled at the root
- [ ] Links in the sheet open correctly; `mailto:` opens the mail app
- [ ] Video shows a poster and plays on tap; it does **not** go fullscreen
- [ ] Deep link `#/aetherweb` pasted into a fresh mobile tab lands correctly
- [ ] Browser back gesture returns to the previous beacon rather than leaving the site

**Performance and power**
- [ ] First meaningful paint under 3s on a throttled 4G profile
- [ ] Stable frame rate after 3 minutes — settled, not continuously degrading
- [ ] Device is not uncomfortably warm after 5 minutes
- [ ] Background the tab, wait 30s, return — resumes cleanly, no CPU burn while hidden
- [ ] Low Power Mode / battery saver: still usable, drops to a lower tier
- [ ] Total transfer on first load under ~3MB (Network tab, disable cache)

**Audio and fallback**
- [ ] Silent on load; toggle enables it
- [ ] iOS hardware silent switch mutes the ambient bed
- [ ] Choice persists across a reload
- [ ] `≡ TEXT` renders the plain page, which scrolls and zooms normally
- [ ] Disable WebGL (Safari → Develop → Experimental Features) → text mode, not a blank screen

### Minimum device matrix

You don't need a lab. Cover these four and you've covered the realistic distribution:

| Device class | Why it matters |
|---|---|
| Any iPhone, Safari | ~50% of US mobile traffic; the strictest audio/viewport quirks |
| A **mid-range** Android (not a flagship), Chrome | Where the perf budget is actually decided |
| iPad or Android tablet, landscape | `coarse` pointer but **not** `compact` — exercises the in-between branch |
| Desktop with a touchscreen | `coarse: false`, `hover: true`, touch events present — catches bad assumptions |

That third row is the one people skip and the one that breaks: a tablet in landscape is touch-driven
but wide, so it gets the desktop layout *with* touch input. If you only ever tested "phone" and
"desktop", that combination is untested code.

---

## References

- [React Three Fiber v9 migration guide](https://r3f.docs.pmnd.rs/tutorials/v9-migration-guide) — React 19 requirements, async `gl` prop for future WebGPU
- [three.js `GPUComputationRenderer` source](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/misc/GPUComputationRenderer.js) — read the header comment; it's the best docs that exist for it
- [webgl-noise (MIT)](https://github.com/stegu/webgl-noise) — the `snoise` implementation vendored in Phase 0.5
- [Nicolas Barradeau — FBO particles](https://barradeau.com/blog/?p=621) — the foundational explainer for the ping-pong technique
- [Three.js Journey — GPGPU flow field particles](https://threejs-journey.com/lessons/gpgpu-flow-field-particles-shaders) — paid, but the single best walkthrough of this exact effect
- [pmndrs/postprocessing](https://github.com/pmndrs/postprocessing) — effect reference and the `mipmapBlur` bloom
- [drei docs](https://drei.docs.pmnd.rs) — `Text`, `Html`, `Billboard`, `AdaptiveDpr`
- [three.js WebGPURenderer manual](https://threejs.org/manual/en/webgpurenderer.html) — for the eventual TSL migration
- [GitHub Pages with Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) — the deploy path used in Phase 12
