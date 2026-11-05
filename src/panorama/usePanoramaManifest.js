import { useEffect, useState } from 'react'
import { readPanoramaManifest } from './panoramaSource.js'

const cache = new Map()

function load(url) {
  if (!cache.has(url)) {
    // A transition can have two consumers of the same fetch. Unmounting one
    // must leave the response available to the other consumer.
    const request = fetch(url, { cache: 'no-cache', signal: AbortSignal.timeout(15000) }).then(async (response) => {
      if (!response.ok) throw new Error(`Manifest ${response.status}`)
      return readPanoramaManifest(await response.json(), response.url || url)
    }).catch((error) => {
      cache.delete(url)
      throw error
    })
    cache.set(url, request)
  }
  return cache.get(url)
}

export function usePanoramaManifest(url) {
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!url) return undefined
    let active = true
    load(url).then((manifest) => {
      if (active) setResult({ url, manifest, loading: false, error: null })
    }).catch((error) => {
      if (active) setResult({ url, manifest: null, loading: false, error })
    })
    return () => { active = false }
  }, [url])

  if (result && result.url === url) return result
  return { manifest: null, loading: Boolean(url), error: null }
}
