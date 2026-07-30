# Aetherweb

An ethereal, particle-driven 3D personal site — a GPGPU curl-noise particle
field you drift through, with glowing beacons as pages. Deployed to
[raymond1134.github.io](https://raymond1134.github.io).

Content is data: every page is a beacon defined in
[`src/content/site.json`](src/content/site.json), validated with zod and laid
out automatically. Copy a JSON object, get a new beacon.

## Stack

React 19 · react-three-fiber · three.js (WebGL2, `GPUComputationRenderer`) ·
zustand · TypeScript · Vite

## Develop

```bash
npm install
npm run dev       # serves on the LAN too (--host), for phone testing
npm run build     # tsc -b && vite build
npm run lint
```

The build plan, phase by phase, lives in [`notes/plan.md`](notes/plan.md).

## Credits

3D simplex noise (`src/shaders/lib/noise3D.glsl`) from
[webgl-noise](https://github.com/stegu/webgl-noise) by Ashima Arts /
Stefan Gustavson (MIT).
