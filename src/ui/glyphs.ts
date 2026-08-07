const GLYPHS: Record<string, string> = {
  github: '◆',
  linkedin: '▣',
  mail: '✉',
  phone: '✆',
  external: '↗',
  doc: '▤',
  play: '▶',
}

export function glyph(icon?: string): string {
  return GLYPHS[icon ?? 'external'] ?? '↗'
}
