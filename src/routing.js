export function getAppRoute(pathname = window.location.pathname) {
  const clean = pathname.replace(/\/+$/, '') || '/'

  if (clean === '/editor' || clean.startsWith('/editor/')) {
    return {
      kind: 'editor',
      projectId: decodeURIComponent(clean.split('/')[2] || 'default'),
    }
  }

  const previewMatch = clean.match(/^\/preview\/([^/]+)$/)
  if (previewMatch) {
    return {
      kind: 'preview',
      projectId: decodeURIComponent(previewMatch[1]),
    }
  }

  const viewerMatch = clean.match(/^\/v\/([^/]+)$/)
  if (viewerMatch) {
    return {
      kind: 'viewer',
      projectId: decodeURIComponent(viewerMatch[1]),
    }
  }

  return { kind: 'viewer', projectId: 'default' }
}
