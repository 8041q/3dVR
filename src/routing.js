export function getAppRoute(pathname = window.location.pathname) {
  const clean = pathname.replace(/\/+$/, '') || '/'
  if (clean === '/editor' || clean.startsWith('/editor/')) return { kind: 'editor', projectId: decodeURIComponent(clean.split('/')[2] || 'default') }
  const match = clean.match(/^\/v\/([^/]+)$/)
  if (match) return { kind: 'viewer', projectId: decodeURIComponent(match[1]) }
  return { kind: 'viewer', projectId: 'default' }
}
