const manifestCache = new Map()

export async function loadPanoramaManifest(url, { signal } = {}) {
  if (!url) throw new Error('Panorama manifest URL is required')
  if (manifestCache.has(url)) return manifestCache.get(url)

  const request = fetch(url, { signal, cache: 'no-cache' })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Panorama manifest failed (${response.status})`)
      const manifest = await response.json()
      if (manifest?.projection !== 'cubemap-multires') {
        throw new Error(`Unsupported panorama projection: ${manifest?.projection || 'unknown'}`)
      }
      return manifest
    })
    .catch((error) => {
      manifestCache.delete(url)
      throw error
    })

  manifestCache.set(url, request)
  return request
}

export function clearPanoramaManifestCache(url) {
  if (url) manifestCache.delete(url)
  else manifestCache.clear()
}
