const GLYPHS: Record<string, string> = {
  github: '◆',
  linkedin: '▣',
  instagram: '◉',
  devpost: '⬡',
  mail: '✉',
  phone: '✆',
  external: '↗',
  doc: '▤',
  play: '▶',
}

export function glyph(icon?: string): string {
  return GLYPHS[icon ?? 'external'] ?? '↗'
}
