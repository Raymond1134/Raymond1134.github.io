import type { Quality } from '@/state/store'
import { isCoarsePointer } from '@/device'

const DISCRETE = /nvidia|geforce|rtx |gtx |radeon (rx|pro)|apple m\d/i
const SOFTWARE = /swiftshader|llvmpipe|software|basic render/i

export const GL_ATTRIBUTES: WebGLContextAttributes = {
  antialias: false,
  alpha: false,
  powerPreference: isCoarsePointer() ? 'default' : 'high-performance',
  stencil: false,
  depth: true,
  failIfMajorPerformanceCaveat: false,
}

const probe = () => {
  if (typeof document === 'undefined') return { webgl2: false, renderer: '' }
  try {
    const gl = document.createElement('canvas').getContext('webgl2', GL_ATTRIBUTES)
    if (!gl) return { webgl2: false, renderer: '' }
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '')
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return { webgl2: true, renderer }
  } catch {
    return { webgl2: false, renderer: '' }
  }
}

const gpu = probe()
const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 0) : 0

export const WEBGL2 = gpu.webgl2
export const SOFTWARE_GL = SOFTWARE.test(gpu.renderer)

const pickTier = (): Quality => {
  if (SOFTWARE_GL) return 'low'
  if (isCoarsePointer()) return 'medium'
  if (DISCRETE.test(gpu.renderer) && cores >= 8) return 'ultra'
  if (cores <= 4) return 'medium'
  return 'high'
}

export const BOOT_TIER = pickTier()
