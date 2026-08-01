import * as THREE from 'three'

/* Shared soft radial glow sprite. */
let glowTex: THREE.Texture | null = null

const chromaticCache = new Map<string, THREE.Texture>()

export function chromaticGlowTexture(tint: THREE.Color): THREE.Texture {
  const key = tint.getHexString()
  const hit = chromaticCache.get(key)
  if (hit) return hit

  const s = 256
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(s, s)

  const core = { r: 255, g: 244, b: 226 }
  const sc = tint.clone().convertLinearToSRGB()
  const t = { r: sc.r * 255, g: sc.g * 255, b: sc.b * 255 }
  const edge = {
    r: (t.r * 0.4 + 138 * 0.6) * 0.6,
    g: (t.g * 0.4 + 147 * 0.6) * 0.6,
    b: (t.b * 0.4 + 184 * 0.6) * 0.6,
  }
  const smooth = (a: number, b: number, x: number) => {
    const u = Math.min(1, Math.max(0, (x - a) / (b - a)))
    return u * u * (3 - 2 * u)
  }

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4
      const r = Math.hypot(x - s / 2 + 0.5, y - s / 2 + 0.5) / (s / 2)
      const t1 = smooth(0.0, 0.35, r)
      const t2 = smooth(0.45, 1.0, r)
      const dith = Math.random() - 0.5
      img.data[i + 0] = core.r + (t.r - core.r) * t1 + (edge.r - t.r) * t2 + dith
      img.data[i + 1] = core.g + (t.g - core.g) * t1 + (edge.g - t.g) * t2 + dith
      img.data[i + 2] = core.b + (t.b - core.b) * t1 + (edge.b - t.b) * t2 + dith
      img.data[i + 3] = r >= 1 ? 0 : (255 / (1 + 18 * r * r)) * (1 - r * r) + dith
    }
  }
  ctx.putImageData(img, 0, 0)

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  chromaticCache.set(key, tex)
  return tex
}

export function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex
  const s = 128
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0.0, 'rgba(255,255,255,1)')
  g.addColorStop(0.08, 'rgba(255,255,255,0.8)')
  g.addColorStop(0.22, 'rgba(255,255,255,0.3)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.07)')
  g.addColorStop(0.78, 'rgba(255,255,255,0.015)')
  g.addColorStop(1.0, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
  glowTex = new THREE.CanvasTexture(c)
  glowTex.colorSpace = THREE.SRGBColorSpace
  return glowTex
}
