const GLYPHS: Record<string, string> = {
  github: '◆',
  linkedin: '▣',
  mail: '✉',
  external: '↗',
  doc: '▤',
  play: '▶',
}

export function glyph(icon?: string): string {
  return GLYPHS[icon ?? 'external'] ?? '↗'
}
