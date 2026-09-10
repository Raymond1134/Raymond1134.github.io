const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const SAFE_URL = /^(https?:|mailto:|tel:|#)/i
const EXTERNAL = /^https?:/i

const link = (_: string, label: string, url: string) => {
  if (!SAFE_URL.test(url)) return label
  return EXTERNAL.test(url)
    ? `<a href="${url}" target="_blank" rel="noreferrer noopener">${label}</a>`
    : `<a href="${url}">${label}</a>`
}

export function renderInline(src: string): string {
  return escapeHtml(src)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, link)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}
