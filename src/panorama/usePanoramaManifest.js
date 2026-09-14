import { useEffect, useState } from 'react'
const cache = new Map()
async function load(url, signal) {
  if (!cache.has(url)) cache.set(url, fetch(url, { cache: 'no-cache', signal }).then(async (r) => { if (!r.ok) throw new Error(`Manifest ${r.status}`); const m = await r.json(); if (m.kind !== 'multires-cubemap' || m.projection !== 'cubemap-multires') throw new Error('Unsupported panorama manifest'); return m }).catch((e) => { cache.delete(url); throw e }))
  return cache.get(url)
}
export function usePanoramaManifest(url) {
  const [state, setState] = useState({ manifest: null, loading: Boolean(url), error: null })
  useEffect(() => { if (!url) { setState({ manifest: null, loading: false, error: null }); return } const c = new AbortController(); setState({ manifest: null, loading: true, error: null }); load(url, c.signal).then((manifest) => setState({ manifest, loading: false, error: null })).catch((error) => { if (error.name !== 'AbortError') setState({ manifest: null, loading: false, error }) }); return () => c.abort() }, [url])
  return state
}
